# Security policy

## Reporting a vulnerability

Email `security@studiomeyer.io` or open a GitHub Security Advisory on this
repository. We respond within 72 hours.

Do not file public issues for vulnerabilities. Do not test against production
servers other than your own.

## Scope

- Bypasses of the SSRF guard in `src/lib/url-guard.ts` (private-network /
  metadata-endpoint targets reachable through user-supplied URLs).
- Bypasses of the suite-selector allowlist that lead to file-system access or
  command execution.
- Spec misinterpretations that would let a non-conformant MCP server pass
  the harness as conformant.
- Bypasses of the 64 KB schema-size guard that let an adversarial
  server-supplied `inputSchema` / `outputSchema` reach `ajv.compile` and
  exhaust CPU in the harness process.
- Mock authorization server (`src/test-fixtures/mock-as.ts`) flaws that
  could be exploited if the file is reused outside its CI-fixture role.

## Out of scope

- Denial-of-service through giant target-server *responses* — outputs are
  streamed (the schema-compile path itself is guarded; see Scope).
- Breakage of older spec versions (`2024-11-05`) due to upstream MCP-spec
  errata; we follow the published spec text.

## Disclosure timeline

We follow coordinated disclosure with a 90-day public-disclosure clock
starting from the report date.
