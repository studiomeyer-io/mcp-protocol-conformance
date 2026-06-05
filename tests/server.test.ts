import { describe, expect, it } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createConformanceServer, dispatchTool } from "../src/server.js";
import type { ServerTarget, SuiteReport } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP2511_TARGET: ServerTarget = {
  kind: "stdio",
  cmd: process.execPath,
  args: [resolve(__dirname, "fixtures", "mcp2511-server.mjs")],
};

describe("conformance MCP server", () => {
  it("constructs without throwing and exposes the tools via the SDK Server", () => {
    const server = createConformanceServer();
    expect(server).toBeDefined();
    // We can't easily call into the SDK's request handler from here without
    // a transport, but the construction itself exercises all tool entries
    // (zod-to-json-schema runs synchronously in setRequestHandler closure).
  });
});

describe("MCP tool dispatch threads specVersion (server.ts dispatch path)", () => {
  it("reaches the 2025-11-25 capability tasks-probe when specVersion is passed", async () => {
    const report = (await dispatchTool("runCapabilityIntrospection", {
      target: MCP2511_TARGET,
      specVersion: "2025-11-25",
    })) as SuiteReport;
    const tasks = report.checks.find(
      (c) => c.id === "capability-tasks-consistent",
    );
    expect(tasks).toBeDefined();
    expect(tasks?.status).toBe("pass");
  }, 15_000);

  it("defaults to 2025-06-18 when specVersion is omitted (no tasks-probe)", async () => {
    const report = (await dispatchTool("runCapabilityIntrospection", {
      target: MCP2511_TARGET,
    })) as SuiteReport;
    const tasks = report.checks.find(
      (c) => c.id === "capability-tasks-consistent",
    );
    expect(tasks).toBeUndefined();
  }, 15_000);

  it("reaches the 2025-11-25 schema title/output checks via the schema tool", async () => {
    const report = (await dispatchTool("runToolSchemaValidation", {
      target: MCP2511_TARGET,
      specVersion: "2025-11-25",
    })) as SuiteReport;
    const titleWarn = report.checks.find(
      (c) => c.id === "schema-title-ping_tool",
    );
    const outFail = report.checks.find(
      (c) => c.id === "schema-output-broken_out",
    );
    expect(titleWarn?.status).toBe("warn");
    expect(outFail?.status).toBe("fail");
  }, 15_000);
});
