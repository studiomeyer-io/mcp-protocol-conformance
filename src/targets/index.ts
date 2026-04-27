/**
 * Target adapter factory.
 */

import type { ServerTarget } from "../types.js";
import { StdioTargetAdapter } from "./stdio.js";
import { HttpTargetAdapter } from "./http.js";
import type { TargetAdapter } from "./types.js";

export function createTargetAdapter(target: ServerTarget): TargetAdapter {
  if (target.kind === "stdio") return new StdioTargetAdapter(target);
  return new HttpTargetAdapter(target);
}

export { StdioTargetAdapter, HttpTargetAdapter };
export type {
  TargetAdapter,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcSuccess,
  JsonRpcError,
} from "./types.js";
export { isJsonRpcError } from "./types.js";
