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

- Add a test for every new behaviour. Suite-level tests live in
  `tests/suites/`, integration tests in `tests/integration/`.
- A new suite must declare its name in the allowlist (`SUITE_NAMES` constant)
  and add documentation in the README.
- Spec-version handling: if a check applies only to one spec version, gate it
  with `if (spec === "...")` rather than forking the suite.
- No `any`, no shelling out from suite code, no mutation of input arguments.
- Run `npm run typecheck` and `npm test` before opening a PR.

## Versioning

Semantic versioning. Adding a new optional check is a minor bump. Renaming an
existing failure code or removing a suite is a major bump.

## Adding support for a new MCP spec version

1. Add the version string to `SUPPORTED_SPEC_VERSIONS` in `src/lib/spec.ts`.
2. Update each suite's `applicableSpecs` to include or exclude the version.
3. Add a fixture pair (`tests/fixtures/server-conformant-<version>.json`,
   `tests/fixtures/server-broken-<version>.json`).
4. Reference the new version in the README install + usage examples.
