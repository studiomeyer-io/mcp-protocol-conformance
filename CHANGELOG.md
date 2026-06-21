# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] — 2026-06-21

### Fixed

- **Correctness:** `isJsonRpcError()` no longer misclassifies a
  `{ jsonrpc, id, result, error: null }` response as an error. JSON-RPC 2.0 and
  the MCP `Error` interface require an error response to carry an `error`
  member that is an object with a numeric `code`; a success response carries
  `result` and omits `error`. The previous `"error" in response` check turned
  a passing roundtrip into a spurious FAIL/WARN against the (common) servers
  that always serialise an `error: null` default — affecting the smoke, schema,
  capability and version suites. The helper now matches the wire contract and
  the HTTP adapter's own envelope detection. This is a check-accuracy fix: a
  wrong verdict here is worse than a missing check.

### Added

- `jsonrpc` suite gains a `jsonrpc-response-envelope` check enforcing
  JSON-RPC 2.0 §5 — a response must contain exactly one of `result`/`error`.
  It FAILs on `{ result, error: {…} }` (forbidden), WARNs on a hybrid
  `{ result, error: null }` success envelope (tolerated but non-strict) and on
  an empty envelope. No prior suite caught this.
- Test coverage: `tests/jsonrpc-helpers.test.ts` (10 cases pinning the
  `isJsonRpcError` edge cases) + a `hybrid-envelope-server.mjs` fixture and
  four integration tests proving the hybrid `error: null` shape is treated as
  success by smoke/schema yet warned by the envelope check. 110 → 124 tests.

### Changed

- Migrated `vitest.config.ts` off the removed-in-Vitest-4 nested
  `poolOptions.forks.singleFork` to the top-level `pool: "forks"` +
  `fileParallelism: false`, clearing the deprecation warning while keeping
  serial-per-file execution for the stdio/HTTP suites.

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
