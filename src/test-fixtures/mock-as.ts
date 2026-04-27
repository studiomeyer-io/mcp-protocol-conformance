/**
 * Mock OAuth 2.1 authorization server (RFC-7636 PKCE S256).
 *
 * In-process http server. Used by the OAuth suite when `--oauth-mode mock`
 * (the default). The mock implements:
 *  - GET  /authorize   → returns canned authorization code (after PKCE check)
 *  - POST /token       → exchanges code (verifies code_verifier) for tokens
 *  - POST /token       → with grant_type=refresh_token rotates the refresh token
 *
 * No persistence, no clock-skew tolerance, no clients DB — minimum viable
 * to exercise PKCE and refresh-rotation in a deterministic CI environment.
 */

import { createServer, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import pkceChallenge from "pkce-challenge";
import type { CheckResult } from "../types.js";

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  expiresAt: number;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}

interface MockServerHandle {
  port: number;
  baseUrl: string;
  close(): Promise<void>;
}

export async function startMockAuthorizationServer(): Promise<MockServerHandle> {
  const codes = new Map<string, AuthorizationCode>();
  const refreshTokens = new Map<string, { clientId: string; scope: string }>();

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);
    if (req.method === "GET" && url.pathname === "/authorize") {
      const clientId = url.searchParams.get("client_id");
      const redirectUri = url.searchParams.get("redirect_uri");
      const challenge = url.searchParams.get("code_challenge");
      const challengeMethod = url.searchParams.get("code_challenge_method");
      const scope = url.searchParams.get("scope") ?? "";

      if (!clientId || !redirectUri || !challenge || challengeMethod !== "S256") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: "invalid_request",
            error_description:
              "Missing client_id/redirect_uri/code_challenge or unsupported challenge method.",
          }),
        );
        return;
      }
      const code = randomBytes(16).toString("hex");
      codes.set(code, {
        code,
        clientId,
        redirectUri,
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        scope,
        expiresAt: Date.now() + 60_000,
      });
      const out = new URL(redirectUri);
      out.searchParams.set("code", code);
      res.writeHead(302, { location: out.toString() });
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/token") {
      let body: string;
      try {
        body = await readBody(req);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "request_too_large", error_description: message }));
        // Drain anything still in flight so the client can complete its write
        // and read the 413 body without seeing a socket reset.
        try { req.resume(); } catch { /* noop */ }
        return;
      }
      const params = new URLSearchParams(body);
      const grant = params.get("grant_type");
      if (grant === "authorization_code") {
        const code = params.get("code") ?? "";
        const verifier = params.get("code_verifier") ?? "";
        const clientId = params.get("client_id") ?? "";
        const redirectUri = params.get("redirect_uri") ?? "";
        const stored = codes.get(code);
        if (!stored || stored.expiresAt < Date.now()) {
          return jsonErr(res, "invalid_grant", "Unknown or expired code");
        }
        if (stored.clientId !== clientId) {
          return jsonErr(res, "invalid_client", "client_id mismatch");
        }
        // RFC 6749 §4.1.3 + OAuth 2.1 §4.1.3: token-request redirect_uri MUST
        // match the redirect_uri sent on /authorize. H3 fix Round 3.
        if (stored.redirectUri !== redirectUri) {
          return jsonErr(
            res,
            "invalid_grant",
            "redirect_uri does not match the value used at /authorize",
          );
        }
        const expectedChallenge = createHash("sha256")
          .update(verifier)
          .digest("base64url");
        if (expectedChallenge !== stored.codeChallenge) {
          return jsonErr(
            res,
            "invalid_grant",
            "PKCE code_verifier does not match code_challenge",
          );
        }
        codes.delete(code);
        const tokens = issueTokens(clientId, stored.scope, refreshTokens);
        return json(res, 200, tokens);
      }
      if (grant === "refresh_token") {
        const rt = params.get("refresh_token") ?? "";
        const clientIdRefresh = params.get("client_id") ?? "";
        const stored = refreshTokens.get(rt);
        if (!stored) {
          return jsonErr(res, "invalid_grant", "Unknown refresh_token");
        }
        if (stored.clientId !== clientIdRefresh) {
          return jsonErr(res, "invalid_client", "client_id mismatch");
        }
        // rotate: invalidate old, issue new
        refreshTokens.delete(rt);
        const tokens = issueTokens(stored.clientId, stored.scope, refreshTokens);
        return json(res, 200, tokens);
      }
      return jsonErr(res, "unsupported_grant_type", `grant_type=${grant}`);
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock-AS failed to bind to a port");
  }
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    port,
    baseUrl,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

function issueTokens(
  clientId: string,
  scope: string,
  refreshTokens: Map<string, { clientId: string; scope: string }>,
): TokenPair {
  const access = randomBytes(24).toString("base64url");
  const refresh = randomBytes(24).toString("base64url");
  refreshTokens.set(refresh, { clientId, scope });
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: 3600,
  };
}

/**
 * Read the request body with a hard size cap (4KB).
 *
 * H2 fix Round 3: previously unbounded — a buggy or malicious caller on a
 * shared CI runner could exhaust the Node heap by streaming gigabytes into
 * an in-process mock-AS. Token requests are at most a few hundred bytes;
 * 4KB leaves comfortable headroom for unusual scope strings and PKCE
 * payloads while bounding memory exposure.
 */
const MAX_BODY_BYTES = 4 * 1024;

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on("data", (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        aborted = true;
        // Pause receiving so the heap doesn't grow further. Caller can
        // `req.resume()` after sending the 413 response so the client's
        // write completes and the 413 body is actually read.
        try { req.pause(); } catch { /* noop */ }
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (aborted) return;
      reject(err);
    });
  });
}

function json(
  res: import("http").ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function jsonErr(
  res: import("http").ServerResponse,
  error: string,
  description: string,
): void {
  json(res, 400, { error, error_description: description });
}

// ---------------------------------------------------------------------------
// Driver — used by the oauth suite
// ---------------------------------------------------------------------------

export interface ExerciseInput {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface ExerciseResult {
  checks: CheckResult[];
}

export async function exerciseMockAuthorizationServer(
  input: ExerciseInput,
): Promise<ExerciseResult> {
  const handle = await startMockAuthorizationServer();
  const checks: CheckResult[] = [];
  try {
    const challenge = await pkceChallenge();

    // 1. authorize → code
    const authUrl = new URL(`${handle.baseUrl}/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", input.clientId);
    authUrl.searchParams.set("redirect_uri", input.redirectUri);
    authUrl.searchParams.set("code_challenge", challenge.code_challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("scope", input.scopes.join(" "));

    const authRes = await fetch(authUrl, { redirect: "manual" });
    const location = authRes.headers.get("location");
    if (authRes.status !== 302 || !location) {
      checks.push({
        id: "oauth-mock-authorize",
        description: "Mock-AS returns 302 with code on /authorize",
        status: "fail",
        message: `status=${authRes.status} location=${location}`,
      });
      return { checks };
    }
    const code = new URL(location).searchParams.get("code");
    if (!code) {
      checks.push({
        id: "oauth-mock-authorize",
        description: "Mock-AS returns 302 with code on /authorize",
        status: "fail",
        message: "redirect missing ?code=",
      });
      return { checks };
    }
    checks.push({
      id: "oauth-mock-authorize",
      description: "Mock-AS returns 302 with code on /authorize",
      status: "pass",
    });

    // 2. token exchange with verifier → tokens
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: challenge.code_verifier,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
    });
    const tokenRes = await fetch(`${handle.baseUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    const tokenJson = (await tokenRes.json()) as Partial<TokenPair> & {
      error?: string;
    };
    if (tokenRes.status !== 200 || !tokenJson.access_token) {
      checks.push({
        id: "oauth-mock-token-exchange",
        description: "Mock-AS exchanges code for tokens with valid verifier",
        status: "fail",
        message: `status=${tokenRes.status} body=${JSON.stringify(tokenJson).slice(0, 200)}`,
      });
      return { checks };
    }
    checks.push({
      id: "oauth-mock-token-exchange",
      description: "Mock-AS exchanges code for tokens with valid verifier",
      status: "pass",
    });

    // 3. refresh_token rotation
    const refreshBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenJson.refresh_token!,
      client_id: input.clientId,
    });
    const refreshRes = await fetch(`${handle.baseUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: refreshBody.toString(),
    });
    const refreshJson = (await refreshRes.json()) as Partial<TokenPair>;
    if (
      refreshRes.status !== 200 ||
      !refreshJson.access_token ||
      refreshJson.refresh_token === tokenJson.refresh_token
    ) {
      checks.push({
        id: "oauth-mock-refresh-rotation",
        description: "Mock-AS rotates refresh_token on refresh",
        status: "fail",
        message: `status=${refreshRes.status} rotated=${refreshJson.refresh_token !== tokenJson.refresh_token}`,
      });
      return { checks };
    }
    checks.push({
      id: "oauth-mock-refresh-rotation",
      description: "Mock-AS rotates refresh_token on refresh",
      status: "pass",
    });

    // 4. PKCE negative test — wrong verifier should be rejected
    const badChallenge = await pkceChallenge();
    // re-issue another code so we have a fresh one to abuse
    const second = new URL(`${handle.baseUrl}/authorize`);
    second.searchParams.set("response_type", "code");
    second.searchParams.set("client_id", input.clientId);
    second.searchParams.set("redirect_uri", input.redirectUri);
    second.searchParams.set("code_challenge", badChallenge.code_challenge);
    second.searchParams.set("code_challenge_method", "S256");
    const secondRes = await fetch(second, { redirect: "manual" });
    const secondCode = new URL(secondRes.headers.get("location")!).searchParams.get(
      "code",
    )!;
    const negBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: secondCode,
      code_verifier: "wrong-verifier",
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
    });
    const negRes = await fetch(`${handle.baseUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: negBody.toString(),
    });
    checks.push({
      id: "oauth-mock-pkce-negative",
      description: "Mock-AS rejects wrong code_verifier with invalid_grant",
      status: negRes.status === 400 ? "pass" : "fail",
      message: negRes.status === 400 ? undefined : `status=${negRes.status}`,
    });

    return { checks };
  } finally {
    await handle.close();
  }
}
