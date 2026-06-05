/**
 * Tool schema validation suite.
 *
 * Calls tools/list and validates that every advertised tool has a
 * non-empty inputSchema that is itself a valid JSON-Schema fragment
 * (Ajv compile success). Optionally diffs against an expected manifest.
 */

import AjvImport from "ajv";

// Ajv ships a CJS default export. Under NodeNext ESM the namespace shape
// needs to be unwrapped before construction. Cast through unknown because the
// runtime shape (.default) and the type shape (constructor) diverge.
type AjvCtor = new (opts?: Record<string, unknown>) => {
  compile(schema: unknown): unknown;
};
const Ajv = ((AjvImport as unknown as { default?: AjvCtor }).default ??
  (AjvImport as unknown as AjvCtor)) as AjvCtor;
import type {
  SchemaValidationReport,
  ServerTarget,
  SpecVersion,
  ToolDescriptor,
  ToolManifest,
} from "../types.js";
import { ToolDescriptorSchema } from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import { isJsonRpcError } from "../targets/types.js";
import { makeSuiteRunner } from "./util.js";
import { initializeAdapter } from "./helpers.js";
import { getSpec } from "../specs/index.js";
import { compareManifests } from "../diff.js";

interface ToolsListResult {
  tools: unknown[];
}

export async function runToolSchemaValidation(
  target: ServerTarget,
  expectedManifest?: ToolManifest,
  specVersion: SpecVersion = "2025-06-18",
): Promise<SchemaValidationReport> {
  const runner = makeSuiteRunner("schema");
  runner.start();
  const adapter = createTargetAdapter(target);
  const ajv = new Ajv({ strict: false, allErrors: true });
  const spec = getSpec(specVersion);

  try {
    await adapter.open();
    await initializeAdapter(adapter, specVersion);

    const res = await adapter.request<ToolsListResult>("tools/list");
    if (isJsonRpcError(res)) {
      runner.add({
        id: "schema-tools-list",
        description: "tools/list returns successfully",
        status: res.error.code === -32601 ? "skip" : "fail",
        message:
          res.error.code === -32601
            ? "Server does not advertise tools capability."
            : `tools/list error: ${res.error.code} ${res.error.message}`,
      });
      return runner.finish();
    }

    const tools = res.result.tools ?? [];
    if (!Array.isArray(tools)) {
      runner.add({
        id: "schema-tools-array",
        description: "tools/list returns an array under .tools",
        status: "fail",
        message: "Server returned non-array tools field.",
      });
      return runner.finish();
    }

    runner.add({
      id: "schema-tools-list",
      description: "tools/list returns an array of tool descriptors",
      status: "pass",
      details: { count: tools.length },
    });

    const parsedTools: ToolDescriptor[] = [];
    for (const raw of tools) {
      const parsed = ToolDescriptorSchema.safeParse(raw);
      if (!parsed.success) {
        runner.add({
          id: `schema-tool-shape-${getMaybeName(raw) ?? "unnamed"}`,
          description: "Tool descriptor matches MCP shape",
          status: "fail",
          message: parsed.error.message.slice(0, 400),
        });
        continue;
      }
      parsedTools.push(parsed.data);
    }

    for (const tool of parsedTools) {
      const schema = tool.inputSchema;
      if (!schema || typeof schema !== "object") {
        runner.add({
          id: `schema-input-${tool.name}`,
          description: `Tool '${tool.name}' has an inputSchema`,
          status: "fail",
          message: `Tool '${tool.name}' has no inputSchema.`,
        });
        continue;
      }
      if (schemaTooLarge(schema)) {
        runner.add({
          id: `schema-input-${tool.name}`,
          description: `Tool '${tool.name}' inputSchema is within the size guard`,
          status: "warn",
          message: `inputSchema exceeds ${MAX_SCHEMA_BYTES} bytes — ajv.compile skipped to avoid CPU exhaustion on adversarial server schemas.`,
        });
        continue;
      }
      try {
        ajv.compile(schema);
        runner.add({
          id: `schema-input-${tool.name}`,
          description: `Tool '${tool.name}' inputSchema is valid JSON-Schema`,
          status: "pass",
        });
      } catch (err) {
        runner.add({
          id: `schema-input-${tool.name}`,
          description: `Tool '${tool.name}' inputSchema is valid JSON-Schema`,
          status: "fail",
          message: err instanceof Error ? err.message.slice(0, 400) : String(err),
        });
      }
    }

    // --- 2025-11-25 additive tool-object surfaces (only when the spec defines them) ---
    if (spec.structuredToolOutput || spec.toolTitleSupported) {
      for (const tool of parsedTools) {
        if (spec.toolTitleSupported && !tool.title) {
          runner.add({
            id: `schema-title-${tool.name}`,
            description: `Tool '${tool.name}' declares a human-readable title (2025-11-25)`,
            status: "warn",
            message:
              "Missing optional 'title' — recommended for host UI display in 2025-11-25.",
          });
        }
        if (spec.structuredToolOutput && tool.outputSchema !== undefined) {
          if (!tool.outputSchema || typeof tool.outputSchema !== "object") {
            runner.add({
              id: `schema-output-${tool.name}`,
              description: `Tool '${tool.name}' outputSchema is a JSON-Schema object`,
              status: "fail",
              message: "outputSchema present but not an object.",
            });
          } else if (schemaTooLarge(tool.outputSchema)) {
            runner.add({
              id: `schema-output-${tool.name}`,
              description: `Tool '${tool.name}' outputSchema is within the size guard`,
              status: "warn",
              message: `outputSchema exceeds ${MAX_SCHEMA_BYTES} bytes — ajv.compile skipped to avoid CPU exhaustion on adversarial server schemas.`,
            });
          } else {
            try {
              ajv.compile(tool.outputSchema);
              runner.add({
                id: `schema-output-${tool.name}`,
                description: `Tool '${tool.name}' outputSchema is valid JSON-Schema (2025-11-25)`,
                status: "pass",
              });
            } catch (err) {
              runner.add({
                id: `schema-output-${tool.name}`,
                description: `Tool '${tool.name}' outputSchema is valid JSON-Schema (2025-11-25)`,
                status: "fail",
                message:
                  err instanceof Error ? err.message.slice(0, 400) : String(err),
              });
            }
          }
        }
      }
    }

    if (expectedManifest) {
      const diff = compareManifests(expectedManifest, { tools: parsedTools });
      runner.add({
        id: "schema-manifest-diff",
        description: "Server tool manifest matches expected manifest",
        status: diff.identical ? "pass" : "fail",
        message: diff.identical
          ? undefined
          : `added=${diff.added.length} removed=${diff.removed.length} changed=${diff.changed.length}`,
        details: diff as unknown as Record<string, unknown>,
      });
    }
  } catch (err) {
    runner.add({
      id: "schema-suite-fatal",
      description: "Suite failed with an uncaught error",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await adapter.close();
  }

  return runner.finish();
}

function getMaybeName(raw: unknown): string | undefined {
  if (raw && typeof raw === "object" && "name" in raw) {
    const name = (raw as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

/**
 * Upper bound on a server-supplied JSON schema before we hand it to ajv.compile.
 * ajv compiles $ref / allOf / if-then-else eagerly and synchronously, so a
 * deeply-nested or exponentially-branching schema from an adversarial or buggy
 * server can pin the CPU. We refuse to compile anything past this size and
 * surface a warn instead of hanging the run.
 */
const MAX_SCHEMA_BYTES = 64 * 1024;

function schemaTooLarge(schema: unknown): boolean {
  try {
    return JSON.stringify(schema).length > MAX_SCHEMA_BYTES;
  } catch {
    // circular / non-serializable → treat as unsafe, do not compile
    return true;
  }
}
