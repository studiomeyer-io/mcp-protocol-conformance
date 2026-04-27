/**
 * Streamable HTTP transport adapter (MCP spec 2025-03-26+).
 *
 * Sends each JSON-RPC request as POST /mcp. Responses are returned
 * either inline (Content-Type: application/json) or as a single SSE
 * event (Content-Type: text/event-stream). For full session support
 * we honour the Mcp-Session-Id header issued by the server on
 * initialize.
 */

import { setTimeout as delay } from "node:timers/promises";
import type { HttpTarget } from "../types.js";
import type {
  JsonRpcResponse,
  TargetAdapter,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MCP_SESSION_HEADER = "mcp-session-id";

export class HttpTargetAdapter implements TargetAdapter {
  private readonly target: HttpTarget;
  private sessionId: string | null = null;
  private nextId = 1;
  private opened = false;
  private readonly unmatchedQueue: JsonRpcResponse[] = [];

  constructor(target: HttpTarget) {
    this.target = target;
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(this.target.headers ?? {}),
      ...(extra ?? {}),
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    return headers;
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<JsonRpcResponse<T>> {
    if (!this.opened) throw new Error("Adapter not opened");
    const id = this.nextId++;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    });

    const ctrl = new AbortController();
    const timeout = setTimeout(
      () => ctrl.abort(),
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    let res: Response;
    try {
      res = await fetch(this.target.url, {
        method: "POST",
        headers: this.buildHeaders(),
        body,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    // Capture session id when the server allocates one (initialize)
    const sid = res.headers.get(MCP_SESSION_HEADER);
    if (sid && !this.sessionId) {
      this.sessionId = sid;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      const parsed = parseSseToJsonRpc(text);
      if (!parsed) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message: "No JSON-RPC payload found in SSE response",
          },
        };
      }
      return parsed as JsonRpcResponse<T>;
    }

    // Round 4 fix: robust HTTP-error handling. Real-tenant runs against
    // memory.studiomeyer.io exposed two issues with the previous logic:
    //  1) HTTP 429 (rate-limit) with `application/json` content-type fell
    //     through to JSON.parse, which produced a non-JSON-RPC body
    //     `{"error":"rate_limit_exceeded","error_description":"..."}`.
    //     Downstream code then read `.error.code` / `.error.message` and
    //     got `undefined`, producing useless "undefined undefined" reports.
    //  2) HTTP 401/403/404 with JSON bodies hit the same problem.
    // Strategy: if the body is a valid JSON-RPC envelope, return it as-is.
    // Otherwise wrap the HTTP error in a synthetic JSON-RPC envelope with
    // a sensible JSON-RPC error code. This keeps the conformance report
    // legible even against servers that mix HTTP and JSON-RPC error layers.
    let bodyText: string;
    try {
      bodyText = await res.text();
    } catch {
      bodyText = "";
    }
    let parsedBody: unknown = null;
    if (bodyText.length > 0) {
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        parsedBody = null;
      }
    }
    const isJsonRpcEnvelope =
      parsedBody !== null &&
      typeof parsedBody === "object" &&
      (parsedBody as Record<string, unknown>)["jsonrpc"] === "2.0" &&
      (("error" in (parsedBody as object) &&
        typeof (parsedBody as Record<string, unknown>)["error"] === "object") ||
        "result" in (parsedBody as object));

    if (isJsonRpcEnvelope) {
      return parsedBody as JsonRpcResponse<T>;
    }

    if (!res.ok) {
      const httpCode = res.status;
      const httpToJsonRpc: Record<number, number> = {
        400: -32600, // invalid request
        401: -32001, // unauthorized — server-defined range
        403: -32001, // forbidden
        404: -32601, // method-not-found-like
        429: -32000, // rate-limited
      };
      const jsonrpcCode = httpToJsonRpc[httpCode] ?? -32603;
      const bodyObj =
        parsedBody !== null && typeof parsedBody === "object"
          ? (parsedBody as Record<string, unknown>)
          : null;
      const messageFromBody =
        bodyObj?.["error_description"] ??
        bodyObj?.["message"] ??
        bodyObj?.["error"];
      const message =
        typeof messageFromBody === "string"
          ? messageFromBody
          : `HTTP ${httpCode}: ${res.statusText}`;
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: jsonrpcCode,
          message,
          data: { httpStatus: httpCode, body: parsedBody ?? bodyText.slice(0, 200) },
        },
      };
    }

    if (parsedBody === null) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: `HTTP 200 but body was empty or unparseable (${bodyText.length} bytes)`,
        },
      };
    }

    return parsedBody as JsonRpcResponse<T>;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (!this.opened) throw new Error("Adapter not opened");
    const body = JSON.stringify({
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    });
    await fetch(this.target.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body,
    });
  }

  async sendRaw(payload: string): Promise<void> {
    if (!this.opened) throw new Error("Adapter not opened");
    const res = await fetch(this.target.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: payload,
    });
    // Drain body to avoid leaks even if we ignore the response
    const text = await res.text();
    if (text) {
      const parsed = parseHttpBody(text, res.headers.get("content-type") ?? "");
      if (parsed) this.unmatchedQueue.push(parsed);
    }
  }

  async readNext(
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<JsonRpcResponse | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const next = this.unmatchedQueue.shift();
      if (next) return next;
      await delay(20);
    }
    return null;
  }

  async close(): Promise<void> {
    if (!this.opened) return;
    this.opened = false;
    if (this.sessionId) {
      try {
        await fetch(this.target.url, {
          method: "DELETE",
          headers: this.buildHeaders(),
        });
      } catch {
        // best-effort
      }
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

function parseSseToJsonRpc(sse: string): JsonRpcResponse | null {
  const lines = sse.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const joined = dataLines.join("\n");
  try {
    return JSON.parse(joined) as JsonRpcResponse;
  } catch {
    return null;
  }
}

function parseHttpBody(
  body: string,
  contentType: string,
): JsonRpcResponse | null {
  if (contentType.includes("text/event-stream")) {
    return parseSseToJsonRpc(body);
  }
  try {
    return JSON.parse(body) as JsonRpcResponse;
  } catch {
    return null;
  }
}
