import { describe, expect, it } from "vitest";
import { compareManifests, assertNoBreakingChanges } from "../src/diff.js";
import type { FullReport, ToolManifest } from "../src/types.js";

describe("compareManifests", () => {
  const baseline: ToolManifest = {
    tools: [
      { name: "a", description: "first", inputSchema: { type: "object" } },
      { name: "b", description: "second", inputSchema: { type: "object" } },
    ],
  };

  it("returns identical=true for equal manifests", () => {
    const diff = compareManifests(baseline, baseline);
    expect(diff.identical).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("flags added tools", () => {
    const actual: ToolManifest = {
      tools: [
        ...baseline.tools,
        { name: "c", description: "new", inputSchema: { type: "object" } },
      ],
    };
    const diff = compareManifests(baseline, actual);
    expect(diff.added).toEqual(["c"]);
    expect(diff.removed).toEqual([]);
    expect(diff.identical).toBe(false);
  });

  it("flags removed tools", () => {
    const actual: ToolManifest = { tools: [baseline.tools[0]!] };
    const diff = compareManifests(baseline, actual);
    expect(diff.removed).toEqual(["b"]);
    expect(diff.added).toEqual([]);
  });

  it("flags changed input schemas", () => {
    const actual: ToolManifest = {
      tools: [
        baseline.tools[0]!,
        {
          name: "b",
          description: "second",
          inputSchema: {
            type: "object",
            properties: { x: { type: "string" } },
          },
        },
      ],
    };
    const diff = compareManifests(baseline, actual);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]!.name).toBe("b");
    expect(diff.changed[0]!.differences).toContain("inputSchema differs");
  });

  // F2 Round 2 fix: key-order in input schemas must NOT register as "changed"
  it("ignores key-order differences in inputSchema (F2 Round 2)", () => {
    const expected: ToolManifest = {
      tools: [
        {
          name: "a",
          description: "first",
          inputSchema: {
            type: "object",
            properties: { x: { type: "string" }, y: { type: "number" } },
            required: ["x", "y"],
          },
        },
      ],
    };
    const actual: ToolManifest = {
      tools: [
        {
          name: "a",
          description: "first",
          inputSchema: {
            // same content, different key order
            required: ["x", "y"],
            properties: { y: { type: "number" }, x: { type: "string" } },
            type: "object",
          },
        },
      ],
    };
    const diff = compareManifests(expected, actual);
    expect(diff.identical).toBe(true);
    expect(diff.changed).toEqual([]);
  });
});

describe("assertNoBreakingChanges", () => {
  function makeReport(status: "pass" | "fail" | "warn"): FullReport {
    return {
      target: { kind: "stdio", cmd: "fake" },
      specVersion: "2025-06-18",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      status,
      suites: [
        {
          suite: "smoke",
          status,
          checks: [
            {
              id: "smoke-echo",
              description: "echo works",
              status: status === "pass" ? "pass" : "fail",
            },
          ],
          durationMs: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
      ],
      summary: { total: 1, passed: 0, failed: 0, warned: 0, skipped: 0 },
    };
  }

  it("flags overall status regression as breaking", () => {
    const r = assertNoBreakingChanges(
      makeReport("pass"),
      makeReport("fail"),
    );
    expect(r.hasBreakingChanges).toBe(true);
    expect(r.breakingChanges.length).toBeGreaterThan(0);
  });

  it("does not flag identical reports", () => {
    const r = assertNoBreakingChanges(
      makeReport("pass"),
      makeReport("pass"),
    );
    expect(r.hasBreakingChanges).toBe(false);
  });

  // F4 Round 2 fix: check-level pass→warn surfaces as warning (was silent)
  it("warns on check-level pass→warn drift (F4 Round 2)", () => {
    const baseline: FullReport = {
      target: { kind: "stdio", cmd: "fake" },
      specVersion: "2025-06-18",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      status: "pass",
      suites: [
        {
          suite: "annotations",
          status: "pass",
          checks: [
            { id: "ann-1", description: "tool A annotation honest", status: "pass" },
            { id: "ann-2", description: "tool B annotation honest", status: "pass" },
          ],
          durationMs: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
      ],
      summary: { total: 2, passed: 2, failed: 0, warned: 0, skipped: 0 },
    };
    const current: FullReport = {
      ...baseline,
      suites: [
        {
          ...baseline.suites[0]!,
          checks: [
            { id: "ann-1", description: "tool A annotation honest", status: "pass" },
            { id: "ann-2", description: "tool B annotation honest", status: "warn" },
          ],
        },
      ],
    };
    const r = assertNoBreakingChanges(baseline, current);
    expect(r.hasBreakingChanges).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/Check 'ann-2'.*pass to warn/);
  });
});
