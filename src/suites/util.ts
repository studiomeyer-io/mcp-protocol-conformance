/**
 * Shared helpers used by every suite to build SuiteReport objects.
 */

import type {
  CheckResult,
  CheckStatus,
  SuiteName,
  SuiteReport,
} from "../types.js";

export function aggregateStatus(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.every((c) => c.status === "skip")) return "skip";
  return "pass";
}

export interface SuiteRunner {
  start(): void;
  finish(): SuiteReport;
  add(check: CheckResult): void;
}

export function makeSuiteRunner(suite: SuiteName): SuiteRunner {
  let startedAt = "";
  let startTs = 0;
  const checks: CheckResult[] = [];
  return {
    start() {
      startedAt = new Date().toISOString();
      startTs = Date.now();
    },
    add(check: CheckResult) {
      checks.push(check);
    },
    finish(): SuiteReport {
      const finishedAt = new Date().toISOString();
      return {
        suite,
        status: aggregateStatus(checks),
        checks,
        durationMs: Date.now() - startTs,
        startedAt,
        finishedAt,
      };
    },
  };
}

export async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}
