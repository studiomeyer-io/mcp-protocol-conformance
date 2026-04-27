/**
 * Annotations audit suite.
 *
 * Applies the heuristic rule set from src/specs/annotations-rules.ts
 * to every advertised tool. Surfaces violations as warnings (or fails
 * for hard-conflict cases like readOnlyHint=true + destructiveHint=true).
 */

import type {
  AnnotationsReport,
  ServerTarget,
  ToolDescriptor,
} from "../types.js";
import { ToolDescriptorSchema } from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import { isJsonRpcError } from "../targets/types.js";
import { auditAnnotations } from "../specs/annotations-rules.js";
import { makeSuiteRunner } from "./util.js";
import { initializeAdapter } from "./helpers.js";

interface ToolsListResult {
  tools: unknown[];
}

export async function runAnnotationsAudit(
  target: ServerTarget,
): Promise<AnnotationsReport> {
  const runner = makeSuiteRunner("annotations");
  runner.start();
  const adapter = createTargetAdapter(target);

  try {
    await adapter.open();
    await initializeAdapter(adapter);

    const list = await adapter.request<ToolsListResult>("tools/list");
    if (isJsonRpcError(list)) {
      // Round 4 fix: defensive coerce — some servers return error envelopes
      // without code/message fields. Was previously crashing with
      // "undefined undefined" message in real-tenant smoke.
      const code = list.error?.code ?? -32603;
      const msg = String(list.error?.message ?? "(no message)");
      runner.add({
        id: "annotations-tools-list",
        description: "tools/list available for audit",
        status: code === -32601 ? "skip" : "fail",
        message:
          code === -32601
            ? "Server does not advertise tools capability — nothing to audit."
            : `${code} ${msg}`,
      });
      return runner.finish();
    }

    if (list.result === undefined) {
      runner.add({
        id: "annotations-tools-list",
        description: "tools/list available for audit",
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
        id: "annotations-no-tools",
        description: "At least one tool to audit",
        status: "skip",
      });
      return runner.finish();
    }

    let totalViolations = 0;
    for (const tool of tools) {
      const violations = auditAnnotations(tool);
      if (violations.length === 0) {
        runner.add({
          id: `annotations-${tool.name}`,
          description: `Annotations on '${tool.name}' look consistent`,
          status: "pass",
        });
        continue;
      }
      totalViolations += violations.length;
      for (const v of violations) {
        runner.add({
          id: `annotations-${tool.name}-${v.rule}`,
          description: v.message,
          status: v.severity === "fail" ? "fail" : "warn",
          message: v.message,
          details: { rule: v.rule },
        });
      }
    }

    runner.add({
      id: "annotations-summary",
      description: "Annotation audit summary",
      status: totalViolations === 0 ? "pass" : "warn",
      details: { toolsAudited: tools.length, violations: totalViolations },
    });
  } catch (err) {
    runner.add({
      id: "annotations-suite-fatal",
      description: "Suite failed with an uncaught error",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await adapter.close();
  }

  return runner.finish();
}
