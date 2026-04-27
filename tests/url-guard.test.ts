import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  checkUrlAgainstSsrfRules,
  isAllowedTargetUrl,
} from "../src/lib/url-guard.js";
import { HttpTargetSchema } from "../src/types.js";

describe("url-guard — SSRF policy (HIGH-1 fix Round 3)", () => {
  describe("checkUrlAgainstSsrfRules — default policy (allowPrivate=false)", () => {
    it.each([
      ["public IPv4", "https://api.example.com/path"],
      ["public domain", "https://memory.studiomeyer.io/mcp"],
      ["http public", "http://example.com/"],
    ])("allows %s", (_label, url) => {
      const r = checkUrlAgainstSsrfRules(url);
      expect(r.ok).toBe(true);
    });

    it.each([
      ["AWS IMDS", "http://169.254.169.254/latest/meta-data/"],
      ["GCP IMDS", "http://169.254.170.2/"],
      ["loopback IPv4", "http://127.0.0.1:6379/"],
      ["loopback IPv4 alt range", "http://127.5.5.5/"],
      ["localhost name", "http://localhost:3000/"],
      ["localhost mixed case", "http://LocalHost:3000/"],
      ["RFC1918 10/8", "http://10.0.0.1/"],
      ["RFC1918 192.168/16", "http://192.168.1.5/"],
      ["RFC1918 172.16/12", "http://172.16.0.1/"],
      ["RFC1918 172.31 boundary", "http://172.31.255.254/"],
      ["unspecified 0/8", "http://0.0.0.0/"],
      ["IPv6 loopback", "http://[::1]/"],
      ["IPv6 link-local", "http://[fe80::1]/"],
      ["IPv6 ULA fc00", "http://[fc00::1]/"],
      ["IPv6 ULA fd00", "http://[fd12:3456::1]/"],
      ["IPv4 mapped IPv6", "http://[::ffff:127.0.0.1]/"],
      ["multicast 224/4", "http://224.0.0.1/"],
      ["CGNAT 100.64", "http://100.64.0.1/"],
    ])("blocks %s", (_label, url) => {
      const r = checkUrlAgainstSsrfRules(url);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/private|loopback|link-local|multicast/i);
    });

    it.each([
      ["file://", "file:///etc/passwd"],
      ["gopher://", "gopher://localhost/"],
      ["javascript:", "javascript:alert(1)"],
      ["ftp://", "ftp://example.com/"],
    ])("blocks non-http(s) scheme: %s", (_label, url) => {
      const r = checkUrlAgainstSsrfRules(url);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/Scheme/i);
    });

    it("rejects unparseable URLs", () => {
      const r = checkUrlAgainstSsrfRules("not a url");
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/parseable/);
    });
  });

  describe("checkUrlAgainstSsrfRules — allowPrivate=true bypass", () => {
    it("allows loopback when explicitly opted in", () => {
      const r = checkUrlAgainstSsrfRules("http://127.0.0.1:8080/", {
        allowPrivate: true,
      });
      expect(r.ok).toBe(true);
    });

    it("still blocks non-http schemes even with allowPrivate", () => {
      const r = checkUrlAgainstSsrfRules("file:///etc/passwd", {
        allowPrivate: true,
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("isAllowedTargetUrl — env-var bridge", () => {
    let original: string | undefined;

    beforeEach(() => {
      original = process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"];
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"];
      } else {
        process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"] = original;
      }
    });

    it("blocks private when env unset", () => {
      delete process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"];
      const r = isAllowedTargetUrl("http://127.0.0.1:3000/");
      expect(r.ok).toBe(false);
    });

    it("allows private when env=1", () => {
      process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"] = "1";
      const r = isAllowedTargetUrl("http://127.0.0.1:3000/");
      expect(r.ok).toBe(true);
    });

    it("blocks private when env=0", () => {
      process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"] = "0";
      const r = isAllowedTargetUrl("http://127.0.0.1:3000/");
      expect(r.ok).toBe(false);
    });
  });

  describe("HttpTargetSchema integration", () => {
    let original: string | undefined;

    beforeEach(() => {
      original = process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"];
      delete process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"];
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"];
      } else {
        process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"] = original;
      }
    });

    it("Zod refine rejects loopback URLs", () => {
      const result = HttpTargetSchema.safeParse({
        kind: "http",
        url: "http://127.0.0.1:8080/",
      });
      expect(result.success).toBe(false);
    });

    it("Zod refine rejects AWS IMDS", () => {
      const result = HttpTargetSchema.safeParse({
        kind: "http",
        url: "http://169.254.169.254/latest/meta-data/",
      });
      expect(result.success).toBe(false);
    });

    it("Zod refine accepts public URLs", () => {
      const result = HttpTargetSchema.safeParse({
        kind: "http",
        url: "https://memory.studiomeyer.io/mcp",
      });
      expect(result.success).toBe(true);
    });

    it("Zod refine accepts loopback when env opt-in is set", () => {
      process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"] = "1";
      const result = HttpTargetSchema.safeParse({
        kind: "http",
        url: "http://127.0.0.1:3000/mcp",
      });
      expect(result.success).toBe(true);
    });
  });
});
