import {
  constantTimeEqual,
  hashApiKeySecret,
  parseBearerApiKey,
} from "../domain/crypto";
import { forbidden, unauthorized } from "../domain/errors";
import type {
  ApiScope,
  AuthenticatedClient,
  AuthenticatedOwner,
} from "../domain/types";
import type { AppEnv } from "../env";
import type { ApiKeyRepository } from "../repositories/api-key-repository";

interface AccessJwk extends JsonWebKey {
  kid?: string;
  alg?: string;
}

interface JwksCacheEntry {
  keys: AccessJwk[];
  expiresAtMs: number;
}

const JWKS_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map<string, JwksCacheEntry>();

function decodeBase64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + "=".repeat(padding));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const bytes = decodeBase64UrlToUint8Array(segment);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    if (trimmed.slice(0, eqIndex).trim() === name) {
      return trimmed.slice(eqIndex + 1).trim();
    }
  }
  return null;
}

function parseScopes(scopesJson: string): ApiScope[] {
  try {
    const parsed: unknown = JSON.parse(scopesJson);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is ApiScope => typeof item === "string");
  } catch {
    return [];
  }
}

export class AuthService {
  constructor(private readonly apiKeys: ApiKeyRepository) {}

  async authenticateApiKey(
    authorizationHeader: string | undefined,
    requiredScope: ApiScope,
    nowMs: number = Date.now(),
  ): Promise<AuthenticatedClient> {
    const parsed = parseBearerApiKey(authorizationHeader);
    if (!parsed) {
      throw unauthorized();
    }

    const record = await this.apiKeys.findKeyWithClientById(parsed.keyId);
    if (!record) {
      throw unauthorized();
    }

    const candidateHash = await hashApiKeySecret(parsed.secret);
    if (!constantTimeEqual(candidateHash, record.secret_hash)) {
      throw unauthorized();
    }

    if (record.revoked_at !== null) {
      throw unauthorized();
    }

    if (record.expires_at !== null) {
      const expiresMs = Date.parse(record.expires_at);
      if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
        throw unauthorized();
      }
    }

    const scopes = parseScopes(record.scopes_json);
    if (!scopes.includes(requiredScope)) {
      throw forbidden();
    }

    return {
      keyId: record.id,
      clientId: record.client_id,
      clientName: record.client_name,
      clientKind: record.client_kind,
      scopes,
    };
  }

  async authenticateOwnerSession(
    request: Request,
    env: AppEnv,
  ): Promise<AuthenticatedOwner> {
    if (env.DEV_AUTH_MODE === "local" && env.OWNER_EMAIL) {
      const headerEmail = request.headers
        .get("Cf-Access-Authenticated-User-Email")
        ?.trim();
      if (
        !headerEmail ||
        headerEmail.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()
      ) {
        throw unauthorized("A valid owner session is required.");
      }
      return { email: headerEmail };
    }

    const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
    const expectedAud = env.CF_ACCESS_AUD?.trim();
    const ownerEmail = env.OWNER_EMAIL?.trim();
    if (!teamDomain || !expectedAud || !ownerEmail) {
      throw unauthorized("A valid owner session is required.");
    }

    const token =
      request.headers.get("Cf-Access-Jwt-Assertion")?.trim() ||
      parseCookie(request.headers.get("Cookie"), "CF_Authorization");
    if (!token) {
      throw unauthorized("A valid owner session is required.");
    }

    const segments = token.split(".");
    if (segments.length !== 3) {
      throw unauthorized("A valid owner session is required.");
    }

    const [headerB64, payloadB64, signatureB64] = segments as [
      string,
      string,
      string,
    ];

    let header: { alg?: string; kid?: string };
    let signature: Uint8Array<ArrayBuffer>;
    let payload: {
      aud?: string | string[];
      email?: string;
      exp?: number;
      iss?: string;
      nbf?: number;
    };
    try {
      header = decodeBase64UrlJson(headerB64);
      payload = decodeBase64UrlJson(payloadB64);
      signature = decodeBase64UrlToUint8Array(signatureB64);
    } catch {
      throw unauthorized("A valid owner session is required.");
    }

    if (
      header?.alg !== "RS256" ||
      !header.kid ||
      payload?.iss !== `https://${teamDomain}`
    ) {
      throw unauthorized("A valid owner session is required.");
    }

    const keys = await this.getAccessPublicKeys(teamDomain, header.kid);
    const matchingKey = keys.find((key) => key.kid === header.kid);
    if (!matchingKey) {
      throw unauthorized("A valid owner session is required.");
    }

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      matchingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const rawSigning = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signingInput = new Uint8Array(new ArrayBuffer(rawSigning.byteLength));
    signingInput.set(rawSigning);
    const isValidSignature = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      signingInput,
    );
    if (!isValidSignature) {
      throw unauthorized("A valid owner session is required.");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
      throw unauthorized("A valid owner session is required.");
    }
    if (typeof payload.nbf === "number" && payload.nbf > nowSec) {
      throw unauthorized("A valid owner session is required.");
    }

    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : typeof payload.aud === "string"
        ? [payload.aud]
        : [];
    if (!audiences.includes(expectedAud)) {
      throw unauthorized("A valid owner session is required.");
    }

    if (
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== ownerEmail.toLowerCase()
    ) {
      throw unauthorized("A valid owner session is required.");
    }

    return { email: payload.email };
  }

  assertSameOriginMutation(request: Request, env: AppEnv): void {
    const expectedOrigin = env.DASHBOARD_ORIGIN
      ? new URL(env.DASHBOARD_ORIGIN).origin
      : new URL(request.url).origin;

    const originHeader = request.headers.get("Origin");
    if (originHeader !== null) {
      if (originHeader !== expectedOrigin) {
        throw forbidden("Cross-origin mutations are not allowed.");
      }
      return;
    }

    const secFetchSite = request.headers.get("Sec-Fetch-Site");
    const refererHeader = request.headers.get("Referer");
    if (secFetchSite !== "same-origin" || !refererHeader) {
      throw forbidden("Same-origin request verification failed.");
    }

    let refererOrigin: string;
    try {
      refererOrigin = new URL(refererHeader).origin;
    } catch {
      throw forbidden("Same-origin request verification failed.");
    }

    if (refererOrigin !== expectedOrigin) {
      throw forbidden("Same-origin request verification failed.");
    }
  }

  private async getAccessPublicKeys(
    teamDomain: string,
    requiredKid: string,
  ): Promise<AccessJwk[]> {
    const now = Date.now();
    const cached = jwksCache.get(teamDomain);
    if (
      cached &&
      cached.expiresAtMs > now &&
      cached.keys.some((key) => key.kid === requiredKid)
    ) {
      return cached.keys;
    }

    const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!response.ok) {
      throw unauthorized("Unable to verify owner session.");
    }

    const data = (await response.json()) as { keys?: AccessJwk[] };
    const keys = Array.isArray(data.keys) ? data.keys : [];
    jwksCache.set(teamDomain, { keys, expiresAtMs: now + JWKS_TTL_MS });
    return keys;
  }
}
