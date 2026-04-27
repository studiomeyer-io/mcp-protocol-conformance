# StudioMeyer Open Source Ecosystem

`mcp-protocol-conformance` is part of a family of Claude / MCP tools maintained
by [StudioMeyer](https://studiomeyer.io). Each project is self-contained; they
just happen to compose well.

## Related open-source projects

- **[mcp-server-attestation](https://github.com/studiomeyer-io/mcp-server-attestation)**
  — Layer-2 supply-chain hardening for MCP servers. Ed25519-signed tool
  manifests, runtime spawn-attestation, default-deny argument sanitizer.
  Direct response to OX Security marketplace-poisoning + CVE-2025-69256 +
  CVE-2025-61591. Pairs naturally with conformance: a server can be both
  spec-conformant *and* attested.
- **[local-memory-mcp](https://github.com/studiomeyer-io/local-memory-mcp)**
  — Persistent local memory for Claude, Cursor, Codex. SQLite + FTS5 +
  knowledge graph, stdio-only, zero cloud.
- **[mcp-personal-suite](https://github.com/studiomeyer-io/mcp-personal-suite)**
  — 49 MCP tools for email / calendar / messaging / search / image. Local-first,
  BYOK, zero telemetry.
- **[mcp-video](https://github.com/studiomeyer-io/mcp-video)** — Cinema-grade
  video production MCP server. ffmpeg + Playwright, 8 consolidated tools.
- **[mcp-crew](https://github.com/studiomeyer-io/mcp-crew)** — Agent personas
  for Claude. 8 built-in personas plus user-defined ones.
- **[agent-fleet](https://github.com/studiomeyer-io/agent-fleet)** — Multi-agent
  orchestration for Claude Code CLI. 7 agents, MCP tool integration.
- **[ai-shield](https://github.com/studiomeyer-io/ai-shield)** — LLM security
  for TypeScript. Prompt-injection detection, PII, cost control.
- **[darwin-agents](https://github.com/studiomeyer-io/darwin-agents)** —
  Self-evolving agent framework. A/B testing of prompts, multi-model critics.

## How conformance connects

This package is the **acceptance test**: every other StudioMeyer MCP build runs
through it before promotion (npm publish, marketplace submit, upstream PR). It
is also a generic harness — point it at any MCP server (yours or someone
else's), pick a spec version (`2024-11-05`, `2025-03-26`, `2025-06-18`), and
get a JSON / JUnit / SARIF report on JSON-RPC compliance, OAuth 2.1 PKCE
behaviour, tool-schema validity, capability advertisement, smoke roundtrip,
and annotation hygiene.

It pairs especially well with `mcp-server-attestation` — once your server
passes conformance, attest it; once it is attested, ship it.

## Discussion

- Issues: [github.com/studiomeyer-io/mcp-protocol-conformance/issues](https://github.com/studiomeyer-io/mcp-protocol-conformance/issues)
- Discussions: [github.com/studiomeyer-io/mcp-protocol-conformance/discussions](https://github.com/studiomeyer-io/mcp-protocol-conformance/discussions)
- Website: [studiomeyer.io](https://studiomeyer.io)
