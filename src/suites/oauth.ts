/**
 * OAuth 2.1 PKCE flow suite (MCP spec 2025-03-26+).
 *
 * Verifies the authorization_code grant with PKCE S256:
 *  1. Generate code_verifier + code_challenge.
 *  2. Build authorization URL.
 *  3. (Mock-AS only) follow redirect, extract code.
 *  4. Exchange code for tokens.
 *  5. Verify refresh_token rotation.
 *
 * Real-tenant mode does not drive a browser; it accepts a pre-issued
 * auth-token and asserts that the token is honoured by the target.
 */

import pkceChallenge from "pkce-challenge";
import type {
  HttpTarget,
  OauthReport,
} from "../types.js";
import { makeSuiteRunner } from "./util.js";
import { createTargetAdapter } from "../targets/index.js";
import { isJsonRpcError } from "../targets/types.js";

export interface OauthRunOptions {
  mode: "mock" | "real";
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
  authorizationServerUrl?: string;
  authToken?: string;
}

export async function runOauthPkceFlow(
  target: HttpTarget,
  options: OauthRunOptions,
): Promise<OauthReport> {
  const runner = makeSuiteRunner("oauth");
  runner.start();

  // 1. PKCE generation always exercised — pure crypto, no network
  try {
    const challenge = await pkceChallenge();
    runner.add({
      id: "oauth-pkce-generation",
      description: "PKCE S256 code_verifier and code_challenge generated",
      status:
        challenge.code_verifier.length >= 43 &&
        challenge.code_challenge.length >= 43
          ? "pass"
          : "fail",
      message:
        challenge.code_verifier.length >= 43
          ? undefined
          : "code_verifier shorter than RFC-7636 minimum (43 chars).",
    });
  } catch (err) {
    runner.add({
      id: "oauth-pkce-generation",
      description: "PKCE S256 code_verifier and code_challenge generated",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (options.mode === "real") {
    if (!options.authToken) {
      runner.add({
        id: "oauth-real-token-required",
        description: "Real-tenant mode requires a pre-issued auth-token",
        status: "fail",
        message:
          "Use --auth-token <token> when running --oauth-mode real, or switch to --oauth-mode mock.",
      });
      return runner.finish();
    }
    // Probe the target with the bearer token: initialize must succeed.
    const adapter = createTargetAdapter({
      kind: "http",
      url: target.url,
      headers: {
        ...(target.headers ?? {}),
        Authorization: `Bearer ${options.authToken}`,
      },
    });
    try {
      await adapter.open();
      const res = await adapter.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mcp-protocol-conformance", version: "0.1.0" },
      });
      runner.add({
        id: "oauth-real-bearer-accepted",
        description: "Target accepts pre-issued bearer token on initialize",
        status: isJsonRpcError(res) ? "fail" : "pass",
        message: isJsonRpcError(res)
          ? `Bearer token rejected: ${res.error.code} ${res.error.message}`
          : undefined,
      });
    } catch (err) {
      runner.add({
        id: "oauth-real-bearer-accepted",
        description: "Target accepts pre-issued bearer token on initialize",
        status: "fail",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await adapter.close();
    }
    return runner.finish();
  }

  // mock mode: full flow against the in-process mock-as fixture
  if (!options.clientId || !options.redirectUri) {
    runner.add({
      id: "oauth-mock-config-missing",
      description: "Mock-AS mode requires clientId + redirectUri",
      status: "skip",
      message:
        "Provide --client-id and --redirect-uri to exercise the full PKCE flow against the mock-AS.",
    });
    return runner.finish();
  }

  // Defer to mock-as fixture which exercises the full RFC-7636 dance.
  try {
    const { exerciseMockAuthorizationServer } = await import(
      "../test-fixtures/mock-as.js"
    );
    const result = await exerciseMockAuthorizationServer({
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      scopes: options.scopes ?? ["mcp.read"],
    });
    for (const check of result.checks) runner.add(check);
  } catch (err) {
    runner.add({
      id: "oauth-mock-fatal",
      description: "Mock-AS execution failed",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return runner.finish();
}
