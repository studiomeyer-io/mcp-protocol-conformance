/**
 * Manifest diff + breaking-change detection.
 *
 * Round 2 fixes:
 *  - F2: replaces JSON.stringify-as-hash with key-stable canonicalize so
 *    inputSchemas that differ only in key-order do NOT register as "changed".
 *  - F4: adds pass→warn detection on check-level (was only on suite-level)
 *    so single-check regressions surface in the breaking-change gate.
 */

import type {
  BreakingChangeReport,
  FullReport,
  ManifestDiff,
  ToolManifest,
} from "./types.js";

/**
 * Recursively sort object keys + drop undefined, then stringify with no
 * extra whitespace. Two semantically-equal objects always produce the same
 * string regardless of insertion order.
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = obj[k];
    if (v === undefined) continue;
    out[k] = canonicalizeValue(v);
  }
  return out;
}

export function compareManifests(
  expected: ToolManifest,
  actual: ToolManifest,
): ManifestDiff {
  const expectedByName = new Map(expected.tools.map((t) => [t.name, t]));
  const actualByName = new Map(actual.tools.map((t) => [t.name, t]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: ManifestDiff["changed"] = [];

  for (const [name] of actualByName) {
    if (!expectedByName.has(name)) added.push(name);
  }
  for (const [name, et] of expectedByName) {
    const at = actualByName.get(name);
    if (!at) {
      removed.push(name);
      continue;
    }
    const diffs: string[] = [];
    if (canonicalize(et.inputSchema ?? {}) !== canonicalize(at.inputSchema ?? {})) {
      diffs.push("inputSchema differs");
    }
    if ((et.description ?? "") !== (at.description ?? "")) {
      diffs.push("description differs");
    }
    if (canonicalize(et.annotations ?? {}) !== canonicalize(at.annotations ?? {})) {
      diffs.push("annotations differ");
    }
    if (diffs.length > 0) {
      changed.push({ name, differences: diffs });
    }
  }

  return {
    added,
    removed,
    changed,
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

export function assertNoBreakingChanges(
  baseline: FullReport,
  current: FullReport,
): BreakingChangeReport {
  const breakingChanges: string[] = [];
  const warnings: string[] = [];

  // Status downgrade is breaking
  if (baseline.status === "pass" && current.status !== "pass") {
    breakingChanges.push(
      `Overall status regressed: ${baseline.status} → ${current.status}`,
    );
  }

  // Suite added or removed
  const baselineSuites = new Set(baseline.suites.map((s) => s.suite));
  const currentSuites = new Set(current.suites.map((s) => s.suite));
  for (const s of baselineSuites) {
    if (!currentSuites.has(s)) {
      warnings.push(`Suite '${s}' present in baseline but not in current`);
    }
  }

  // Per-suite + per-check status regressions
  for (const baseSuite of baseline.suites) {
    const cur = current.suites.find((s) => s.suite === baseSuite.suite);
    if (!cur) continue;
    if (baseSuite.status === "pass" && cur.status === "fail") {
      breakingChanges.push(
        `Suite '${baseSuite.suite}' regressed from pass to fail`,
      );
    } else if (baseSuite.status === "pass" && cur.status === "warn") {
      warnings.push(
        `Suite '${baseSuite.suite}' regressed from pass to warn`,
      );
    }

    // Check-level regressions — F4 fix Round 2: pass→warn now also surfaces
    const baseChecks = new Map(baseSuite.checks.map((c) => [c.id, c]));
    for (const cur2 of cur.checks) {
      const base = baseChecks.get(cur2.id);
      if (!base) continue;
      if (base.status === "pass" && cur2.status === "fail") {
        breakingChanges.push(
          `Check '${cur2.id}' in suite '${baseSuite.suite}' regressed from pass to fail`,
        );
      } else if (base.status === "pass" && cur2.status === "warn") {
        warnings.push(
          `Check '${cur2.id}' in suite '${baseSuite.suite}' regressed from pass to warn`,
        );
      }
    }
  }

  return {
    hasBreakingChanges: breakingChanges.length > 0,
    breakingChanges,
    warnings,
  };
}
