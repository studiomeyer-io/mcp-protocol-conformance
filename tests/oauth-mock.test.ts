import { describe, expect, it } from "vitest";
import pkceChallenge from "pkce-challenge";
import {
  exerciseMockAuthorizationServer,
  startMockAuthorizationServer,
} from "../src/test-fixtures/mock-as.js";

describe("mock authorization server (PKCE S256)", () => {
  it("performs full PKCE flow + refresh rotation + negative test", async () => {
    const result = await exerciseMockAuthorizationServer({
      clientId: "test-client",
      redirectUri: "http://127.0.0.1:8765/callback",
      scopes: ["mcp.read"],
    });
    const ids = result.checks.map((c) => c.id);
    expect(ids).toContain("oauth-mock-authorize");
    expect(ids).toContain("oauth-mock-token-exchange");
    expect(ids).toContain("oauth-mock-refresh-rotation");
    expect(ids).toContain("oauth-mock-pkce-negative");
    for (const c of result.checks) {
      expect(c.status, `${c.id} should pass: ${c.message}`).toBe("pass");
    }
  }, 15_000);

  describe("Round 3 hardening — direct mock-AS contract", () => {
    it("H3: rejects token exchange when redirect_uri does not match the /authorize value (RFC 6749 §4.1.3)", async () => {
      const handle = await startMockAuthorizationServer();
      try {
        const challenge = await pkceChallenge();
        const auth = new URL(`${handle.baseUrl}/authorize`);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("client_id", "tc");
        auth.searchParams.set(
          "redirect_uri",
          "http://127.0.0.1:8765/callback-original",
        );
        auth.searchParams.set("code_challenge", challenge.code_challenge);
        auth.searchParams.set("code_challenge_method", "S256");
        const ar = await fetch(auth, { redirect: "manual" });
        const code = new URL(ar.headers.get("location")!).searchParams.get(
          "code",
        )!;

        const tokenBody = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: challenge.code_verifier,
          client_id: "tc",
          // mismatched redirect_uri
          redirect_uri: "http://127.0.0.1:8765/callback-attacker",
        });
        const tr = await fetch(`${handle.baseUrl}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenBody.toString(),
        });
        expect(tr.status).toBe(400);
        const body = (await tr.json()) as {
          error?: string;
          error_description?: string;
        };
        expect(body.error).toBe("invalid_grant");
        expect(body.error_description).toMatch(/redirect_uri/);
      } finally {
        await handle.close();
      }
    }, 15_000);

    it("H3: accepts token exchange when redirect_uri matches the /authorize value", async () => {
      const handle = await startMockAuthorizationServer();
      try {
        const challenge = await pkceChallenge();
        const redirect = "http://127.0.0.1:8765/callback-ok";
        const auth = new URL(`${handle.baseUrl}/authorize`);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("client_id", "tc");
        auth.searchParams.set("redirect_uri", redirect);
        auth.searchParams.set("code_challenge", challenge.code_challenge);
        auth.searchParams.set("code_challenge_method", "S256");
        const ar = await fetch(auth, { redirect: "manual" });
        const code = new URL(ar.headers.get("location")!).searchParams.get(
          "code",
        )!;

        const tr = await fetch(`${handle.baseUrl}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: challenge.code_verifier,
            client_id: "tc",
            redirect_uri: redirect,
          }).toString(),
        });
        expect(tr.status).toBe(200);
        const body = (await tr.json()) as { access_token?: string };
        expect(body.access_token).toBeTruthy();
      } finally {
        await handle.close();
      }
    }, 15_000);

    it("H2: rejects oversized request body (4KB cap) with HTTP 413", async () => {
      const handle = await startMockAuthorizationServer();
      try {
        // 8KB of arbitrary url-encoded padding — well over MAX_BODY_BYTES.
        const padding = "x".repeat(8 * 1024);
        const tr = await fetch(`${handle.baseUrl}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: `grant_type=authorization_code&padding=${padding}`,
        });
        expect(tr.status).toBe(413);
        const body = (await tr.json()) as { error?: string };
        expect(body.error).toBe("request_too_large");
      } finally {
        await handle.close();
      }
    }, 15_000);

    it("rejects refresh_token grant when client_id mismatches the original", async () => {
      const handle = await startMockAuthorizationServer();
      try {
        // First obtain tokens via PKCE on client_id=A.
        const challenge = await pkceChallenge();
        const redirect = "http://127.0.0.1:8765/callback";
        const auth = new URL(`${handle.baseUrl}/authorize`);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("client_id", "client-A");
        auth.searchParams.set("redirect_uri", redirect);
        auth.searchParams.set("code_challenge", challenge.code_challenge);
        auth.searchParams.set("code_challenge_method", "S256");
        const ar = await fetch(auth, { redirect: "manual" });
        const code = new URL(ar.headers.get("location")!).searchParams.get(
          "code",
        )!;
        const tr = await fetch(`${handle.baseUrl}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: challenge.code_verifier,
            client_id: "client-A",
            redirect_uri: redirect,
          }).toString(),
        });
        const tokens = (await tr.json()) as { refresh_token?: string };
        const refreshToken = tokens.refresh_token!;

        // Now attempt to refresh with a different client_id.
        const rr = await fetch(`${handle.baseUrl}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: "client-B",
          }).toString(),
        });
        expect(rr.status).toBe(400);
        const body = (await rr.json()) as { error?: string };
        expect(body.error).toBe("invalid_client");
      } finally {
        await handle.close();
      }
    }, 15_000);
  });
});
