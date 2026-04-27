/**
 * Transport conformance suite.
 *
 * Verifies that the chosen transport behaves per spec:
 *  - stdio: line-delimited JSON, child responds within timeout
 *  - http: POST /mcp returns either application/json or text/event-stream,
 *          allocates Mcp-Session-Id on first initialize.
 */

import type {
  ServerTarget,
  TransportReport,
} from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import { HttpTargetAdapter } from "../targets/http.js";
import { isJsonRpcError } from "../targets/types.js";
import { makeSuiteRunner } from "./util.js";

export async function runTransportSuite(
  target: ServerTarget,
  transport: "stdio" | "http" | "both" = "both",
): Promise<TransportReport> {
  const runner = makeSuiteRunner("transport");
  runner.start();

  const wantStdio = transport === "stdio" || transport === "both";
  const wantHttp = transport === "http" || transport === "both";

  if (target.kind === "stdio" && !wantStdio) {
    runner.add({
      id: "transport-mismatch",
      description: "Requested HTTP transport but target is stdio",
      status: "skip",
    });
    return runner.finish();
  }
  if (target.kind === "http" && !wantHttp) {
    runner.add({
      id: "transport-mismatch",
      description: "Requested stdio transport but target is HTTP",
      status: "skip",
    });
    return runner.finish();
  }

  const adapter = createTargetAdapter(target);
  try {
    await adapter.open();

    // 1. open + ping roundtrip within budget
    const start = Date.now();
    const res = await adapter.request("ping", {}, { timeoutMs: 5000 });
    const elapsed = Date.now() - start;

    runner.add({
      id: "transport-ping-roundtrip",
      description: `${target.kind} ping roundtrip under 5s`,
      status: isJsonRpcError(res)
        ? res.error.code === -32601
          ? "warn"
          : "fail"
        : "pass",
      message: isJsonRpcError(res)
        ? res.error.code === -32601
          ? "ping not implemented (optional in 2024-11-05, required in 2025-03-26+)"
          : `ping error: ${res.error.code} ${res.error.message}`
        : undefined,
      durationMs: elapsed,
    });

    // 2. session-id behaviour for HTTP
    if (target.kind === "http") {
      const httpAdapter = adapter as HttpTargetAdapter;
      // We need an initialize first to allocate session-id
      const initStart = Date.now();
      const initRes = await httpAdapter.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mcp-protocol-conformance", version: "0.1.0" },
      });
      const sid = httpAdapter.getSessionId();
      runner.add({
        id: "transport-http-session-id",
        description: "HTTP server allocates Mcp-Session-Id header on initialize",
        status: isJsonRpcError(initRes)
          ? "fail"
          : sid
            ? "pass"
            : "warn",
        message: isJsonRpcError(initRes)
          ? `initialize errored: ${initRes.error.code} ${initRes.error.message}`
          : sid
            ? undefined
            : "Server did not allocate Mcp-Session-Id. Acceptable for stateless servers but flagged.",
        durationMs: Date.now() - initStart,
      });
    }
  } catch (err) {
    runner.add({
      id: "transport-suite-fatal",
      description: "Suite failed with an uncaught error",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await adapter.close();
  }

  return runner.finish();
}
