import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  runJsonRpcCompliance,
  runSpecVersionAssertion,
  runToolSchemaValidation,
  runCapabilityIntrospection,
  runRoundtripSmoke,
  runAnnotationsAudit,
  runFullSuite,
} from "../src/suites/index.js";
import type { ServerTarget } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ECHO = resolve(__dirname, "fixtures", "echo-server.mjs");
const BROKEN = resolve(__dirname, "fixtures", "broken-server.mjs");
const MCP2511 = resolve(__dirname, "fixtures", "mcp2511-server.mjs");

const ECHO_TARGET: ServerTarget = {
  kind: "stdio",
  cmd: process.execPath,
  args: [ECHO],
};
const BROKEN_TARGET: ServerTarget = {
  kind: "stdio",
  cmd: process.execPath,
  args: [BROKEN],
};
const MCP2511_TARGET: ServerTarget = {
  kind: "stdio",
  cmd: process.execPath,
  args: [MCP2511],
};

const HYBRID = resolve(__dirname, "fixtures", "hybrid-envelope-server.mjs");
const HYBRID_TARGET: ServerTarget = {
  kind: "stdio",
  cmd: process.execPath,
  args: [HYBRID],
};

describe("echo-server: positive integration", () => {
  it("passes JSON-RPC compliance suite", async () => {
    const report = await runJsonRpcCompliance(ECHO_TARGET, "2025-06-18");
    expect(report.status).not.toBe("fail");
    const methodNotFound = report.checks.find(
      (c) => c.id === "jsonrpc-method-not-found",
    );
    expect(methodNotFound?.status).toBe("pass");
  }, 15_000);

  it("passes spec-version assertion for 2025-06-18", async () => {
    const report = await runSpecVersionAssertion(ECHO_TARGET, "2025-06-18");
    expect(report.status).toBe("pass");
    const exact = report.checks.find((c) => c.id === "version-exact-match");
    expect(exact?.status).toBe("pass");
  }, 15_000);

  it("validates the echo-server tool schemas", async () => {
    const report = await runToolSchemaValidation(ECHO_TARGET);
    expect(report.status).not.toBe("fail");
    const echoSchema = report.checks.find(
      (c) => c.id === "schema-input-echo",
    );
    expect(echoSchema?.status).toBe("pass");
  }, 15_000);

  it("smoke-tests every advertised tool", async () => {
    const report = await runRoundtripSmoke(ECHO_TARGET);
    expect(report.status).not.toBe("fail");
    const echoCheck = report.checks.find((c) => c.id === "smoke-echo");
    expect(echoCheck?.status).toBe("pass");
  }, 15_000);

  it("annotations audit accepts deleteEverything because destructiveHint=true", async () => {
    const report = await runAnnotationsAudit(ECHO_TARGET);
    // No fail-severity violation expected
    const hardFail = report.checks.find((c) => c.status === "fail");
    expect(hardFail).toBeUndefined();
  }, 15_000);

  it("runFullSuite returns a complete report", async () => {
    const report = await runFullSuite(ECHO_TARGET, "2025-06-18", {
      suite: ["jsonrpc", "version", "schema", "smoke", "annotations"],
    });
    expect(report.suites).toHaveLength(5);
    expect(report.status).not.toBe("fail");
  }, 30_000);
});

describe("broken-server: negative integration", () => {
  it("fails the spec-version assertion (missing protocolVersion)", async () => {
    const report = await runSpecVersionAssertion(BROKEN_TARGET, "2025-06-18");
    const versionPresent = report.checks.find(
      (c) => c.id === "version-protocol-version-present",
    );
    expect(versionPresent?.status).toBe("fail");
  }, 15_000);

  it("flags JSON-RPC method-not-found violation (returns -32700 instead)", async () => {
    const report = await runJsonRpcCompliance(BROKEN_TARGET, "2025-06-18");
    const mnfCheck = report.checks.find(
      (c) => c.id === "jsonrpc-method-not-found",
    );
    expect(mnfCheck?.status).toBe("fail");
  }, 15_000);
});

describe("mcp2511-server: 2025-11-25 surface checks", () => {
  it("capability suite confirms tasks advertisement is consistent", async () => {
    const report = await runCapabilityIntrospection(MCP2511_TARGET, "2025-11-25");
    const tasksCheck = report.checks.find(
      (c) => c.id === "capability-tasks-consistent",
    );
    expect(tasksCheck?.status).toBe("pass");
  }, 15_000);

  it("schema suite warns on a tool that omits the 2025-11-25 title", async () => {
    const report = await runToolSchemaValidation(
      MCP2511_TARGET,
      undefined,
      "2025-11-25",
    );
    const titleWarn = report.checks.find(
      (c) => c.id === "schema-title-ping_tool",
    );
    expect(titleWarn?.status).toBe("warn");
  }, 15_000);

  it("schema suite fails a non-object outputSchema", async () => {
    const report = await runToolSchemaValidation(
      MCP2511_TARGET,
      undefined,
      "2025-11-25",
    );
    const outFail = report.checks.find(
      (c) => c.id === "schema-output-broken_out",
    );
    expect(outFail?.status).toBe("fail");
  }, 15_000);

  it("schema suite passes a valid outputSchema", async () => {
    const report = await runToolSchemaValidation(
      MCP2511_TARGET,
      undefined,
      "2025-11-25",
    );
    const outPass = report.checks.find((c) => c.id === "schema-output-search");
    expect(outPass?.status).toBe("pass");
  }, 15_000);

  it("emits NO tasks/title/output checks when run as 2025-06-18 (additive)", async () => {
    const cap = await runCapabilityIntrospection(MCP2511_TARGET, "2025-06-18");
    expect(
      cap.checks.find((c) => c.id === "capability-tasks-consistent"),
    ).toBeUndefined();
    const schema = await runToolSchemaValidation(
      MCP2511_TARGET,
      undefined,
      "2025-06-18",
    );
    expect(
      schema.checks.some(
        (c) =>
          c.id.startsWith("schema-title-") || c.id.startsWith("schema-output-"),
      ),
    ).toBe(false);
  }, 15_000);
});

describe("jsonrpc suite: response-envelope conformance (JSON-RPC 2.0 §5)", () => {
  it("passes the envelope check against a clean result-only server", async () => {
    const report = await runJsonRpcCompliance(ECHO_TARGET, "2025-06-18");
    const env = report.checks.find((c) => c.id === "jsonrpc-response-envelope");
    expect(env?.status).toBe("pass");
  }, 15_000);

  it("warns on a hybrid { result, error: null } success envelope", async () => {
    const report = await runJsonRpcCompliance(HYBRID_TARGET, "2025-06-18");
    const env = report.checks.find((c) => c.id === "jsonrpc-response-envelope");
    expect(env?.status).toBe("warn");
    expect(env?.message ?? "").toMatch(/null/i);
  }, 15_000);

  it("does NOT spuriously fail a hybrid-envelope server's method-not-found probe", async () => {
    // Regression guard: with the loose isJsonRpcError, { result, error: null }
    // on success leaked into error-classification. The method-not-found check
    // must still see the real -32601 error envelope and pass.
    const report = await runJsonRpcCompliance(HYBRID_TARGET, "2025-06-18");
    const mnf = report.checks.find((c) => c.id === "jsonrpc-method-not-found");
    expect(mnf?.status).toBe("pass");
  }, 15_000);

  it("smoke + schema treat a hybrid-envelope tool result as success, not error", async () => {
    // The whole point of the isJsonRpcError fix: a server that always serialises
    // error:null must not have its valid tool roundtrip mis-reported as an error.
    const schema = await runToolSchemaValidation(HYBRID_TARGET, undefined, "2025-06-18");
    expect(schema.status).not.toBe("fail");
    const smoke = await runRoundtripSmoke(HYBRID_TARGET, undefined, "2025-06-18");
    const echo = smoke.checks.find((c) => c.id === "smoke-echo");
    expect(echo?.status).toBe("pass");
  }, 20_000);
});

beforeAll(() => {
  // smoke check that fixtures exist on disk
});

afterAll(() => {
  // nothing — child processes are reaped per-test
});
