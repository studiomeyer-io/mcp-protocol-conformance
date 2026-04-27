/**
 * JSON-RPC 2.0 compliance suite.
 *
 * Validates that the target produces the canonical error codes:
 *  -32700 parse error
 *  -32600 invalid request
 *  -32601 method not found
 *  -32602 invalid params
 *  -32603 internal error
 *
 * Spec reference: https://www.jsonrpc.org/specification
 */

import type {
  ComplianceReport,
  ServerTarget,
  SpecVersion,
} from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import type { JsonRpcResponse, JsonRpcError } from "../targets/types.js";
import { isJsonRpcError } from "../targets/types.js";
import { makeSuiteRunner } from "./util.js";
import { initializeAdapter } from "./helpers.js";

function isError(
  response: JsonRpcResponse | null,
  code: number,
): response is JsonRpcError {
  return !!response && isJsonRpcError(response) && response.error.code === code;
}

export async function runJsonRpcCompliance(
  target: ServerTarget,
  _specVersion: SpecVersion,
): Promise<ComplianceReport> {
  const runner = makeSuiteRunner("jsonrpc");
  runner.start();
  const adapter = createTargetAdapter(target);

  try {
    await adapter.open();
    // Round 4 fix: many MCP servers reject any non-`initialize` method with
    // `-32000 Server not initialized` until the handshake is complete (see
    // memory.studiomeyer.io v3.16.7 in real-tenant smoke). Doing the
    // handshake first makes the JSON-RPC error-code matrix observable on
    // strict-init servers without changing the meaning of the checks.
    await initializeAdapter(adapter);

    // 1. method-not-found → -32601
    {
      const start = Date.now();
      const res = await adapter.request("nonexistent/method/xyz");
      runner.add({
        id: "jsonrpc-method-not-found",
        description: "Unknown method returns -32601",
        status: isError(res, -32601) ? "pass" : "fail",
        message: isError(res, -32601)
          ? undefined
          : `Expected -32601 from nonexistent/method/xyz, got: ${JSON.stringify(res).slice(0, 200)}`,
        durationMs: Date.now() - start,
      });
    }

    // 2. invalid-params → -32602 (call tools/call with wrong shape)
    {
      const start = Date.now();
      const res = await adapter.request("tools/call", {
        // missing required `name`
        unexpectedField: 42,
      });
      runner.add({
        id: "jsonrpc-invalid-params",
        description: "Invalid params returns -32602 (or -32600/-32603)",
        status:
          isError(res, -32602) || isError(res, -32600) || isError(res, -32603)
            ? "pass"
            : "fail",
        message:
          isError(res, -32602) || isError(res, -32600) || isError(res, -32603)
            ? undefined
            : `Expected -32602 (or -32600/-32603) for malformed tools/call, got: ${JSON.stringify(res).slice(0, 200)}`,
        durationMs: Date.now() - start,
      });
    }

    // 3. parse-error → -32700 (raw malformed JSON, stdio only — many HTTP
    //    transports return HTTP 400 on bad JSON without a JSON-RPC envelope,
    //    which is acceptable per spec, so we skip this on http)
    if (target.kind === "stdio") {
      const start = Date.now();
      await adapter.sendRaw("{ this is not valid json ");
      const res = await adapter.readNext(2000);
      runner.add({
        id: "jsonrpc-parse-error",
        description: "Malformed JSON returns -32700",
        status: isError(res, -32700) ? "pass" : "warn",
        message: isError(res, -32700)
          ? undefined
          : "Server did not respond with -32700 to malformed JSON. Some servers silently drop instead. Acceptable but flagged.",
        durationMs: Date.now() - start,
      });
    } else {
      runner.add({
        id: "jsonrpc-parse-error",
        description: "Malformed JSON returns -32700",
        status: "skip",
        message:
          "Skipped on HTTP transport: HTTP 400 response is acceptable per spec.",
      });
    }

    // 4. invalid-request → -32600 (jsonrpc field missing)
    {
      const start = Date.now();
      await adapter.sendRaw(
        JSON.stringify({ id: 999, method: "ping" }), // missing jsonrpc:"2.0"
      );
      const res = await adapter.readNext(2000);
      runner.add({
        id: "jsonrpc-invalid-request",
        description: "Missing jsonrpc field returns -32600",
        status: isError(res, -32600) ? "pass" : "warn",
        message: isError(res, -32600)
          ? undefined
          : "Server did not respond with -32600 to missing jsonrpc field. Some servers tolerate this. Flagged but not failed.",
        durationMs: Date.now() - start,
      });
    }
  } catch (err) {
    runner.add({
      id: "jsonrpc-suite-fatal",
      description: "Suite failed with an uncaught error",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await adapter.close();
  }

  return runner.finish();
}
