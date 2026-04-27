/**
 * Version is read from package.json so cli.ts and server.ts cannot drift on
 * the next bump. Single source of truth: ../../package.json (relative to
 * src/lib/version.ts in source, or dist/lib/version.js in build).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/lib/ → ../../package.json
  // dist/lib/ → ../../package.json
  const candidates = [
    resolve(here, "..", "..", "package.json"),
    resolve(here, "..", "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(readFileSync(candidate, "utf8")) as {
        version?: string;
      };
      if (json.version) return json.version;
    } catch {
      // try next candidate
    }
  }
  return "0.0.0";
}
