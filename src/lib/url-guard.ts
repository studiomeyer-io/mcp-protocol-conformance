/**
 * URL guard for SSRF defence on `--target http --url <url>`.
 *
 * Background: when the harness runs as an MCP server (server.ts) any
 * connected client can pass arbitrary URLs to runFullSuite/runTransportSuite/
 * runJsonRpcCompliance. Without a guard, a malicious client could probe
 * cloud-metadata endpoints (169.254.169.254 AWS IMDS), localhost services
 * (Redis 127.0.0.1:6379), or RFC1918 internal IPs from whatever host the
 * harness is running on.
 *
 * Default policy: block private, loopback, link-local, multicast, ULA, and
 * non-http(s) schemes. Local development against `http://localhost:3000` or
 * `http://127.0.0.1:8765` requires explicit opt-in via:
 *   MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS=1   (env var)
 *
 * This is a syntax-level check. DNS-rebinding defence is out of scope for
 * v0.1 — would require resolving the URL ourselves and pinning the IP for
 * the request lifetime. Document as a known limitation.
 */

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/**
 * Hostname patterns that resolve to private/internal/loopback ranges.
 * Matched against `URL.hostname.toLowerCase()` (already lowercased + no port).
 */
const PRIVATE_HOSTNAME_PATTERNS: ReadonlyArray<RegExp> = [
  // IPv4 — names + literal ranges
  /^localhost$/,
  /^localhost\.localdomain$/,
  /^ip6-localhost$/,
  /^127\./, // 127.0.0.0/8 loopback
  /^10\./, // 10.0.0.0/8 private
  /^192\.168\./, // 192.168.0.0/16 private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 private
  /^169\.254\./, // 169.254.0.0/16 link-local + AWS/GCP/Azure IMDS
  /^0\./, // 0.0.0.0/8 unspecified
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // 100.64.0.0/10 CGNAT
  /^22[4-9]\./, /^23[0-9]\./, // 224.0.0.0/4 multicast
  // IPv6
  /^::1$/, // loopback
  /^::$/, // unspecified
  /^fe80:/, // link-local
  /^fec0:/, // deprecated site-local
  /^fc[0-9a-f]{2}:/, /^fd[0-9a-f]{2}:/, // ULA fc00::/7
  /^ff[0-9a-f]{2}:/, // multicast
  // IPv6-mapped IPv4 — Node.js URL normalises both `::ffff:127.0.0.1` and
  // `::ffff:7f00:1` into the same hex form. Block the entire `::ffff:`
  // prefix because IPv4-mapped IPv6 has no legitimate use case for an
  // external HTTP target — every such address is reachable as plain IPv4.
  /^::ffff:/i,
];

export interface UrlGuardResult {
  ok: boolean;
  reason?: string;
}

export interface UrlGuardOptions {
  /** Skip private-range checks. Default false. */
  allowPrivate?: boolean;
}

/**
 * Check a URL string against the SSRF rules. Returns ok:true with no reason
 * when the URL is acceptable, ok:false plus a human-readable reason otherwise.
 */
export function checkUrlAgainstSsrfRules(
  rawUrl: string,
  options: UrlGuardOptions = {},
): UrlGuardResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL is not parseable" };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      ok: false,
      reason: `Scheme '${parsed.protocol}' not allowed; only 'http:' and 'https:' are accepted`,
    };
  }
  if (options.allowPrivate === true) return { ok: true };

  const hostname = parsed.hostname.toLowerCase();
  // Strip IPv6 brackets if present (URL.hostname keeps them: "[::1]" → "::1" already, but defensive)
  const stripped = hostname.replace(/^\[/, "").replace(/\]$/, "");
  for (const pattern of PRIVATE_HOSTNAME_PATTERNS) {
    if (pattern.test(stripped)) {
      return {
        ok: false,
        reason:
          `Hostname '${stripped}' falls in a private/loopback/link-local/multicast range. ` +
          `Set MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS=1 to bypass for local development.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Convenience wrapper used by the Zod refine on HttpTargetSchema.
 * Reads the env var on each call so test setups can flip it per-test.
 */
export function isAllowedTargetUrl(rawUrl: string): UrlGuardResult {
  const allowPrivate =
    process.env["MCP_CONFORMANCE_ALLOW_PRIVATE_TARGETS"] === "1";
  return checkUrlAgainstSsrfRules(rawUrl, { allowPrivate });
}
