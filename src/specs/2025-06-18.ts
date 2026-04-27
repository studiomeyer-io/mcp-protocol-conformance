/**
 * MCP spec version 2025-06-18 (current reference).
 *
 * Reference: https://modelcontextprotocol.io/specification/2025-06-18
 *
 * Adds: tool annotations (readOnlyHint/destructiveHint/idempotentHint/openWorldHint),
 * elicitation, structured tool output, _meta on every result, refined OAuth 2.1.
 */

import type { SpecTable } from "./types.js";

export const SPEC_2025_06_18: SpecTable = {
  version: "2025-06-18",
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
  ],
  transports: ["stdio", "streamable-http"],
  oauth: {
    required: false,
    flow: "authorization_code_pkce",
    challenge_method: "S256",
  },
  toolAnnotationsSupported: true,
};
