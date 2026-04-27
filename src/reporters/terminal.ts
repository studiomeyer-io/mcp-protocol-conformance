/**
 * Human-readable terminal reporter. No colour libraries — we use raw
 * ANSI codes so the lib stays dep-free.
 */

import type { CheckStatus, FullReport, SuiteReport } from "../types.js";

const RESET = "\u001b[0m";
const COLOURS: Record<CheckStatus, string> = {
  pass: "\u001b[32m",
  fail: "\u001b[31m",
  warn: "\u001b[33m",
  skip: "\u001b[90m",
};
const SYMBOLS: Record<CheckStatus, string> = {
  pass: "PASS",
  fail: "FAIL",
  warn: "WARN",
  skip: "SKIP",
};

export interface TerminalOptions {
  colour?: boolean;
}

export function renderTerminal(
  report: FullReport,
  options: TerminalOptions = {},
): string {
  const colour = options.colour ?? process.stdout.isTTY ?? false;
  const lines: string[] = [];
  const target =
    report.target.kind === "stdio"
      ? `stdio:${report.target.cmd}`
      : `http:${report.target.url}`;
  lines.push(
    `MCP Conformance Report  spec=${report.specVersion}  target=${target}`,
  );
  lines.push(`Started:  ${report.startedAt}`);
  lines.push(`Finished: ${report.finishedAt}  (${report.durationMs}ms)`);
  lines.push(`Overall:  ${badge(report.status, colour)}`);
  lines.push(
    `Summary:  ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warned} warned, ${report.summary.skipped} skipped (${report.summary.total} total)`,
  );
  lines.push("");

  for (const suite of report.suites) {
    lines.push(...renderSuite(suite, colour));
    lines.push("");
  }

  return lines.join("\n");
}

function renderSuite(suite: SuiteReport, colour: boolean): string[] {
  const lines: string[] = [];
  lines.push(
    `[${badge(suite.status, colour)}] ${suite.suite}  (${suite.durationMs}ms, ${suite.checks.length} checks)`,
  );
  for (const check of suite.checks) {
    const dur = check.durationMs ? ` (${check.durationMs}ms)` : "";
    const msg = check.message ? `\n      ${check.message}` : "";
    lines.push(
      `  ${badge(check.status, colour)}  ${check.id} - ${check.description}${dur}${msg}`,
    );
  }
  return lines;
}

function badge(status: CheckStatus, colour: boolean): string {
  if (!colour) return SYMBOLS[status];
  return `${COLOURS[status]}${SYMBOLS[status]}${RESET}`;
}
