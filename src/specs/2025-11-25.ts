/**
 * MCP spec version 2025-11-25 (current stable production base).
 *
 * Reference: https://modelcontextprotocol.io/specification/2025-11-25
 * Changelog:  https://modelcontextprotocol.io/specification/2025-11-25/changelog
 *
 * Deltas vs 2025-06-18 (context7-verified, S1290):
 *  - Major: experimental `tasks` — durable requests via polling (`tasks/get`) +
 *    deferred result retrieval (`tasks/result`), plus `tasks/list`, `tasks/cancel`
 *    and the `notifications/tasks/status` notification, under the `tasks` capability.
 *  - Major: `sampling/createMessage` gains tool-calling.
 *  - Minor: elicitation schemas support default values for primitive types.
 *  - Minor: JSON Schema 2020-12 is the default dialect for tool input/output schemas
 *    when `$schema` is absent (overridable per-schema; not a mandated literal).
 *  - Additive: Tool object gains `icons[]`, `title`, `execution`, `outputSchema`, `_meta`.
 *
 * Still NOT here (lives in the 2026-07-28 RC, intentionally excluded until final SDK):
 *  stateless core, removal of initialize/initialized handshake (SEP-2575),
 *  removal of Mcp-Session-Id (SEP-2567), server/discover, Mcp-Method/Mcp-Name headers.
 */

import type { SpecTable } from "./types.js";

export const SPEC_2025_11_25: SpecTable = {
  version: "2025-11-25",
  methods: {
    initialize: { required: true, response: "object" },
    "notifications/initialized": { required: true, notification: true },
    "notifications/cancelled": { required: false, notification: true },
    "notifications/progress": { required: false, notification: true },
    ping: { required: true, response: "object" },
    "tools/list": { required: false, response: "object" },
    "tools/call": { required: false, response: "object" },
    "resources/list": { required: false, response: "object" },
    "resources/read": { required: false, response: "object" },
    "resources/templates/list": { required: false, response: "object" },
    "resources/subscribe": { required: false, response: "object" },
    "resources/unsubscribe": { required: false, response: "object" },
    "prompts/list": { required: false, response: "object" },
    "prompts/get": { required: false, response: "object" },
    "logging/setLevel": { required: false, response: "object" },
    "completion/complete": { required: false, response: "object" },
    "sampling/createMessage": { required: false, response: "object" },
    "elicitation/create": { required: false, response: "object" },
    "roots/list": { required: false, response: "object" },
    // NEW in 2025-11-25: experimental durable requests (tasks utility).
    // Full surface per the official 2025-11-25 schema.ts method literals:
    // get (poll status) + result (final payload) + list + cancel + status notification.
    "tasks/get": { required: false, response: "object" },
    "tasks/result": { required: false, response: "object" },
    "tasks/list": { required: false, response: "object" },
    "tasks/cancel": { required: false, response: "object" },
    "notifications/tasks/status": { required: false, notification: true },
  },
  errorCodes: {
    "-32700": "Parse error",
    "-32600": "Invalid Request",
    "-32601": "Method not found",
    "-32602": "Invalid params",
    "-32603": "Internal error",
  },
  requiredCapabilities: [],
  optionalCapabilities: [
    "tools",
    "resources",
    "prompts",
    "logging",
    "completion",
    "sampling",
    "elicitation",
    "roots",
    // NEW in 2025-11-25.
    "tasks",
  ],
  transports: ["stdio", "streamable-http"],
  oauth: {
    required: false,
    flow: "authorization_code_pkce",
    challenge_method: "S256",
  },
  toolAnnotationsSupported: true,

  // --- 2025-11-25 additive surfaces ---
  tasks: {
    supported: true,
    // Full 2025-11-25 task surface. A read-only harness can only probe
    // tasks/list (no live taskId for get/result/cancel) — see capability suite.
    methods: ["tasks/get", "tasks/result", "tasks/list", "tasks/cancel"],
  },
  samplingToolCalling: true,
  elicitationDefaults: true,
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  structuredToolOutput: true,
  toolIconsSupported: true,
  toolTitleSupported: true,
};
