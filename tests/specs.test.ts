import { describe, expect, it } from "vitest";
import {
  getSpec,
  listSpecVersions,
  SPEC_2024_11_05,
  SPEC_2025_03_26,
  SPEC_2025_06_18,
  SPEC_2025_11_25,
} from "../src/specs/index.js";

const ALL_VERSIONS = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
] as const;

describe("spec registry", () => {
  it("lists all four supported versions", () => {
    expect(listSpecVersions()).toEqual([...ALL_VERSIONS]);
  });

  it("returns the correct spec table per version", () => {
    expect(getSpec("2024-11-05")).toBe(SPEC_2024_11_05);
    expect(getSpec("2025-03-26")).toBe(SPEC_2025_03_26);
    expect(getSpec("2025-06-18")).toBe(SPEC_2025_06_18);
    expect(getSpec("2025-11-25")).toBe(SPEC_2025_11_25);
  });

  it("declares all five canonical JSON-RPC error codes per version", () => {
    for (const v of ALL_VERSIONS) {
      const spec = getSpec(v);
      for (const code of ["-32700", "-32600", "-32601", "-32602", "-32603"]) {
        expect(spec.errorCodes).toHaveProperty(code);
      }
    }
  });

  it("requires initialize and notifications/initialized in every spec", () => {
    for (const v of ALL_VERSIONS) {
      const spec = getSpec(v);
      expect(spec.methods["initialize"].required).toBe(true);
      expect(spec.methods["notifications/initialized"].required).toBe(true);
    }
  });

  it("introduces streamable-http transport from 2025-03-26 onwards", () => {
    expect(SPEC_2024_11_05.transports).not.toContain("streamable-http");
    expect(SPEC_2025_03_26.transports).toContain("streamable-http");
    expect(SPEC_2025_06_18.transports).toContain("streamable-http");
    expect(SPEC_2025_11_25.transports).toContain("streamable-http");
  });

  it("introduces tool annotations from 2025-06-18 onwards", () => {
    expect(SPEC_2024_11_05.toolAnnotationsSupported).toBeUndefined();
    expect(SPEC_2025_03_26.toolAnnotationsSupported).toBeUndefined();
    expect(SPEC_2025_06_18.toolAnnotationsSupported).toBe(true);
    expect(SPEC_2025_11_25.toolAnnotationsSupported).toBe(true);
  });

  it("requires PKCE S256 challenge method in 2025-03-26+", () => {
    expect(SPEC_2024_11_05.oauth.flow).toBe("none");
    expect(SPEC_2025_03_26.oauth.flow).toBe("authorization_code_pkce");
    expect(SPEC_2025_03_26.oauth.challenge_method).toBe("S256");
    expect(SPEC_2025_06_18.oauth.challenge_method).toBe("S256");
    expect(SPEC_2025_11_25.oauth.challenge_method).toBe("S256");
  });

  it("throws on unknown version", () => {
    expect(() =>
      getSpec("9999-01-01" as unknown as "2024-11-05"),
    ).toThrowError();
  });
});

describe("spec 2025-11-25 deltas vs 2025-06-18", () => {
  it("adds the full experimental tasks surface + capability", () => {
    for (const m of ["tasks/get", "tasks/result", "tasks/list", "tasks/cancel"]) {
      expect(SPEC_2025_11_25.methods[m]).toBeDefined();
    }
    expect(
      SPEC_2025_11_25.methods["notifications/tasks/status"]?.notification,
    ).toBe(true);
    expect(SPEC_2025_11_25.optionalCapabilities).toContain("tasks");
    expect(SPEC_2025_11_25.tasks?.supported).toBe(true);
    expect(SPEC_2025_11_25.tasks?.methods).toEqual([
      "tasks/get",
      "tasks/result",
      "tasks/list",
      "tasks/cancel",
    ]);
  });

  it("keeps tasks out of every earlier spec", () => {
    for (const spec of [SPEC_2024_11_05, SPEC_2025_03_26, SPEC_2025_06_18]) {
      expect(spec.tasks).toBeUndefined();
      expect(spec.methods["tasks/list"]).toBeUndefined();
      expect(spec.optionalCapabilities).not.toContain("tasks");
    }
  });

  it("sets the JSON Schema 2020-12 default dialect", () => {
    expect(SPEC_2025_11_25.jsonSchemaDialect).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(SPEC_2025_06_18.jsonSchemaDialect).toBeUndefined();
  });

  it("flags the additive tool-object surfaces (icons/title/outputSchema)", () => {
    expect(SPEC_2025_11_25.structuredToolOutput).toBe(true);
    expect(SPEC_2025_11_25.toolIconsSupported).toBe(true);
    expect(SPEC_2025_11_25.toolTitleSupported).toBe(true);
    // earlier specs leave them unset
    expect(SPEC_2025_06_18.structuredToolOutput).toBeUndefined();
    expect(SPEC_2025_06_18.toolTitleSupported).toBeUndefined();
  });

  it("flags sampling tool-calling and elicitation defaults", () => {
    expect(SPEC_2025_11_25.samplingToolCalling).toBe(true);
    expect(SPEC_2025_11_25.elicitationDefaults).toBe(true);
    expect(SPEC_2025_06_18.samplingToolCalling).toBeUndefined();
    expect(SPEC_2025_06_18.elicitationDefaults).toBeUndefined();
  });
});
