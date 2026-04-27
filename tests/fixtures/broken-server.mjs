#!/usr/bin/env node
// Deliberately broken MCP server.
// - Returns -32700 on every valid request (wrong code).
// - Omits protocolVersion in initialize.
// - tools/list returns malformed structure.
// Used by integration tests to confirm the harness flags FAIL.

import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (req.method === "notifications/initialized") return;
  if (req.method === "initialize") {
    // missing protocolVersion field
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: req.id,
        result: { capabilities: {}, serverInfo: { name: "broken", version: "0" } },
      }) + "\n",
    );
    return;
  }
  // every other request gets -32700, which is wrong (parse error not method error)
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32700, message: "Bogus parse error" },
    }) + "\n",
  );
});
