/**
 * Heuristic rule set for the annotations audit suite.
 *
 * The plan (D2, 2026-04-27) requires:
 * - Tool name regex /(delete|remove|drop|reset|clear|destroy|purge)/i
 *   must set destructiveHint=true. Otherwise WARN (not hard-fail).
 *
 * Rules are surfaced as warnings so consumers can configure stricter
 * behaviour later via .mcpconformance.json (extension point reserved).
 */

import type { ToolDescriptor } from "../types.js";

export interface AnnotationViolation {
  toolName: string;
  rule: string;
  severity: "warn" | "fail";
  message: string;
}

// camelCase tool names like "deleteUser" must trigger — no \b boundary,
// because the word boundary fails between two word-chars (e + U).
//
// M1 fix Round 3: extended to cover common destructive verbs missing in
// Round 1.5 — `terminate` (sessions), `revoke` (tokens), `kill` (jobs),
// `expire` (caches), `overwrite` (files), `unset` (config), `nuke`/`erase`/
// `flush` (caches/queues). All of these are widespread tool naming
// conventions in the MCP ecosystem.
const DESTRUCTIVE_NAME_REGEX =
  /(delete|remove|drop|reset|clear|destroy|purge|wipe|truncate|terminate|revoke|kill|expire|overwrite|unset|nuke|erase|flush)/i;
const READ_PREFIX_REGEX =
  /^(get|list|read|search|fetch|find|query|show|describe|introspect|peek|inspect|view)/i;

export function auditAnnotations(
  tool: ToolDescriptor,
): AnnotationViolation[] {
  const out: AnnotationViolation[] = [];
  const name = tool.name;
  const ann = tool.annotations ?? {};

  if (DESTRUCTIVE_NAME_REGEX.test(name) && ann.destructiveHint !== true) {
    out.push({
      toolName: name,
      rule: "destructive-name-without-destructive-hint",
      severity: "warn",
      message: `Tool name '${name}' suggests a destructive action but destructiveHint is not set to true.`,
    });
  }

  if (READ_PREFIX_REGEX.test(name) && ann.readOnlyHint === false) {
    out.push({
      toolName: name,
      rule: "read-prefix-with-readonly-false",
      severity: "warn",
      message: `Tool name '${name}' looks read-only but readOnlyHint=false. Confirm intent.`,
    });
  }

  if (ann.readOnlyHint === true && ann.destructiveHint === true) {
    out.push({
      toolName: name,
      rule: "readonly-and-destructive-both-true",
      severity: "fail",
      message: `Tool '${name}' has readOnlyHint=true and destructiveHint=true simultaneously. These are mutually exclusive.`,
    });
  }

  return out;
}

export const ANNOTATION_RULES = {
  destructiveNameRegex: DESTRUCTIVE_NAME_REGEX,
  readPrefixRegex: READ_PREFIX_REGEX,
} as const;
