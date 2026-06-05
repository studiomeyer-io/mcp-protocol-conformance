# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-06-06

### Added

- Support for MCP spec **2025-11-25** (current stable production base). New
  `src/specs/2025-11-25.ts` spec table: experimental `tasks` capability
  (`tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`,
  `notifications/tasks/status`), `sampling/createMessage` tool-calling,
  elicitation primitive defaults, JSON Schema 2020-12 default dialect, and the
  additive Tool-object surfaces (`title`, `icons`, `execution`, `outputSchema`,
  `_meta`).
- `capability` suite probes the `tasks` capability; `schema` suite validates a
  tool's `outputSchema` and warns on a missing `title` — both gated to
  2025-11-25 only, so older specs are byte-for-byte unaffected.
- `mcp2511-server.mjs` test fixture plus integration + MCP-tool-dispatch tests
  covering the new surfaces.

### Changed

- The requested spec version is now threaded through every suite and through
  the MCP-tool dispatch surface (`runTransportSuite`, `runToolSchemaValidation`,
  `runCapabilityIntrospection`, `runRoundtripSmoke`, `runAnnotationsAudit`,
  `runOauthPkceFlow`), replacing a hardcoded `2025-06-18` in the initialize
  handshake.
- The `capability` suite records a rejected `initialize` as `warn` + skip
  (a version mismatch is the version suite's verdict) rather than a hard fail.

### Security

- `ajv.compile` on server-supplied `inputSchema` / `outputSchema` is now
  size-guarded (64 KB) to prevent CPU exhaustion from adversarial schemas.
- Pinned `fast-uri >= 3.1.2` via `overrides`.

## [0.1.1] — 2026-04-28

### Added

- `mcpName` field in `package.json` (`io.studiomeyer/protocol-conformance`)
  so the package can be claimed and listed in the official MCP Registry.

## [0.1.0] — 2026-04-27

Initial release.

### Added

- 12 read-only MCP tools for protocol conformance testing.
- 8 test suites: `jsonrpc`, `version`, `transport`, `oauth`, `schema`,
  `capability`, `smoke`, `annotations`.
- Support for MCP spec versions `2024-11-05`, `2025-03-26`, `2025-06-18`.
- CLI binary `mcp-conformance` with `run`, `compare`, `assert-no-breaking`
  subcommands. Output formats: terminal, JSON, JUnit, SARIF.
- Library entry: `import { runSuites, ... } from "mcp-protocol-conformance"`.
- Stdio + Streamable HTTP transports.
- OAuth 2.1 PKCE flow validation against an in-process mock authorization
  server (`src/test-fixtures/mock-as.ts`).
- Annotation hygiene check with destructive-hint heuristic.

### Security

- SSRF guard on HTTP target URLs (loopback, RFC1918, link-local, IPv6 ULA,
  IPv6-mapped-IPv4, multicast). Opt-out via
  `MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS=1` for testing your own infra.
- Mock-AS body-size cap (4 KB).
- Mock-AS RFC 6749 §4.1.3 redirect-uri match check.
- Suite selector validated against allowlist.

[0.1.0]: https://github.com/studiomeyer-io/mcp-protocol-conformance/releases/tag/v0.1.0
