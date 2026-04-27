/**
 * Roundtrip smoke suite.
 *
 * For each tool the server advertises, performs one tools/call with
 * either user-supplied sampleArgs or an inferred minimal-valid payload.
 * Asserts that the response is well-formed (not a transport-level
 * error). A tool may legitimately return isError=true for invalid input;
 * that is recorded as a `warn` rather than a `fail`.
 */

import type {
  ServerTarget,
  SmokeReport,
  ToolDescriptor,
} from "../types.js";
import { ToolDescriptorSchema } from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import { isJsonRpcError } from "../targets/types.js";
import { makeSuiteRunner } from "./util.js";
import { initializeAdapter } from "./helpers.js";

interface ToolsListResult {
  tools: unknown[];
}

interface ToolCallResult {
  content?: unknown[];
  isError?: boolean;
}

export async function runRoundtripSmoke(
  target: ServerTarget,
  sampleArgs?: Record<string, unknown>,
): Promise<SmokeReport> {
  const runner = makeSuiteRunner("smoke");
  runner.start();
  const adapter = createTargetAdapter(target);

  try {
    await adapter.open();
    await initializeAdapter(adapter);

    const list = await adapter.request<ToolsListResult>("tools/list");
    if (isJsonRpcError(list)) {
      const code = list.error?.code ?? -32603;
      const msg = String(list.error?.message ?? "(no message)");
      runner.add({
        id: "smoke-tools-list",
        description: "tools/list available",
        status: code === -32601 ? "skip" : "fail",
        message:
          code === -32601
            ? "Server does not advertise tools capability."
            : `${code} ${msg}`,
      });
      return runner.finish();
    }

    if (list.result === undefined) {
      runner.add({
        id: "smoke-tools-list",
        description: "tools/list available",
        status: "fail",
        message: "Server response missing both `result` and `error` — JSON-RPC envelope violation",
      });
      return runner.finish();
    }

    const tools = (list.result.tools ?? [])
      .map((t) => ToolDescriptorSchema.safeParse(t))
      .filter((p) => p.success)
      .map((p) => (p as { success: true; data: ToolDescriptor }).data);

    if (tools.length === 0) {
      runner.add({
        id: "smoke-no-tools",
        description: "Server has at least one tool",
        status: "skip",
        message: "Server advertised tools capability but returned zero tools.",
      });
      return runner.finish();
    }

    for (const tool of tools) {
      const args = sampleArgs ?? inferMinimalArgs(tool);
      const start = Date.now();
      try {
        const res = await adapter.request<ToolCallResult>("tools/call", {
          name: tool.name,
          arguments: args,
        });
        if (isJsonRpcError(res)) {
          // Round 4 fix: Real-tenant smoke against memory.studiomeyer.io
          // exposed servers that return JSON-RPC errors without a `message`
          // field. `String(... ?? "(no message)")` is the defensive coerce.
          const code = res.error?.code ?? -32603;
          const msg = String(res.error?.message ?? "(no message)").slice(0, 200);
          runner.add({
            id: `smoke-${tool.name}`,
            description: `tools/call '${tool.name}' returns a JSON-RPC response`,
            status: "warn",
            message: `${code} ${msg}`,
            durationMs: Date.now() - start,
          });
        } else {
          // Round 4 fix: defensive — some servers return neither error nor
          // result for unsupported method shapes. Treat absent `result` as
          // a transport-level fail rather than crashing on `.isError`.
          if (res.result === undefined) {
            runner.add({
              id: `smoke-${tool.name}`,
              description: `tools/call '${tool.name}' returns a JSON-RPC response`,
              status: "fail",
              message: "Server response missing both `result` and `error` — JSON-RPC envelope violation",
              durationMs: Date.now() - start,
            });
          } else {
            runner.add({
              id: `smoke-${tool.name}`,
              description: `tools/call '${tool.name}' returns a JSON-RPC response`,
              status: res.result.isError ? "warn" : "pass",
              message: res.result.isError
                ? "Tool returned isError=true (likely missing args, acceptable)"
                : undefined,
              durationMs: Date.now() - start,
            });
          }
        }
      } catch (err) {
        runner.add({
          id: `smoke-${tool.name}`,
          description: `tools/call '${tool.name}' returns a JSON-RPC response`,
          status: "fail",
          message: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        });
      }
    }
  } catch (err) {
    runner.add({
      id: "smoke-suite-fatal",
      description: "Suite failed with an uncaught error",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await adapter.close();
  }

  return runner.finish();
}

/**
 * Best-effort minimal payload from a JSON-Schema. We do not try to
 * generate semantically valid input — the goal is to detect a wire
 * error, not a domain error. If the server rejects the payload with
 * isError=true, that is recorded as `warn`.
 */
function inferMinimalArgs(tool: ToolDescriptor): Record<string, unknown> {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== "object") return {};
  const obj = schema as Record<string, unknown>;
  if (obj["type"] !== "object" || !obj["properties"]) return {};
  const required = (obj["required"] as string[] | undefined) ?? [];
  const props = obj["properties"] as Record<string, Record<string, unknown>>;
  const out: Record<string, unknown> = {};
  for (const key of required) {
    const prop = props[key];
    if (!prop) continue;
    out[key] = stubForType(prop["type"], prop);
  }
  return out;
}

function stubForType(
  type: unknown,
  prop: Record<string, unknown>,
): unknown {
  if (type === "string") return (prop["default"] as string) ?? "test";
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "array") return [];
  if (type === "object") return {};
  if (type === "null") return null;
  return null;
}
