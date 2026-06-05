/**
 * Shape of a per-spec capability table.
 * Each spec version exports a SpecTable so suites can drive checks
 * declaratively rather than hard-coding version logic.
 */

import type { SpecVersion } from "../types.js";

export interface MethodDescriptor {
  /** Whether the method is mandatory for a conformant server */
  required: boolean;
  /** Whether the method is a JSON-RPC notification (no response expected) */
  notification?: boolean;
  /** Expected JSON-RPC result shape (for documentation, not strictly checked) */
  response?: "object" | "array" | "string" | "number" | "boolean" | "null";
}

export interface OauthRequirements {
  required: boolean;
  flow: "none" | "authorization_code_pkce";
  challenge_method?: "S256" | "plain";
}

export interface SpecTable {
  version: SpecVersion;
  methods: Record<string, MethodDescriptor>;
  errorCodes: Record<string, string>;
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  transports: Array<"stdio" | "sse" | "streamable-http">;
  oauth: OauthRequirements;
  toolAnnotationsSupported?: boolean;

  // --- 2025-11-25 additive surfaces (all optional; older specs leave them unset) ---
  /** Experimental durable requests: `tasks` capability + tasks/list + tasks/cancel. */
  tasks?: {
    supported: boolean;
    /** Methods that must respond when `tasks` is advertised. */
    methods: string[];
  };
  /** `sampling/createMessage` accepts tool definitions (tool-calling in sampling). */
  samplingToolCalling?: boolean;
  /** Elicitation schemas may declare default values for primitive types. */
  elicitationDefaults?: boolean;
  /** Default JSON Schema dialect URI (e.g. the 2020-12 draft). */
  jsonSchemaDialect?: string;
  /** Tools may declare an `outputSchema` (structured output). */
  structuredToolOutput?: boolean;
  /** Tools may declare `icons[]`. */
  toolIconsSupported?: boolean;
  /** Tools may declare a human `title` distinct from `name`. */
  toolTitleSupported?: boolean;
}
