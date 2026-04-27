/**
 * Capability introspection suite.
 *
 * Calls tools/list, resources/list, prompts/list and reports which
 * capabilities the server actually exposes. Cross-checks against the
 * capabilities object returned in initialize.
 */

import type {
  CapabilityReport,
  ServerTarget,
} from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import { isJsonRpcError } from "../targets/types.js";
import { makeSuiteRunner } from "./util.js";

interface InitResult {
  capabilities?: Record<string, unknown>;
}

export async function runCapabilityIntrospection(
  target: ServerTarget,
): Promise<CapabilityReport> {
  const runner = makeSuiteRunner("capability");
  runner.start();
  const adapter = createTargetAdapter(target);

  try {
    await adapter.open();
    const initRes = await adapter.request<InitResult>("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-protocol-conformance", version: "0.1.0" },
    });

    const advertisedCaps = isJsonRpcError(initRes)
      ? {}
      : (initRes.result.capabilities ?? {});

    runner.add({
      id: "capability-initialize",
      description: "Server returns capabilities object on initialize",
      status: isJsonRpcError(initRes) ? "fail" : "pass",
      details: { capabilities: advertisedCaps },
    });

    if (isJsonRpcError(initRes)) return runner.finish();

    try {
      await adapter.notify("notifications/initialized");
    } catch {
      // ignored
    }

    const probes: Array<{
      method: string;
      capability: string;
    }> = [
      { method: "tools/list", capability: "tools" },
      { method: "resources/list", capability: "resources" },
      { method: "prompts/list", capability: "prompts" },
    ];

    for (const probe of probes) {
      const res = await adapter.request(probe.method);
      const advertised = probe.capability in advertisedCaps;
      const responded = !isJsonRpcError(res);

      if (advertised && !responded) {
        runner.add({
          id: `capability-${probe.capability}-advertised-but-failed`,
          description: `Capability '${probe.capability}' is advertised but ${probe.method} failed`,
          status: "fail",
          message: isJsonRpcError(res)
            ? `${res.error.code} ${res.error.message}`
            : "unknown",
        });
      } else if (!advertised && responded) {
        runner.add({
          id: `capability-${probe.capability}-undeclared-but-works`,
          description: `Capability '${probe.capability}' is not advertised but ${probe.method} responded`,
          status: "warn",
          message:
            "Server should declare the capability in initialize.capabilities.",
        });
      } else {
        runner.add({
          id: `capability-${probe.capability}-consistent`,
          description: `Capability '${probe.capability}' advertisement is consistent with ${probe.method}`,
          status: "pass",
          details: { advertised, responded },
        });
      }
    }
  } catch (err) {
    runner.add({
      id: "capability-suite-fatal",
      description: "Suite failed with an uncaught error",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await adapter.close();
  }

  return runner.finish();
}
