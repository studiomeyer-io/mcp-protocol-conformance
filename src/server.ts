#!/usr/bin/env node
/**
 * MCP server wiring.
 *
 * Exposes the 12 conformance tools so this harness can itself be invoked
 * by other MCP clients. Stdio transport by default; HTTP transport is
 * activated when the PORT environment variable is set.
 *
 * Tools (all read-only, all destructiveHint=false):
 *   1. runJsonRpcCompliance
 *   2. runSpecVersionAssertion
 *   3. runTransportSuite
 *   4. runOauthPkceFlow
 *   5. runToolSchemaValidation
 *   6. runCapabilityIntrospection
 *   7. runRoundtripSmoke
 *   8. runAnnotationsAudit
 *   9. runFullSuite
 *  10. generateReport
 *  11. compareManifests
 *  12. assertNoBreakingChanges
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  RunJsonRpcComplianceArgs,
  RunSpecVersionAssertionArgs,
  RunTransportSuiteArgs,
  RunOauthPkceFlowArgs,
  RunToolSchemaValidationArgs,
  RunCapabilityIntrospectionArgs,
  RunRoundtripSmokeArgs,
  RunAnnotationsAuditArgs,
  RunFullSuiteArgs,
  GenerateReportArgs,
  CompareManifestsArgs,
  AssertNoBreakingChangesArgs,
  type FullReport,
} from "./types.js";
import {
  runJsonRpcCompliance,
  runSpecVersionAssertion,
  runTransportSuite,
  runOauthPkceFlow,
  runToolSchemaValidation,
  runCapabilityIntrospection,
  runRoundtripSmoke,
  runAnnotationsAudit,
  runFullSuite,
} from "./suites/index.js";
import {
  generateReport,
  type ReportFormat,
} from "./reporters/index.js";
import { compareManifests, assertNoBreakingChanges } from "./diff.js";
import { readPackageVersion } from "./lib/version.js";

const SERVER_VERSION = readPackageVersion();

// ---------------------------------------------------------------------------
// Tool descriptors
// ---------------------------------------------------------------------------

const ANNOTATIONS_READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const TOOL_DESCRIPTORS = [
  {
    name: "runJsonRpcCompliance",
    description:
      "Run JSON-RPC 2.0 compliance suite (parse-error, invalid-request, method-not-found, invalid-params, internal-error) against a target MCP server.",
    schema: RunJsonRpcComplianceArgs,
  },
  {
    name: "runSpecVersionAssertion",
    description:
      "Drive an initialize handshake and assert the target advertises the expected MCP spec version.",
    schema: RunSpecVersionAssertionArgs,
  },
  {
    name: "runTransportSuite",
    description:
      "Verify the target's transport layer (stdio line-delimited JSON or Streamable HTTP).",
    schema: RunTransportSuiteArgs,
  },
  {
    name: "runOauthPkceFlow",
    description:
      "Exercise OAuth 2.1 PKCE S256 flow against the target. Mock-AS by default; real-tenant when --oauth-mode=real.",
    schema: RunOauthPkceFlowArgs,
  },
  {
    name: "runToolSchemaValidation",
    description:
      "Validate that every advertised tool has a well-formed JSON-Schema inputSchema. Optionally diff against an expected manifest.",
    schema: RunToolSchemaValidationArgs,
  },
  {
    name: "runCapabilityIntrospection",
    description:
      "Compare the capabilities the target advertises in initialize against what tools/list, resources/list, prompts/list actually return.",
    schema: RunCapabilityIntrospectionArgs,
  },
  {
    name: "runRoundtripSmoke",
    description:
      "Perform one tools/call per advertised tool. Fails on JSON-RPC transport errors, warns on tool-level isError=true.",
    schema: RunRoundtripSmokeArgs,
  },
  {
    name: "runAnnotationsAudit",
    description:
      "Apply the heuristic annotation rules (destructive name regex, readOnlyHint conflicts) to every advertised tool.",
    schema: RunAnnotationsAuditArgs,
  },
  {
    name: "runFullSuite",
    description:
      "Run all (or selected) suites and produce a FullReport with summary + per-suite + per-check status.",
    schema: RunFullSuiteArgs,
  },
  {
    name: "generateReport",
    description:
      "Render a FullReport as JUnit XML, JSON, or human-readable terminal output.",
    schema: GenerateReportArgs,
  },
  {
    name: "compareManifests",
    description:
      "Diff two tool manifests — added/removed/changed tools.",
    schema: CompareManifestsArgs,
  },
  {
    name: "assertNoBreakingChanges",
    description:
      "Compare a baseline FullReport against a current FullReport. Returns a list of breaking changes and warnings.",
    schema: AssertNoBreakingChangesArgs,
  },
] as const;

// ---------------------------------------------------------------------------
// Tool implementations (one switch per name; pure dispatch)
// ---------------------------------------------------------------------------

async function dispatchTool(
  name: string,
  rawArgs: unknown,
): Promise<unknown> {
  switch (name) {
    case "runJsonRpcCompliance": {
      const args = RunJsonRpcComplianceArgs.parse(rawArgs);
      return runJsonRpcCompliance(args.target, args.specVersion);
    }
    case "runSpecVersionAssertion": {
      const args = RunSpecVersionAssertionArgs.parse(rawArgs);
      return runSpecVersionAssertion(args.target, args.expectedVersion);
    }
    case "runTransportSuite": {
      const args = RunTransportSuiteArgs.parse(rawArgs);
      return runTransportSuite(args.target, args.transport);
    }
    case "runOauthPkceFlow": {
      const args = RunOauthPkceFlowArgs.parse(rawArgs);
      return runOauthPkceFlow(args.target, {
        mode: "mock",
        clientId: args.clientId,
        redirectUri: args.redirectUri,
        scopes: args.scopes,
      });
    }
    case "runToolSchemaValidation": {
      const args = RunToolSchemaValidationArgs.parse(rawArgs);
      return runToolSchemaValidation(args.target, args.expectedManifest);
    }
    case "runCapabilityIntrospection": {
      const args = RunCapabilityIntrospectionArgs.parse(rawArgs);
      return runCapabilityIntrospection(args.target);
    }
    case "runRoundtripSmoke": {
      const args = RunRoundtripSmokeArgs.parse(rawArgs);
      return runRoundtripSmoke(args.target, args.sampleArgs);
    }
    case "runAnnotationsAudit": {
      const args = RunAnnotationsAuditArgs.parse(rawArgs);
      return runAnnotationsAudit(args.target);
    }
    case "runFullSuite": {
      const args = RunFullSuiteArgs.parse(rawArgs);
      return runFullSuite(args.target, args.specVersion, {
        suite: args.suite,
        oauth: args.oauth,
      });
    }
    case "generateReport": {
      const args = GenerateReportArgs.parse(rawArgs);
      return generateReport(args.report as FullReport, args.format as ReportFormat);
    }
    case "compareManifests": {
      const args = CompareManifestsArgs.parse(rawArgs);
      return compareManifests(args.expected, args.actual);
    }
    case "assertNoBreakingChanges": {
      const args = AssertNoBreakingChangesArgs.parse(rawArgs);
      return assertNoBreakingChanges(
        args.baseline as FullReport,
        args.current as FullReport,
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createConformanceServer(): Server {
  const server = new Server(
    {
      name: "mcp-protocol-conformance",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DESCRIPTORS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema, {
        target: "jsonSchema7",
        $refStrategy: "none",
      }) as Record<string, unknown>,
      annotations: { ...ANNOTATIONS_READ_ONLY },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await dispatchTool(name, args ?? {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createConformanceServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ---------------------------------------------------------------------------
// Entry point — only when invoked directly, not when imported
// ---------------------------------------------------------------------------

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("server.js");

if (isMainModule) {
  // SIGTERM graceful shutdown
  const shutdown = (): void => {
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  startStdioServer().catch((err: unknown) => {
    process.stderr.write(
      `mcp-protocol-conformance failed to start: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
