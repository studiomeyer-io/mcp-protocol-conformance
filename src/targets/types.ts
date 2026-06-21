/**
 * Common interface that every transport adapter must implement.
 * Suites depend on this contract, not on stdio/http specifics.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result: T;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

/**
 * Narrow a JSON-RPC response to the error variant.
 *
 * Per JSON-RPC 2.0 (and the MCP schema's `Error` interface) an error response
 * carries an `error` member that is an object with a numeric `code` and a
 * string `message`; a successful response carries `result` and omits `error`.
 *
 * Correctness note: a bare `"error" in response` check misclassifies the
 * `{ jsonrpc, id, result, error: null }` shape — emitted by real-world servers
 * that always serialise an `error: null` default alongside a valid `result` —
 * as an error, turning a passing roundtrip into a spurious FAIL/WARN across
 * every suite. We therefore require `error` to be a non-null object with a
 * numeric `code`, matching the wire contract and the HTTP adapter's own
 * envelope detection. `error: null`, a missing `code`, or a non-object `error`
 * are treated as "not an error response".
 */
export function isJsonRpcError(
  response: JsonRpcResponse,
): response is JsonRpcError {
  if (!response || typeof response !== "object") return false;
  if (!("error" in response)) return false;
  const err = (response as { error?: unknown }).error;
  return (
    err !== null &&
    typeof err === "object" &&
    typeof (err as { code?: unknown }).code === "number"
  );
}

export interface TargetAdapter {
  /** Open the connection. For stdio: spawn child. For http: noop. */
  open(): Promise<void>;
  /** Send a request and wait for the matching response. */
  request<T = unknown>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number },
  ): Promise<JsonRpcResponse<T>>;
  /** Send a JSON-RPC notification (no response expected). */
  notify(method: string, params?: unknown): Promise<void>;
  /** Send raw text (for malformed-payload conformance tests). */
  sendRaw(payload: string): Promise<void>;
  /** Read the next response within timeout — used after sendRaw. */
  readNext(timeoutMs?: number): Promise<JsonRpcResponse | null>;
  /** Close the connection. Must be safe to call multiple times. */
  close(): Promise<void>;
}
