import type { FullReport } from "../types.js";
import { renderJson } from "./json.js";
import { renderJunit } from "./junit.js";
import { renderTerminal } from "./terminal.js";

export type ReportFormat = "json" | "junit" | "terminal";

export function generateReport(
  report: FullReport,
  format: ReportFormat,
): string {
  switch (format) {
    case "json":
      return renderJson(report);
    case "junit":
      return renderJunit(report);
    case "terminal":
      return renderTerminal(report);
  }
}

export { renderJson, renderJunit, renderTerminal };
