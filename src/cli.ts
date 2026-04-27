#!/usr/bin/env node
/**
 * mcp-conformance CLI.
 *
 * Subcommands:
 *  - run     : execute the suites against a target, emit report
 *  - report  : re-render a stored JSON report in another format
 *  - compare : diff two manifests stored as JSON files
 *  - assert-no-breaking : compare two FullReports
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import {
  SUITE_NAMES,
  type FullReport,
  type ServerTarget,
  type SpecVersion,
  type SuiteName,
  type SuiteSelector,
  type ToolManifest,
} from "./types.js";
import { runFullSuite } from "./suites/index.js";
import { generateReport, type ReportFormat } from "./reporters/index.js";
import { compareManifests, assertNoBreakingChanges } from "./diff.js";
import { readPackageVersion } from "./lib/version.js";

/**
 * Wrap a synchronous file read + JSON parse with friendly CLI errors.
 * M4 fix Round 3: previously a missing file or malformed JSON bubbled up as
 * an unformatted Node stack trace.
 */
function readJsonFile<T>(path: string, label: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read ${label} file '${path}': ${message}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} file '${path}' is not valid JSON: ${message}`);
  }
}

const program = new Command();
program
  .name("mcp-conformance")
  .description("MCP protocol conformance test harness")
  .version(readPackageVersion());

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

program
  .command("run")
  .description("Run conformance suites against a target MCP server")
  .requiredOption(
    "--target <kind>",
    "target kind: 'stdio' or 'http'",
  )
  .option("--cmd <cmd>", "stdio command (for --target stdio)")
  .option(
    "--cmd-arg <arg...>",
    "additional arg for the stdio command (repeatable)",
  )
  .option("--url <url>", "HTTP URL (for --target http)")
  .option("--header <kv...>", "HTTP header in K:V form (repeatable)")
  .requiredOption(
    "--spec <version>",
    "MCP spec version: 2024-11-05 | 2025-03-26 | 2025-06-18",
  )
  .option(
    "--suite <suites>",
    "Suite selector: 'all', 'full', or comma-separated list",
    "all",
  )
  .option(
    "--oauth-mode <mode>",
    "OAuth mode: 'mock' (default) or 'real'",
    "mock",
  )
  .option("--auth-token <token>", "Bearer token for --oauth-mode real")
  .option("--client-id <id>", "OAuth client ID for --oauth-mode mock")
  .option(
    "--redirect-uri <uri>",
    "OAuth redirect URI for --oauth-mode mock",
    "http://127.0.0.1:8765/callback",
  )
  .option(
    "--format <format>",
    "Report format: terminal (default), json, junit",
    "terminal",
  )
  .option("--out <file>", "Write report to file instead of stdout")
  .action(async (opts) => {
    const target = parseTarget(opts);
    const spec = parseSpec(opts.spec);
    const suite = parseSuiteSelector(opts.suite);
    const report = await runFullSuite(target, spec, {
      suite,
      oauth: {
        mode: opts.oauthMode === "real" ? "real" : "mock",
        clientId: opts.clientId,
        redirectUri: opts.redirectUri,
        authToken: opts.authToken,
      },
    });
    const rendered = generateReport(report, opts.format as ReportFormat);
    if (opts.out) {
      writeFileSync(opts.out, rendered);
    } else {
      process.stdout.write(rendered + "\n");
    }
    process.exit(report.status === "fail" ? 1 : 0);
  });

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

program
  .command("report")
  .description("Re-render a stored FullReport JSON in another format")
  .requiredOption("--in <file>", "Path to FullReport JSON")
  .requiredOption("--format <format>", "junit | json | terminal")
  .option("--out <file>", "Write to file instead of stdout")
  .action((opts) => {
    const report = readJsonFile<FullReport>(opts.in, "report");
    const rendered = generateReport(report, opts.format as ReportFormat);
    if (opts.out) writeFileSync(opts.out, rendered);
    else process.stdout.write(rendered + "\n");
  });

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

program
  .command("compare")
  .description("Diff two tool manifests")
  .requiredOption("--expected <file>", "Expected manifest JSON")
  .requiredOption("--actual <file>", "Actual manifest JSON")
  .action((opts) => {
    const expected = readJsonFile<ToolManifest>(opts.expected, "expected manifest");
    const actual = readJsonFile<ToolManifest>(opts.actual, "actual manifest");
    const diff = compareManifests(expected, actual);
    process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
    process.exit(diff.identical ? 0 : 1);
  });

// ---------------------------------------------------------------------------
// assert-no-breaking
// ---------------------------------------------------------------------------

program
  .command("assert-no-breaking")
  .description("Assert no breaking changes between two FullReports")
  .requiredOption("--baseline <file>", "Baseline FullReport JSON")
  .requiredOption("--current <file>", "Current FullReport JSON")
  .action((opts) => {
    const baseline = readJsonFile<FullReport>(opts.baseline, "baseline report");
    const current = readJsonFile<FullReport>(opts.current, "current report");
    const result = assertNoBreakingChanges(baseline, current);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.hasBreakingChanges ? 1 : 0);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(
    `mcp-conformance: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(2);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTarget(opts: {
  target: string;
  cmd?: string;
  cmdArg?: string[];
  url?: string;
  header?: string[];
}): ServerTarget {
  if (opts.target === "stdio") {
    if (!opts.cmd) {
      throw new Error("--cmd is required when --target stdio");
    }
    return { kind: "stdio", cmd: opts.cmd, args: opts.cmdArg ?? [] };
  }
  if (opts.target === "http") {
    if (!opts.url) {
      throw new Error("--url is required when --target http");
    }
    const headers: Record<string, string> = {};
    for (const h of opts.header ?? []) {
      const idx = h.indexOf(":");
      if (idx === -1) {
        throw new Error(`Header '${h}' must be in K:V form`);
      }
      headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    }
    return { kind: "http", url: opts.url, headers };
  }
  throw new Error(`Unknown --target ${opts.target}`);
}

function parseSpec(s: string): SpecVersion {
  if (s === "2024-11-05" || s === "2025-03-26" || s === "2025-06-18") {
    return s;
  }
  throw new Error(`Unknown spec version: ${s}`);
}

function parseSuiteSelector(s: string): SuiteSelector {
  if (s === "all" || s === "full") return s;
  // M2 fix Round 3: validate every comma-separated entry against the
  // SUITE_NAMES allowlist instead of `as SuiteName[]` casting. A misspelled
  // suite name now produces a clear CLI error instead of being silently
  // dropped from the selector.
  const known = new Set<string>(SUITE_NAMES);
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    throw new Error(
      `--suite is empty. Pass 'all', 'full', or a comma-separated subset of: ${SUITE_NAMES.join(", ")}`,
    );
  }
  const unknown = parts.filter((p) => !known.has(p));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown suite name(s): ${unknown.join(", ")}. Allowed: ${SUITE_NAMES.join(", ")}`,
    );
  }
  return parts as SuiteName[];
}
