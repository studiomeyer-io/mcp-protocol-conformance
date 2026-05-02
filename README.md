<!-- studiomeyer-mcp-stack-banner:start -->
> **Part of the [StudioMeyer MCP Stack](https://studiomeyer.io)** — Built in Mallorca 🌴 · ⭐ if you use it
<!-- studiomeyer-mcp-stack-banner:end -->

# mcp-protocol-conformance

Conformance test harness for Model Context Protocol servers. Validates JSON-RPC 2.0 wire compliance, spec-version handshake, transport behaviour, OAuth 2.1 PKCE, tool schemas, capability advertisement, smoke roundtrip, and annotation hygiene against MCP spec 2024-11-05, 2025-03-26, and 2025-06-18.

This is a Foundation build of the StudioMeyer MCP Factory: every other Factory build runs through this harness before promotion (npm publish, marketplace submit, upstream PR).

## Install

```bash
npm install --save-dev mcp-protocol-conformance
```

The package ships both a CLI (`mcp-conformance`) and a TypeScript library entry (`import ... from "mcp-protocol-conformance"`).

## CLI usage

### Run against a stdio server

```bash
mcp-conformance run \
  --target stdio \
  --cmd node \
  --cmd-arg dist/server.js \
  --spec 2025-06-18 \
  --suite all \
  --format terminal
```

### Run against an HTTP server (Streamable HTTP, 2025-03-26+)

```bash
mcp-conformance run \
  --target http \
  --url https://memory.studiomeyer.io/mcp \
  --header "Authorization:Bearer ${TOKEN}" \
  --spec 2025-06-18 \
  --suite full \
  --format json --out report.json
```

### Run only a subset of suites

```bash
mcp-conformance run --target stdio --cmd ./server --spec 2025-06-18 \
  --suite jsonrpc,version,schema
```

### Compare two manifests

```bash
mcp-conformance compare \
  --expected manifests/v1.json \
  --actual   manifests/v2.json
```

### Assert no breaking changes between two reports

```bash
mcp-conformance assert-no-breaking \
  --baseline reports/main.json \
  --current  reports/pr-42.json
```

Exit codes: `0` clean, `1` failures, `2` invocation error.

## Library usage

```ts
import {
  runFullSuite,
  generateReport,
} from "mcp-protocol-conformance";

const report = await runFullSuite(
  { kind: "stdio", cmd: "node", args: ["dist/server.js"] },
  "2025-06-18",
  { suite: "all" },
);

console.log(generateReport(report, "terminal"));
if (report.status === "fail") process.exit(1);
```

## MCP server usage

The harness is itself an MCP server. Start it over stdio and any MCP client can call its 12 tools:

```bash
node dist/server.js
```

Tools (all read-only, all `destructiveHint: false`):

| # | Tool | Purpose |
|---|------|---------|
| 1 | `runJsonRpcCompliance` | JSON-RPC 2.0 error-code suite |
| 2 | `runSpecVersionAssertion` | Verify advertised protocolVersion |
| 3 | `runTransportSuite` | Transport-layer ping + session-id |
| 4 | `runOauthPkceFlow` | OAuth 2.1 PKCE S256 (mock-AS or real-tenant) |
| 5 | `runToolSchemaValidation` | inputSchema is valid JSON-Schema |
| 6 | `runCapabilityIntrospection` | initialize.capabilities matches behaviour |
| 7 | `runRoundtripSmoke` | One tools/call per advertised tool |
| 8 | `runAnnotationsAudit` | readOnlyHint / destructiveHint hygiene |
| 9 | `runFullSuite` | All suites + summary |
| 10 | `generateReport` | Render JUnit / JSON / terminal |
| 11 | `compareManifests` | Diff two tool manifests |
| 12 | `assertNoBreakingChanges` | Diff two FullReports |

## Compatibility matrix

|                    | 2024-11-05 | 2025-03-26 | 2025-06-18 |
|--------------------|:----------:|:----------:|:----------:|
| jsonrpc            | yes        | yes        | yes        |
| version (handshake)| yes        | yes        | yes        |
| transport (stdio)  | yes        | yes        | yes        |
| transport (http)   | n/a        | yes        | yes        |
| oauth (mock)       | n/a        | yes        | yes        |
| oauth (real)       | n/a        | yes        | yes        |
| schema             | yes        | yes        | yes        |
| capability         | yes        | yes        | yes        |
| smoke              | yes        | yes        | yes        |
| annotations        | warn-only  | warn-only  | yes        |

`yes` = suite runs and produces actionable results.
`n/a` = capability not in spec; suite skips automatically.
`warn-only` = suite runs but the spec does not formally require the feature.

## Integration in Factory builds

In every Factory build's `package.json`:

```json
{
  "scripts": {
    "factory:conformance": "mcp-conformance run --target stdio --cmd 'node dist/server.js' --spec 2025-06-18 --suite full"
  }
}
```

In CI:

```yaml
- run: npm run factory:conformance
```

## Spec references

- JSON-RPC 2.0: https://www.jsonrpc.org/specification
- MCP 2024-11-05: https://modelcontextprotocol.io/specification/2024-11-05
- MCP 2025-03-26: https://modelcontextprotocol.io/specification/2025-03-26
- MCP 2025-06-18: https://modelcontextprotocol.io/specification/2025-06-18
- RFC 7636 (PKCE): https://datatracker.ietf.org/doc/html/rfc7636

## About StudioMeyer

[StudioMeyer](https://studiomeyer.io) is an AI and design studio based in Palma de Mallorca, working with clients worldwide. We build custom websites and AI infrastructure for small and medium businesses. Production stack on Claude Agent SDK, MCP and n8n, with Sentry, Langfuse and LangGraph for observability and an in-house guard layer.

## License

MIT — Copyright (c) 2026 Matthias Meyer (StudioMeyer)