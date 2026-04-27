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

export function isJsonRpcError(
  response: JsonRpcResponse,
): response is JsonRpcError {
  return "error" in response;
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
