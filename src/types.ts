/**
 * Shared types and Zod schemas for the MCP conformance harness.
 *
 * All tool inputs are validated through these Zod schemas before suites run.
 * All suite outputs are typed via the *Report interfaces below.
 */

import { z } from "zod";
import { isAllowedTargetUrl } from "./lib/url-guard.js";

// ---------------------------------------------------------------------------
// Spec versions
// ---------------------------------------------------------------------------

export const SpecVersionSchema = z.enum([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
]);
export type SpecVersion = z.infer<typeof SpecVersionSchema>;

export const SUPPORTED_SPEC_VERSIONS: ReadonlyArray<SpecVersion> = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
] as const;

// ---------------------------------------------------------------------------
// Server target descriptors
// ---------------------------------------------------------------------------

export const StdioTargetSchema = z.object({
  kind: z.literal("stdio"),
  cmd: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

export const HttpTargetSchema = z.object({
  kind: z.literal("http"),
  // SSRF guard: by default block private/loopback/link-local/IMDS ranges.
  // Local-dev opt-in via MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS=1.
  url: z
    .string()
    .url()
    .refine(
      (rawUrl) => isAllowedTargetUrl(rawUrl).ok,
      (rawUrl) => ({
        message:
          isAllowedTargetUrl(rawUrl).reason ??
          "Target URL is not allowed by SSRF policy",
      }),
    ),
  headers: z.record(z.string()).optional(),
});

export const ServerTargetSchema = z.discriminatedUnion("kind", [
  StdioTargetSchema,
  HttpTargetSchema,
]);

export type StdioTarget = z.infer<typeof StdioTargetSchema>;
export type HttpTarget = z.infer<typeof HttpTargetSchema>;
export type ServerTarget = z.infer<typeof ServerTargetSchema>;

// ---------------------------------------------------------------------------
// Suite selector
// ---------------------------------------------------------------------------

export const SUITE_NAMES = [
  "jsonrpc",
  "version",
  "transport",
  "oauth",
  "schema",
  "capability",
  "smoke",
  "annotations",
] as const;

export const SuiteNameSchema = z.enum(SUITE_NAMES);
export type SuiteName = z.infer<typeof SuiteNameSchema>;

export const SuiteSelectorSchema = z.union([
  z.literal("all"),
  z.literal("full"),
  z.array(SuiteNameSchema),
]);
export type SuiteSelector = z.infer<typeof SuiteSelectorSchema>;

// ---------------------------------------------------------------------------
// Tool manifests
// ---------------------------------------------------------------------------

export const ToolDescriptorSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.unknown().optional(),
  annotations: z
    .object({
      readOnlyHint: z.boolean().optional(),
      destructiveHint: z.boolean().optional(),
      idempotentHint: z.boolean().optional(),
      openWorldHint: z.boolean().optional(),
    })
    .partial()
    .optional(),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export const ToolManifestSchema = z.object({
  tools: z.array(ToolDescriptorSchema),
});
export type ToolManifest = z.infer<typeof ToolManifestSchema>;

// ---------------------------------------------------------------------------
// Report primitives
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  id: string;
  description: string;
  status: CheckStatus;
  message?: string;
  details?: Record<string, unknown>;
  durationMs?: number;
}

export interface SuiteReport {
  suite: SuiteName;
  status: CheckStatus;
  checks: CheckResult[];
  durationMs: number;
  startedAt: string; // ISO 8601
  finishedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Suite-specific report aliases (every suite returns the SuiteReport shape;
// these aliases keep tool signatures self-documenting)
// ---------------------------------------------------------------------------

export type ComplianceReport = SuiteReport;
export type VersionAssertReport = SuiteReport;
export type TransportReport = SuiteReport;
export type OauthReport = SuiteReport;
export type SchemaValidationReport = SuiteReport;
export type CapabilityReport = SuiteReport;
export type SmokeReport = SuiteReport;
export type AnnotationsReport = SuiteReport;

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

export interface FullReport {
  target: ServerTarget;
  specVersion: SpecVersion;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: CheckStatus;
  suites: SuiteReport[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
  };
}

// ---------------------------------------------------------------------------
// Manifest diff
// ---------------------------------------------------------------------------

export interface ManifestDiff {
  added: string[]; // tool names only present in actual
  removed: string[]; // tool names only present in expected
  changed: Array<{
    name: string;
    differences: string[];
  }>;
  identical: boolean;
}

// ---------------------------------------------------------------------------
// Breaking change report
// ---------------------------------------------------------------------------

export interface BreakingChangeReport {
  hasBreakingChanges: boolean;
  breakingChanges: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Tool argument schemas (used by both CLI and MCP-server-tool wiring)
// ---------------------------------------------------------------------------

export const RunJsonRpcComplianceArgs = z.object({
  target: ServerTargetSchema,
  specVersion: SpecVersionSchema,
});
export type RunJsonRpcComplianceArgs = z.infer<
  typeof RunJsonRpcComplianceArgs
>;

export const RunSpecVersionAssertionArgs = z.object({
  target: ServerTargetSchema,
  expectedVersion: SpecVersionSchema,
});
export type RunSpecVersionAssertionArgs = z.infer<
  typeof RunSpecVersionAssertionArgs
>;

export const RunTransportSuiteArgs = z.object({
  target: ServerTargetSchema,
  transport: z.enum(["stdio", "http", "both"]).default("both"),
});
export type RunTransportSuiteArgs = z.infer<typeof RunTransportSuiteArgs>;

export const RunOauthPkceFlowArgs = z.object({
  target: HttpTargetSchema,
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).optional(),
  authorizationServerUrl: z.string().url().optional(),
});
export type RunOauthPkceFlowArgs = z.infer<typeof RunOauthPkceFlowArgs>;

export const RunToolSchemaValidationArgs = z.object({
  target: ServerTargetSchema,
  expectedManifest: ToolManifestSchema.optional(),
});
export type RunToolSchemaValidationArgs = z.infer<
  typeof RunToolSchemaValidationArgs
>;

export const RunCapabilityIntrospectionArgs = z.object({
  target: ServerTargetSchema,
});
export type RunCapabilityIntrospectionArgs = z.infer<
  typeof RunCapabilityIntrospectionArgs
>;

export const RunRoundtripSmokeArgs = z.object({
  target: ServerTargetSchema,
  sampleArgs: z.record(z.unknown()).optional(),
});
export type RunRoundtripSmokeArgs = z.infer<typeof RunRoundtripSmokeArgs>;

export const RunAnnotationsAuditArgs = z.object({
  target: ServerTargetSchema,
});
export type RunAnnotationsAuditArgs = z.infer<typeof RunAnnotationsAuditArgs>;

export const RunFullSuiteArgs = z.object({
  target: ServerTargetSchema,
  specVersion: SpecVersionSchema,
  suite: SuiteSelectorSchema.optional(),
  oauth: z
    .object({
      mode: z.enum(["mock", "real"]).default("mock"),
      clientId: z.string().optional(),
      redirectUri: z.string().url().optional(),
      authToken: z.string().optional(),
    })
    .optional(),
});
export type RunFullSuiteArgs = z.infer<typeof RunFullSuiteArgs>;

export const GenerateReportArgs = z.object({
  report: z.unknown(), // FullReport — typed at use-site
  format: z.enum(["junit", "json", "terminal"]),
});
export type GenerateReportArgs = z.infer<typeof GenerateReportArgs>;

export const CompareManifestsArgs = z.object({
  expected: ToolManifestSchema,
  actual: ToolManifestSchema,
});
export type CompareManifestsArgs = z.infer<typeof CompareManifestsArgs>;

export const AssertNoBreakingChangesArgs = z.object({
  baseline: z.unknown(), // FullReport
  current: z.unknown(), // FullReport
});
export type AssertNoBreakingChangesArgs = z.infer<
  typeof AssertNoBreakingChangesArgs
>;
