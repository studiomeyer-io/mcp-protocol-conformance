import { describe, expect, it } from "vitest";
import {
  getSpec,
  listSpecVersions,
  SPEC_2024_11_05,
  SPEC_2025_03_26,
  SPEC_2025_06_18,
} from "../src/specs/index.js";

describe("spec registry", () => {
  it("lists all three supported versions", () => {
    expect(listSpecVersions()).toEqual([
      "2024-11-05",
      "2025-03-26",
      "2025-06-18",
    ]);
  });

  it("returns the correct spec table per version", () => {
    expect(getSpec("2024-11-05")).toBe(SPEC_2024_11_05);
    expect(getSpec("2025-03-26")).toBe(SPEC_2025_03_26);
    expect(getSpec("2025-06-18")).toBe(SPEC_2025_06_18);
  });

  it("declares all five canonical JSON-RPC error codes per version", () => {
    for (const v of ["2024-11-05", "2025-03-26", "2025-06-18"] as const) {
      const spec = getSpec(v);
      for (const code of ["-32700", "-32600", "-32601", "-32602", "-32603"]) {
        expect(spec.errorCodes).toHaveProperty(code);
      }
    }
  });

  it("requires initialize and notifications/initialized in every spec", () => {
    for (const v of ["2024-11-05", "2025-03-26", "2025-06-18"] as const) {
      const spec = getSpec(v);
      expect(spec.methods["initialize"].required).toBe(true);
      expect(spec.methods["notifications/initialized"].required).toBe(true);
    }
  });

  it("introduces streamable-http transport from 2025-03-26 onwards", () => {
    expect(SPEC_2024_11_05.transports).not.toContain("streamable-http");
    expect(SPEC_2025_03_26.transports).toContain("streamable-http");
    expect(SPEC_2025_06_18.transports).toContain("streamable-http");
  });

  it("introduces tool annotations only in 2025-06-18", () => {
    expect(SPEC_2024_11_05.toolAnnotationsSupported).toBeUndefined();
    expect(SPEC_2025_03_26.toolAnnotationsSupported).toBeUndefined();
    expect(SPEC_2025_06_18.toolAnnotationsSupported).toBe(true);
  });

  it("requires PKCE S256 challenge method in 2025-03-26+", () => {
    expect(SPEC_2024_11_05.oauth.flow).toBe("none");
    expect(SPEC_2025_03_26.oauth.flow).toBe("authorization_code_pkce");
    expect(SPEC_2025_03_26.oauth.challenge_method).toBe("S256");
    expect(SPEC_2025_06_18.oauth.challenge_method).toBe("S256");
  });

  it("throws on unknown version", () => {
    expect(() =>
      getSpec("9999-01-01" as unknown as "2024-11-05"),
    ).toThrowError();
  });
});
