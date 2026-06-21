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
  specVersion: SpecVersion,
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
    await initializeAdapter(adapter, specVersion);

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

    // 1b. response-envelope mutual exclusivity → JSON-RPC 2.0 §5.
    //     A response object MUST contain either `result` or `error`, never
    //     both and never neither. `ping` is the cheapest required method to
    //     probe a well-formed *success* envelope; the method-not-found probe
    //     above already exercised a well-formed *error* envelope. Servers that
    //     emit `{ result, error: null }` (a common serialiser default) or
    //     `{ result, error: {...} }` (a real bug) are flagged here — no other
    //     suite catches this, and the harness's own isJsonRpcError() narrows
    //     such hybrids to "not an error", so without this check the violation
    //     would pass silently.
    {
      const start = Date.now();
      const ping = (await adapter.request("ping")) as unknown as Record<
        string,
        unknown
      >;
      const hasResult = "result" in ping && ping["result"] !== undefined;
      const errVal = ping["error"];
      const hasRealError =
        errVal !== undefined &&
        errVal !== null &&
        typeof errVal === "object" &&
        typeof (errVal as { code?: unknown }).code === "number";
      const hasNullishError = "error" in ping && !hasRealError;
      let status: "pass" | "fail" | "warn";
      let message: string | undefined;
      if (hasResult && hasRealError) {
        status = "fail";
        message =
          "Response carries both 'result' and a real 'error' object — JSON-RPC 2.0 forbids both in one response.";
      } else if (!hasResult && !hasRealError) {
        // ping not implemented (optional pre-2025-03-26) surfaces as an error
        // envelope, which is fine; a truly empty envelope is the violation.
        status = "warn";
        message =
          "ping response carries neither a 'result' nor a valid 'error' object — empty JSON-RPC envelope.";
      } else if (hasResult && hasNullishError) {
        status = "warn";
        message =
          "Response carries 'result' alongside a null/!code 'error' field. Tolerated by this harness, but a strict JSON-RPC 2.0 success response should omit 'error' entirely.";
      } else {
        status = "pass";
      }
      runner.add({
        id: "jsonrpc-response-envelope",
        description:
          "Response contains exactly one of result/error (JSON-RPC 2.0 §5)",
        status,
        message,
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
