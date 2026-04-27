import { describe, expect, it } from "vitest";
import { auditAnnotations } from "../src/specs/annotations-rules.js";

describe("annotations rules", () => {
  it("warns when destructive verb is used without destructiveHint=true", () => {
    const v = auditAnnotations({ name: "deleteUser", annotations: {} });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]!.rule).toBe("destructive-name-without-destructive-hint");
    expect(v[0]!.severity).toBe("warn");
  });

  it("does not warn when destructive verb has destructiveHint=true", () => {
    const v = auditAnnotations({
      name: "deleteUser",
      annotations: { destructiveHint: true },
    });
    expect(v).toEqual([]);
  });

  it("warns when get-prefix tool sets readOnlyHint=false", () => {
    const v = auditAnnotations({
      name: "getThing",
      annotations: { readOnlyHint: false },
    });
    expect(v.some((x) => x.rule === "read-prefix-with-readonly-false")).toBe(
      true,
    );
  });

  it("fails on the readOnly+destructive impossible combo", () => {
    const v = auditAnnotations({
      name: "doStuff",
      annotations: { readOnlyHint: true, destructiveHint: true },
    });
    expect(v.some((x) => x.severity === "fail")).toBe(true);
  });

  it("returns empty for benign tools", () => {
    const v = auditAnnotations({
      name: "search",
      annotations: { readOnlyHint: true },
    });
    expect(v).toEqual([]);
  });

  describe("M1 Round 3 — extended destructive verb coverage", () => {
    it.each([
      ["terminateSession", "destructive-name-without-destructive-hint"],
      ["revokeToken", "destructive-name-without-destructive-hint"],
      ["killJob", "destructive-name-without-destructive-hint"],
      ["expireCache", "destructive-name-without-destructive-hint"],
      ["overwriteFile", "destructive-name-without-destructive-hint"],
      ["unsetConfig", "destructive-name-without-destructive-hint"],
      ["nukeIndex", "destructive-name-without-destructive-hint"],
      ["eraseHistory", "destructive-name-without-destructive-hint"],
      ["flushQueue", "destructive-name-without-destructive-hint"],
    ])("flags '%s' as destructive without hint", (name, expectedRule) => {
      const v = auditAnnotations({ name, annotations: {} });
      expect(v.some((x) => x.rule === expectedRule)).toBe(true);
    });

    it.each([
      ["peekItem", "read-prefix-with-readonly-false"],
      ["inspectMetadata", "read-prefix-with-readonly-false"],
      ["viewProfile", "read-prefix-with-readonly-false"],
    ])("flags new read-prefix '%s' when readOnlyHint=false", (name, expectedRule) => {
      const v = auditAnnotations({
        name,
        annotations: { readOnlyHint: false },
      });
      expect(v.some((x) => x.rule === expectedRule)).toBe(true);
    });

    it("does not warn when destructive verb is acknowledged via destructiveHint", () => {
      const v = auditAnnotations({
        name: "revokeApiKey",
        annotations: { destructiveHint: true },
      });
      expect(v).toEqual([]);
    });
  });
});
