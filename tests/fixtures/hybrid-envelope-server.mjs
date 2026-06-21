#!/usr/bin/env node
// Off-spec MCP stdio server that emits a HYBRID success envelope:
// every successful reply carries `result` AND `error: null`.
//
// This is a common serialiser default (struct with an always-present nullable
// error field) and a real interop hazard. It exercises two things at once:
//   1. isJsonRpcError() must still treat { result, error: null } as SUCCESS
//      (otherwise the whole run fails spuriously).
//   2. the jsonrpc suite's `jsonrpc-response-envelope` check must WARN on it
//      (a strict JSON-RPC 2.0 success response omits `error` entirely).
//
// Plain JS so tests can spawn it without a TS toolchain.

import { createInterface } from "node:readline";

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
// Note the deliberate `error: null` alongside every result.
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result, error: null });
}
function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (req.method === "notifications/initialized") return;
  if (req.method === "initialize") {
    reply(req.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "hybrid-envelope-server", version: "0.0.1" },
    });
    return;
  }
  if (req.method === "ping") {
    reply(req.id, {});
    return;
  }
  if (req.method === "tools/list") {
    reply(req.id, {
      tools: [
        {
          name: "echo",
          description: "Echo a message back.",
          inputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
            additionalProperties: false,
          },
        },
      ],
    });
    return;
  }
  if (req.method === "tools/call") {
    reply(req.id, { content: [{ type: "text", text: "ok" }], isError: false });
    return;
  }
  fail(req.id, -32601, `Method not found: ${req.method}`);
});

process.on("SIGTERM", () => process.exit(0));
