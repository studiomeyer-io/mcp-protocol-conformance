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
  SpecVersion,
} from "../types.js";
import { createTargetAdapter } from "../targets/index.js";
import { isJsonRpcError } from "../targets/types.js";
import { makeSuiteRunner } from "./util.js";
import { getSpec } from "../specs/index.js";

interface InitResult {
  capabilities?: Record<string, unknown>;
}

export async function runCapabilityIntrospection(
  target: ServerTarget,
  specVersion: SpecVersion = "2025-06-18",
): Promise<CapabilityReport> {
  const runner = makeSuiteRunner("capability");
  runner.start();
  const adapter = createTargetAdapter(target);
  const spec = getSpec(specVersion);

  try {
    await adapter.open();
    const initRes = await adapter.request<InitResult>("initialize", {
      protocolVersion: specVersion,
      capabilities: {},
      clientInfo: { name: "mcp-protocol-conformance", version: "0.1.0" },
    });

    const advertisedCaps = isJsonRpcError(initRes)
      ? {}
      : (initRes.result.capabilities ?? {});

    runner.add({
      id: "capability-initialize",
      description: "Server returns capabilities object on initialize",
      // A rejected initialize is usually a protocol-version mismatch (the version
      // suite is the authority on that), not a capability defect — warn + skip the
      // probes instead of hard-failing the whole capability suite on a strict
      // server that does not accept the requested specVersion.
      status: isJsonRpcError(initRes) ? "warn" : "pass",
      message: isJsonRpcError(initRes)
        ? `initialize rejected for protocolVersion ${specVersion} (${initRes.error.code} ${initRes.error.message}). See the version suite.`
        : undefined,
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

    // 2025-11-25: experimental durable requests. Probe only tasks/list — get/
    // result/cancel need a live taskId a read-only harness can't supply. Like the
    // tools/resources/prompts probes this checks capability/responsiveness
    // consistency, not response-payload shape (only probed when the spec defines
    // tasks, so older specs are unaffected).
    if (spec.tasks?.supported) {
      probes.push({ method: "tasks/list", capability: "tasks" });
    }

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
