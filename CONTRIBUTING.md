# Contributing

## Local setup

```bash
git clone https://github.com/studiomeyer-io/mcp-protocol-conformance.git
cd mcp-protocol-conformance
npm install
npm run typecheck
npm test
```

## Pull requests

- Add a test for every new behaviour. Tests live in `tests/*.test.ts`
  (`specs.test.ts` for the spec tables, `integration.test.ts` for suites driven
  against the `tests/fixtures/*.mjs` stdio servers, `server.test.ts` for the
  MCP-tool dispatch path).
- A new suite must declare its name in the allowlist (`SUITE_NAMES` in
  `src/types.ts`), be dispatched in `src/suites/full.ts`, and be documented in
  the README compatibility matrix.
- Spec-version handling: a check that applies only to a newer spec is gated on a
  declarative `SpecTable` field (e.g. `if (spec.tasks?.supported)` or
  `if (spec.structuredToolOutput)`), never on `if (spec === "...")`. Older specs
  leave the field unset, so they stay byte-for-byte unaffected.
- No `any`, no shelling out from suite code, no mutation of input arguments.
- Run `npm run typecheck` and `npm test` before opening a PR.

## Versioning

Semantic versioning. Adding a new optional check is a minor bump. Renaming an
existing failure code or removing a suite is a major bump.

## Adding support for a new MCP spec version

1. Add the version string to the `SpecVersionSchema` enum and
   `SUPPORTED_SPEC_VERSIONS` in `src/types.ts`.
2. Create `src/specs/<version>.ts` exporting a `SpecTable` (start from the
   previous version, add only the deltas as optional fields), and register it in
   `src/specs/index.ts`.
3. Gate any new check in the relevant suite on the new `SpecTable` field, and
   thread `specVersion` if the suite opens its own `initialize` (see
   `src/suites/full.ts` + `helpers.ts`).
4. Add a `tests/fixtures/<name>-server.mjs` stdio fixture that advertises the new
   surface, plus tests in `tests/specs.test.ts` (table) and
   `tests/integration.test.ts` (suite behaviour).
5. Update the `--spec` help text in `src/cli.ts`, the README compatibility
   matrix + spec references, the `mcp.supportedSpecVersions` array in
   `package.json`, and this CHANGELOG.
