/**
 * Round 4 hardening: HTTP adapter must wrap non-JSON-RPC HTTP error responses
 * (rate limits, auth failures, etc.) into a synthetic JSON-RPC envelope so
 * downstream suites see a usable error code + message instead of crashing on
 * `undefined.slice` / `undefined.code`.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { HttpTargetAdapter } from "../src/targets/http.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);
    if (url.pathname === "/rate-limit") {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "rate_limit_exceeded",
          error_description: "Max 60 requests per minute per tenant",
          retry_after: 60,
        }),
      );
      return;
    }
    if (url.pathname === "/unauthorized") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized", message: "missing bearer" }));
      return;
    }
    if (url.pathname === "/empty-200") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("");
      return;
    }
    if (url.pathname === "/text-error") {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("service unavailable");
      return;
    }
    if (url.pathname === "/jsonrpc-error") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "method not found" },
        }),
      );
      return;
    }
    if (url.pathname === "/jsonrpc-result") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("HttpTargetAdapter — Round 4 robust HTTP error handling", () => {
  it("wraps HTTP 429 + non-jsonrpc body into -32000 envelope", async () => {
    const adapter = new HttpTargetAdapter({
      kind: "http",
      url: `${baseUrl}/rate-limit`,
    });
    await adapter.open();
    try {
      const res = await adapter.request("tools/list");
      expect("error" in res).toBe(true);
      if ("error" in res) {
        expect(res.error.code).toBe(-32000);
        expect(res.error.message).toMatch(/rate.limit|Max 60/i);
      }
    } finally {
      await adapter.close();
    }
  });

  it("wraps HTTP 401 + non-jsonrpc body into -32001 envelope", async () => {
    const adapter = new HttpTargetAdapter({
      kind: "http",
      url: `${baseUrl}/unauthorized`,
    });
    await adapter.open();
    try {
      const res = await adapter.request("tools/list");
      expect("error" in res).toBe(true);
      if ("error" in res) {
        expect(res.error.code).toBe(-32001);
        expect(res.error.message).toMatch(/missing bearer|unauthorized/i);
      }
    } finally {
      await adapter.close();
    }
  });

  it("wraps HTTP 200 + empty body as -32603", async () => {
    const adapter = new HttpTargetAdapter({
      kind: "http",
      url: `${baseUrl}/empty-200`,
    });
    await adapter.open();
    try {
      const res = await adapter.request("tools/list");
      expect("error" in res).toBe(true);
      if ("error" in res) {
        expect(res.error.code).toBe(-32603);
        expect(res.error.message).toMatch(/empty|unparseable/i);
      }
    } finally {
      await adapter.close();
    }
  });

  it("wraps HTTP 503 + text body into -32603 envelope", async () => {
    const adapter = new HttpTargetAdapter({
      kind: "http",
      url: `${baseUrl}/text-error`,
    });
    await adapter.open();
    try {
      const res = await adapter.request("tools/list");
      expect("error" in res).toBe(true);
      if ("error" in res) {
        expect(res.error.code).toBe(-32603);
        expect(res.error.message).toMatch(/HTTP 503|service unavailable/i);
      }
    } finally {
      await adapter.close();
    }
  });

  it("passes through valid JSON-RPC error envelopes unchanged", async () => {
    const adapter = new HttpTargetAdapter({
      kind: "http",
      url: `${baseUrl}/jsonrpc-error`,
    });
    await adapter.open();
    try {
      const res = await adapter.request("tools/list");
      expect("error" in res).toBe(true);
      if ("error" in res) {
        expect(res.error.code).toBe(-32601); // unchanged from server response
        expect(res.error.message).toBe("method not found");
      }
    } finally {
      await adapter.close();
    }
  });

  it("passes through valid JSON-RPC result envelopes unchanged", async () => {
    const adapter = new HttpTargetAdapter({
      kind: "http",
      url: `${baseUrl}/jsonrpc-result`,
    });
    await adapter.open();
    try {
      const res = await adapter.request("tools/list");
      expect("result" in res).toBe(true);
      if ("result" in res) {
        expect(res.result).toEqual({ ok: true });
      }
    } finally {
      await adapter.close();
    }
  });
});
