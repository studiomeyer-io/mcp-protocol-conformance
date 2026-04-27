/**
 * JUnit XML reporter — for CI integration.
 *
 * Emits one <testsuite> per suite, one <testcase> per check.
 * fail → <failure>, warn → <skipped> (with marker), skip → <skipped>.
 */

import type { CheckResult, FullReport, SuiteReport } from "../types.js";

export function renderJunit(report: FullReport): string {
  const totalTests = report.summary.total;
  const totalFailures = report.summary.failed;
  const totalSkipped = report.summary.skipped + report.summary.warned;
  const totalTime = (report.durationMs / 1000).toFixed(3);

  const suiteXml = report.suites.map(renderSuite).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="mcp-protocol-conformance" tests="${totalTests}" failures="${totalFailures}" skipped="${totalSkipped}" time="${totalTime}">
${suiteXml}
</testsuites>`;
}

function renderSuite(suite: SuiteReport): string {
  const tests = suite.checks.length;
  const failures = suite.checks.filter((c) => c.status === "fail").length;
  const skipped = suite.checks.filter(
    (c) => c.status === "skip" || c.status === "warn",
  ).length;
  const time = (suite.durationMs / 1000).toFixed(3);
  const cases = suite.checks.map(renderCase).join("\n    ");
  return `  <testsuite name="${escapeXml(suite.suite)}" tests="${tests}" failures="${failures}" skipped="${skipped}" time="${time}">
    ${cases}
  </testsuite>`;
}

function renderCase(check: CheckResult): string {
  const t = check.durationMs ? (check.durationMs / 1000).toFixed(3) : "0";
  const name = escapeXml(check.id);
  const desc = escapeXml(check.description);
  const msg = escapeXml(check.message ?? "");
  if (check.status === "pass") {
    return `<testcase name="${name}" classname="${desc}" time="${t}" />`;
  }
  if (check.status === "fail") {
    return `<testcase name="${name}" classname="${desc}" time="${t}">
      <failure message="${msg}">${msg}</failure>
    </testcase>`;
  }
  // warn or skip
  const reason = check.status === "warn" ? `WARN: ${msg}` : msg;
  return `<testcase name="${name}" classname="${desc}" time="${t}">
      <skipped message="${escapeXml(reason)}" />
    </testcase>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
