/**
 * Spec-version assertion suite.
 *
 * Drives an `initialize` handshake and asserts that the server returns
 * the expected protocolVersion (or a backwards-compatible version).
 */

import type {
  ServerTarget,
  SpecVersion,
  VersionAssertReport,
} from "../types.js";
import { SUPPORTED_SPEC_VERSIONS } from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import { isJsonRpcError } from "../targets/types.js";
import { makeSuiteRunner } from "./util.js";

interface InitializeResult {
  protocolVersion?: string;
  serverInfo?: { name?: string; version?: string };
  capabilities?: Record<string, unknown>;
}

export async function runSpecVersionAssertion(
  target: ServerTarget,
  expectedVersion: SpecVersion,
): Promise<VersionAssertReport> {
  const runner = makeSuiteRunner("version");
  runner.start();
  const adapter = createTargetAdapter(target);

  try {
    await adapter.open();
    const start = Date.now();
    const res = await adapter.request<InitializeResult>("initialize", {
      protocolVersion: expectedVersion,
      capabilities: {},
      clientInfo: {
        name: "mcp-protocol-conformance",
        version: "0.1.0",
      },
    });

    if (isJsonRpcError(res)) {
      runner.add({
        id: "version-initialize",
        description: "initialize handshake succeeds",
        status: "fail",
        message: `initialize returned error: ${res.error.code} ${res.error.message}`,
        durationMs: Date.now() - start,
      });
    } else {
      const advertised = res.result.protocolVersion;
      runner.add({
        id: "version-initialize",
        description: "initialize handshake succeeds",
        status: "pass",
        durationMs: Date.now() - start,
        details: { advertised, expectedVersion },
      });

      if (!advertised) {
        runner.add({
          id: "version-protocol-version-present",
          description: "initialize result includes protocolVersion",
          status: "fail",
          message: "Server omitted protocolVersion in initialize result.",
        });
      } else if (advertised === expectedVersion) {
        runner.add({
          id: "version-exact-match",
          description: `Server advertises requested version ${expectedVersion}`,
          status: "pass",
        });
      } else if (
        SUPPORTED_SPEC_VERSIONS.includes(advertised as SpecVersion)
      ) {
        runner.add({
          id: "version-known-but-different",
          description:
            "Server advertised a known but different MCP spec version",
          status: "warn",
          message: `Requested ${expectedVersion} but server returned ${advertised}. The client must downgrade.`,
        });
      } else {
        runner.add({
          id: "version-unknown",
          description: "Server advertised an unrecognised spec version",
          status: "fail",
          message: `Server returned unknown protocolVersion '${advertised}'.`,
        });
      }

      // notifications/initialized must follow per spec
      try {
        await adapter.notify("notifications/initialized");
        runner.add({
          id: "version-notifications-initialized",
          description: "Client can send notifications/initialized after init",
          status: "pass",
        });
      } catch (err) {
        runner.add({
          id: "version-notifications-initialized",
          description: "Client can send notifications/initialized after init",
          status: "fail",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    runner.add({
      id: "version-suite-fatal",
      description: "Suite failed with an uncaught error",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await adapter.close();
  }

  return runner.finish();
}
