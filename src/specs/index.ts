/**
 * Spec table registry. Pick a spec table by version.
 */

import type { SpecVersion } from "../types.js";
import type { SpecTable } from "./types.js";
import { SPEC_2024_11_05 } from "./2024-11-05.js";
import { SPEC_2025_03_26 } from "./2025-03-26.js";
import { SPEC_2025_06_18 } from "./2025-06-18.js";

const REGISTRY: Record<SpecVersion, SpecTable> = {
  "2024-11-05": SPEC_2024_11_05,
  "2025-03-26": SPEC_2025_03_26,
  "2025-06-18": SPEC_2025_06_18,
};

export function getSpec(version: SpecVersion): SpecTable {
  const spec = REGISTRY[version];
  if (!spec) {
    throw new Error(`Unknown MCP spec version: ${version}`);
  }
  return spec;
}

export function listSpecVersions(): SpecVersion[] {
  return Object.keys(REGISTRY) as SpecVersion[];
}

export type { SpecTable, MethodDescriptor, OauthRequirements } from "./types.js";
export { SPEC_2024_11_05, SPEC_2025_03_26, SPEC_2025_06_18 };
