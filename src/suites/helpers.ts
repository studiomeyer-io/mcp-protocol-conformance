/**
 * Helpers shared by suites that need an initialized session before they
 * can call other methods.
 */

import type { TargetAdapter } from "../targets/types.js";

export async function initializeAdapter(
  adapter: TargetAdapter,
  protocolVersion: string = "2025-06-18",
): Promise<void> {
  await adapter.request("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: {
      name: "mcp-protocol-conformance",
      version: "0.1.0",
    },
  });
  try {
    await adapter.notify("notifications/initialized");
  } catch {
    // some servers tolerate missing initialized notification; ignored here
  }
}
