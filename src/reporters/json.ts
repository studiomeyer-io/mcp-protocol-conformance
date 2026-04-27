/**
 * JSON reporter — machine-readable, stable order.
 */

import type { FullReport } from "../types.js";

export function renderJson(report: FullReport): string {
  return JSON.stringify(report, null, 2);
}
