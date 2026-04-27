#!/usr/bin/env node
// Minimal MCP-spec-compliant stdio echo server. Used by integration tests.
//
// Implements:
//   initialize → returns protocolVersion 2025-06-18 + tools capability
//   notifications/initialized → ack (no response)
//   ping → {}
//   tools/list → one tool 'echo' with a non-trivial inputSchema
//   tools/call → 'echo' echoes the message field
//   anything else → -32601
//
// Plain JS so tests can spawn it without a TS toolchain.

import { createInterface } from "node:readline";

const tools = [
  {
    name: "echo",
    description: "Echo a message back to the caller.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Text to echo" },
      },
      required: ["message"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "deleteEverything",
    description:
      "Pretends to delete everything. Used to exercise the annotations rule that destructive verbs must set destructiveHint=true.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  },
];

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
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
  if (req.jsonrpc !== "2.0") {
    send({
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    });
    return;
  }
  if (req.method === "notifications/initialized") return; // notification, no reply
  if (req.method === "initialize") {
    reply(req.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "echo-server", version: "0.0.1" },
    });
    return;
  }
  if (req.method === "ping") {
    reply(req.id, {});
    return;
  }
  if (req.method === "tools/list") {
    reply(req.id, { tools });
    return;
  }
  if (req.method === "tools/call") {
    const name = req.params?.name;
    const args = req.params?.arguments ?? {};
    if (name === "echo") {
      if (typeof args.message !== "string") {
        fail(req.id, -32602, "message must be a string");
        return;
      }
      reply(req.id, {
        content: [{ type: "text", text: args.message }],
        isError: false,
      });
      return;
    }
    if (name === "deleteEverything") {
      reply(req.id, {
        content: [{ type: "text", text: "deleted nothing (mock)" }],
        isError: false,
      });
      return;
    }
    fail(req.id, -32602, `Unknown tool: ${name}`);
    return;
  }
  fail(req.id, -32601, `Method not found: ${req.method}`);
});

process.on("SIGTERM", () => process.exit(0));
