import { describe, expect, it } from "vitest";
import { generateReport } from "../src/reporters/index.js";
import type { FullReport } from "../src/types.js";

const SAMPLE_REPORT: FullReport = {
  target: { kind: "stdio", cmd: "node", args: ["echo.js"] },
  specVersion: "2025-06-18",
  startedAt: "2026-04-27T10:00:00Z",
  finishedAt: "2026-04-27T10:00:01Z",
  durationMs: 1000,
  status: "pass",
  suites: [
    {
      suite: "jsonrpc",
      status: "pass",
      checks: [
        {
          id: "jsonrpc-method-not-found",
          description: "Unknown method returns -32601",
          status: "pass",
          durationMs: 5,
        },
      ],
      durationMs: 5,
      startedAt: "2026-04-27T10:00:00Z",
      finishedAt: "2026-04-27T10:00:01Z",
    },
  ],
  summary: { total: 1, passed: 1, failed: 0, warned: 0, skipped: 0 },
};

describe("reporters", () => {
  it("renders valid JSON", () => {
    const out = generateReport(SAMPLE_REPORT, "json");
    const parsed = JSON.parse(out);
    expect(parsed.status).toBe("pass");
    expect(parsed.suites).toHaveLength(1);
  });

  it("renders JUnit XML with required tags", () => {
    const out = generateReport(SAMPLE_REPORT, "junit");
    expect(out).toMatch(/^<\?xml version/);
    expect(out).toContain("<testsuites");
    expect(out).toContain("<testsuite ");
    expect(out).toContain("<testcase ");
  });

  it("renders terminal output with status badge and check id", () => {
    const out = generateReport(SAMPLE_REPORT, "terminal");
    expect(out).toContain("MCP Conformance Report");
    expect(out).toContain("jsonrpc-method-not-found");
    expect(out).toMatch(/PASS|pass/);
  });

  it("escapes XML special chars in JUnit output", () => {
    const r: FullReport = {
      ...SAMPLE_REPORT,
      suites: [
        {
          ...SAMPLE_REPORT.suites[0]!,
          checks: [
            {
              id: "check<&>\"'",
              description: "<weird/>",
              status: "fail",
              message: "<bad>",
            },
          ],
        },
      ],
    };
    const out = generateReport(r, "junit");
    expect(out).not.toContain("<bad>");
    expect(out).toContain("&lt;bad&gt;");
  });
});
