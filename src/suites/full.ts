/**
 * Full-suite orchestrator. Runs every individual suite and aggregates
 * into a FullReport.
 */

import type {
  FullReport,
  ServerTarget,
  SpecVersion,
  SuiteName,
  SuiteReport,
  SuiteSelector,
} from "../types.js";
import { SUITE_NAMES } from "../types.js";
import { runJsonRpcCompliance } from "./jsonrpc.js";
import { runSpecVersionAssertion } from "./version.js";
import { runTransportSuite } from "./transport.js";
import { runOauthPkceFlow, type OauthRunOptions } from "./oauth.js";
import { runToolSchemaValidation } from "./schema.js";
import { runCapabilityIntrospection } from "./capability.js";
import { runRoundtripSmoke } from "./smoke.js";
import { runAnnotationsAudit } from "./annotations.js";

export interface RunFullSuiteOptions {
  suite?: SuiteSelector;
  oauth?: OauthRunOptions;
}

function selectedSuites(selector: SuiteSelector | undefined): SuiteName[] {
  if (!selector || selector === "all" || selector === "full") {
    return [...SUITE_NAMES];
  }
  return selector;
}

export async function runFullSuite(
  target: ServerTarget,
  specVersion: SpecVersion,
  options: RunFullSuiteOptions = {},
): Promise<FullReport> {
  const startedAt = new Date().toISOString();
  const startTs = Date.now();
  const suites: SuiteReport[] = [];
  const selected = selectedSuites(options.suite);

  for (const suite of selected) {
    const report = await runOneSuite(suite, target, specVersion, options);
    suites.push(report);
  }

  const summary = summarise(suites);
  const status = aggregate(suites);
  const finishedAt = new Date().toISOString();

  return {
    target,
    specVersion,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startTs,
    status,
    suites,
    summary,
  };
}

async function runOneSuite(
  suite: SuiteName,
  target: ServerTarget,
  specVersion: SpecVersion,
  options: RunFullSuiteOptions,
): Promise<SuiteReport> {
  switch (suite) {
    case "jsonrpc":
      return runJsonRpcCompliance(target, specVersion);
    case "version":
      return runSpecVersionAssertion(target, specVersion);
    case "transport":
      return runTransportSuite(target, "both");
    case "oauth":
      if (target.kind !== "http") {
        return skipped(suite, "OAuth suite only applies to HTTP targets");
      }
      return runOauthPkceFlow(target, options.oauth ?? { mode: "mock" });
    case "schema":
      return runToolSchemaValidation(target);
    case "capability":
      return runCapabilityIntrospection(target);
    case "smoke":
      return runRoundtripSmoke(target);
    case "annotations":
      return runAnnotationsAudit(target);
  }
}

function skipped(suite: SuiteName, reason: string): SuiteReport {
  const ts = new Date().toISOString();
  return {
    suite,
    status: "skip",
    durationMs: 0,
    startedAt: ts,
    finishedAt: ts,
    checks: [
      {
        id: `${suite}-skipped`,
        description: "Suite skipped",
        status: "skip",
        message: reason,
      },
    ],
  };
}

function summarise(suites: SuiteReport[]): FullReport["summary"] {
  let passed = 0;
  let failed = 0;
  let warned = 0;
  let skipped = 0;
  let total = 0;
  for (const s of suites) {
    for (const c of s.checks) {
      total++;
      if (c.status === "pass") passed++;
      else if (c.status === "fail") failed++;
      else if (c.status === "warn") warned++;
      else skipped++;
    }
  }
  return { total, passed, failed, warned, skipped };
}

function aggregate(suites: SuiteReport[]): FullReport["status"] {
  if (suites.some((s) => s.status === "fail")) return "fail";
  if (suites.some((s) => s.status === "warn")) return "warn";
  if (suites.every((s) => s.status === "skip")) return "skip";
  return "pass";
}
