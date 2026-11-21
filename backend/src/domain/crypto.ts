const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function hashApiKeySecret(secret: string): Promise<string> {
  return `sha256:${await sha256Hex(secret)}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length === 0 || bufB.length === 0) {
    return bufA.length === bufB.length;
  }

  let diff = bufA.length ^ bufB.length;
  const maxLen = Math.max(bufA.length, bufB.length);
  for (let i = 0; i < maxLen; i += 1) {
    diff |= bufA[i % bufA.length]! ^ bufB[i % bufB.length]!;
  }
  return diff === 0;
}

export function parseBearerApiKey(
  header: string | undefined,
): { keyId: string; secret: string } | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }
  const token = match[1]!;
  if (!token.startsWith("etk_")) {
    return null;
  }
  const body = token.slice(4);
  const dotIndex = body.indexOf(".");
  if (dotIndex <= 0 || dotIndex === body.length - 1) {
    return null;
  }
  const keyId = body.slice(0, dotIndex);
  const secret = body.slice(dotIndex + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(keyId) || !/^[A-Za-z0-9_-]+$/.test(secret)) {
    return null;
  }
  return { keyId, secret };
}

export function generateTransactionId(): string {
  let time = BigInt(Date.now());
  const timeChars = new Array<string>(10);
  for (let i = 9; i >= 0; i -= 1) {
    timeChars[i] = CROCKFORD_ALPHABET[Number(time & 31n)]!;
    time >>= 5n;
  }

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let randomPart = "";
  for (let i = 0; i < randomBytes.length; i += 1) {
    randomPart += CROCKFORD_ALPHABET[randomBytes[i]! & 31]!;
  }

  return `txn_${timeChars.join("")}${randomPart}`;
}

export function nowUtcIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
