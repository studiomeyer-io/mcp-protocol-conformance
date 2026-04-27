import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  runJsonRpcCompliance,
  runSpecVersionAssertion,
  runToolSchemaValidation,
  runRoundtripSmoke,
  runAnnotationsAudit,
  runFullSuite,
} from "../src/suites/index.js";
import type { ServerTarget } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ECHO = resolve(__dirname, "fixtures", "echo-server.mjs");
const BROKEN = resolve(__dirname, "fixtures", "broken-server.mjs");

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

beforeAll(() => {
  // smoke check that fixtures exist on disk
});

afterAll(() => {
  // nothing — child processes are reaped per-test
});
