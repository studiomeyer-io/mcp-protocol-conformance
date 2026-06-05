#!/usr/bin/env node
// MCP 2025-11-25 fixture server for conformance integration tests.
//
// Exercises the v0.2.0 surfaces:
//   initialize → protocolVersion 2025-11-25 + tools + tasks capability
//   tasks/list → responds (so the capability tasks-probe sees consistency)
//   tools/list → three tools shaped to hit each new schema check:
//     - 'search'     : has title + valid outputSchema  → output PASS, no title warn
//     - 'ping_tool'  : no title                         → title WARN
//     - 'broken_out' : outputSchema is a string         → output FAIL
//
// Plain JS so tests can spawn it without a TS toolchain.

import { createInterface } from "node:readline";

const tools = [
  {
    name: "search",
    title: "Search the corpus",
    description: "Search and return structured hits.",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { hits: { type: "array" } },
      additionalProperties: false,
    },
  },
  {
    name: "ping_tool",
    // no title on purpose → should warn under toolTitleSupported
    description: "A tool without a title.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "broken_out",
    title: "Broken output",
    description: "outputSchema is not an object → should fail.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: "not-an-object",
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
  if (req.method === "notifications/initialized") return;
  if (req.method === "initialize") {
    reply(req.id, {
      protocolVersion: "2025-11-25",
      capabilities: { tools: {}, tasks: { list: {}, cancel: {} } },
      serverInfo: { name: "mcp2511-server", version: "0.0.1" },
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
  if (req.method === "tasks/list") {
    reply(req.id, { tasks: [] });
    return;
  }
  if (req.method === "tools/call") {
    reply(req.id, { content: [{ type: "text", text: "ok" }], isError: false });
    return;
  }
  fail(req.id, -32601, `Method not found: ${req.method}`);
});

process.on("SIGTERM", () => process.exit(0));
