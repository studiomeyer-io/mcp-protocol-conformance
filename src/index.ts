/**
 * Public library entry. Re-exports the suite runners, report types,
 * diff utilities, and target adapters.
 */

export * from "./types.js";
export * from "./suites/index.js";
export {
  generateReport,
  renderJson,
  renderJunit,
  renderTerminal,
  type ReportFormat,
} from "./reporters/index.js";
export { compareManifests, assertNoBreakingChanges } from "./diff.js";
export {
  createTargetAdapter,
  StdioTargetAdapter,
  HttpTargetAdapter,
  isJsonRpcError,
  type TargetAdapter,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type JsonRpcResponse,
  type JsonRpcSuccess,
  type JsonRpcError,
} from "./targets/index.js";
export { getSpec, listSpecVersions } from "./specs/index.js";
export type { SpecTable, MethodDescriptor } from "./specs/index.js";
export {
  auditAnnotations,
  ANNOTATION_RULES,
  type AnnotationViolation,
} from "./specs/annotations-rules.js";
