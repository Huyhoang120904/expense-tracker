import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/workers/hosted-dashboard";
import { SqliteD1Database } from "./helpers/sqlite-d1";

const teamDomain = "expense-tracker-test.cloudflareaccess.com";
const audience = "dashboard-audience";
const ownerEmail = "owner@example.com";

afterEach(() => vi.unstubAllGlobals());

describe("Hosted dashboard", () => {
  it("blocks signed-out access to the dashboard, assets, and ledger", async () => {
    const fetchAsset = vi.fn();
    const env = {
      ASSETS: { fetch: fetchAsset },
      DEV_AUTH_MODE: "local",
      OWNER_EMAIL: ownerEmail,
    };
    const headers = { "Cf-Access-Authenticated-User-Email": ownerEmail };

    const privatePaths = ["/", "/assets/index.js", "/api/capabilities", "/api/v1/transactions"];
    for (const path of privatePaths) {
      const response = await app.request(path, { headers }, env);
      expect(response.status, path).toBe(401);
    }

    const unknown = await app.request("/api/unknown", {}, env);
    expect(unknown.status).toBe(404);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("serves the dashboard and allows the signed-in owner to save transactions", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const kid = "test-key";
    const fetchKeys = vi.fn(async () => Response.json({
      keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256" }],
    }));
    vi.stubGlobal("fetch", fetchKeys);

    const env = {
      ASSETS: { fetch: vi.fn(async () => new Response("Dashboard HTML")) },
      CF_ACCESS_TEAM_DOMAIN: teamDomain,
      CF_ACCESS_AUD: audience,
      OWNER_EMAIL: ownerEmail,
    };
    const encode = (json: object) => Buffer.from(JSON.stringify(json)).toString("base64url");

    function accessHeaders(issuer: string) {
      const header = encode({ alg: "RS256", kid });
      const payload = encode({
        aud: [audience],
        email: ownerEmail,
        exp: Math.floor(Date.now() / 1000) + 60,
        iss: issuer,
      });
      const signingInput = `${header}.${payload}`;
      const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
      return { "Cf-Access-Jwt-Assertion": `${signingInput}.${signature.toString("base64url")}` };
    }

    const wrongIssuer = await app.request("/", {
      headers: accessHeaders("https://other.cloudflareaccess.com"),
    }, env);
    expect(wrongIssuer.status).toBe(401);

    const headers = accessHeaders(`https://${teamDomain}`);
    const dashboard = await app.request("/", { headers }, env);
    expect(await dashboard.text()).toBe("Dashboard HTML");

    const capabilities = await app.request("/api/capabilities", { headers }, env);
    expect(await capabilities.json()).toEqual({ mode: "owner", can_write: true });
    expect(fetchKeys).toHaveBeenCalledWith(`https://${teamDomain}/cdn-cgi/access/certs`);

    const database = new SqliteD1Database();
    try {
      database.applyMigrations();
      const ledgerEnv = { ...env, DB: database.asD1() };
      const origin = "https://dashboard.example.com";
      const created = await app.request(`${origin}/api/v1/transactions`, {
        method: "POST",
        headers: { ...headers, Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_date: "2026-11-18",
          type: "expense",
          amount_minor: 50000,
          currency_code: "VND",
        }),
      }, ledgerEnv);
      expect(created.status).toBe(201);
      const { id } = await created.json();
      const location = created.headers.get("Location");
      expect(location).toBe(`/api/v1/transactions/${id}`);

      const saved = await app.request(`${origin}${location}`, { headers }, ledgerEnv);
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ id, amount_minor: 50000 });
    } finally {
      database.sqlite.close();
    }
  });
});
