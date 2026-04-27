/**
 * MCP spec version 2024-11-05 (legacy).
 *
 * Reference: https://modelcontextprotocol.io/specification/2024-11-05
 *
 * Stdio transport only. SSE was added in 2024-11-05 but Streamable HTTP
 * was introduced in 2025-03-26.
 */

import type { SpecTable } from "./types.js";

export const SPEC_2024_11_05: SpecTable = {
  version: "2024-11-05",
  methods: {
    initialize: { required: true, response: "object" },
    "notifications/initialized": { required: true, notification: true },
    ping: { required: false, response: "object" },
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
    "roots",
  ],
  transports: ["stdio", "sse"],
  oauth: {
    required: false,
    flow: "none",
  },
};
