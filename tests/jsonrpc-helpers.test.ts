/**
 * Unit tests for isJsonRpcError — the load-bearing response classifier used by
 * every suite. A wrong verdict here turns a passing roundtrip into a spurious
 * FAIL/WARN (or vice-versa) across the whole harness, so the edge cases are
 * pinned explicitly.
 *
 * Spec basis (verified against the MCP schema's `Error` interface and
 * JSON-RPC 2.0 §5): an error response carries an `error` member that is an
 * object with a numeric `code`; a success response carries `result` and omits
 * `error`. `error: null`, `error` without a numeric `code`, and a non-object
 * `error` are NOT error responses.
 */
import { describe, expect, it } from "vitest";
import { isJsonRpcError } from "../src/targets/types.js";
import type { JsonRpcResponse } from "../src/targets/types.js";

// Most fixtures below are intentionally off-spec wire shapes a real server
// might emit; we cast through unknown so the test can assert the runtime
// narrowing without fighting the compile-time union.
function asResponse(v: unknown): JsonRpcResponse {
  return v as JsonRpcResponse;
}

describe("isJsonRpcError", () => {
  it("returns true for a well-formed error envelope", () => {
    const r = asResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    });
    expect(isJsonRpcError(r)).toBe(true);
  });

  it("returns true for an error envelope with a data payload", () => {
    const r = asResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32002, message: "Resource not found", data: { uri: "x" } },
    });
    expect(isJsonRpcError(r)).toBe(true);
  });

  it("returns false for a success envelope (result only)", () => {
    const r = asResponse({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    expect(isJsonRpcError(r)).toBe(false);
  });

  it("returns false when result is present and error is null (serialiser default)", () => {
    // The core regression: { result, error: null } is a SUCCESS response. A
    // bare `"error" in response` check would misclassify this as an error and
    // fail an otherwise-passing roundtrip.
    const r = asResponse({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
      error: null,
    });
    expect(isJsonRpcError(r)).toBe(false);
  });

  it("returns false when error is null and no result is present", () => {
    const r = asResponse({ jsonrpc: "2.0", id: 1, error: null });
    expect(isJsonRpcError(r)).toBe(false);
  });

  it("returns false when error is an object without a numeric code", () => {
    const r = asResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { message: "no code here" },
    });
    expect(isJsonRpcError(r)).toBe(false);
  });

  it("returns false when error.code is a string (not a number)", () => {
    const r = asResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: "-32601", message: "stringly typed" },
    });
    expect(isJsonRpcError(r)).toBe(false);
  });

  it("returns false when error is a non-object (string)", () => {
    const r = asResponse({ jsonrpc: "2.0", id: 1, error: "boom" });
    expect(isJsonRpcError(r)).toBe(false);
  });

  it("accepts code 0 (a valid JSON-RPC numeric code)", () => {
    const r = asResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: 0, message: "zero is a number" },
    });
    expect(isJsonRpcError(r)).toBe(true);
  });

  it("does not throw on a null/undefined response", () => {
    expect(isJsonRpcError(asResponse(null))).toBe(false);
    expect(isJsonRpcError(asResponse(undefined))).toBe(false);
  });
});
