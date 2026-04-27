/**
 * Round 3 M2 + M4 Hardening: parseSuiteSelector validation + JSON read errors.
 *
 * The CLI helpers `parseSuiteSelector` and `readJsonFile` are local to
 * `src/cli.ts`. We test their behaviour via direct subprocess invocation —
 * the alternative (re-exporting them from cli.ts) leaks helpers to consumers.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "..", "src", "cli.ts");

function runCli(
  args: string[],
): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("npx", ["tsx", cliPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS: "0" },
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as {
      status: number;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

describe("CLI Round 3 hardening", () => {
  describe("M4 — readJsonFile friendly errors", () => {
    it("returns clear error on missing report file", () => {
      const r = runCli([
        "report",
        "--in",
        "/tmp/does-not-exist-xyz.json",
        "--format",
        "terminal",
      ]);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/Cannot read|ENOENT/i);
    }, 30_000);

    it("returns clear error on malformed JSON", () => {
      const dir = mkdtempSync(join(tmpdir(), "mcp-conf-cli-"));
      const path = join(dir, "bad.json");
      writeFileSync(path, "{ not valid json");
      try {
        const r = runCli(["report", "--in", path, "--format", "terminal"]);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/not valid JSON/i);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 30_000);
  });

  describe("M2 — parseSuiteSelector validation", () => {
    it("rejects unknown suite names with a clear message", () => {
      const r = runCli([
        "run",
        "--target",
        "stdio",
        "--cmd",
        "node",
        "--cmd-arg",
        "-e",
        "--cmd-arg",
        "process.exit(0)",
        "--spec",
        "2025-06-18",
        "--suite",
        "jsonrpc,unknownSuiteXYZ",
      ]);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/Unknown suite name/i);
      expect(r.stderr + r.stdout).toMatch(/unknownSuiteXYZ/);
    }, 30_000);

    it("rejects empty suite list", () => {
      const r = runCli([
        "run",
        "--target",
        "stdio",
        "--cmd",
        "node",
        "--spec",
        "2025-06-18",
        "--suite",
        ",,",
      ]);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/empty/i);
    }, 30_000);
  });
});
