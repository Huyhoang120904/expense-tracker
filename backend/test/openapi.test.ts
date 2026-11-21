import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDashboardApp } from "../src/routes/dashboard-routes";
import { createIntegrationApp } from "../src/routes/integration-routes";
import hostedDashboardApp from "../src/workers/hosted-dashboard";

const unusedDeps = () => {
  throw new Error("Dependencies should not be invoked for OpenAPI routes.");
};

describe("OpenAPI documentation endpoints", () => {
  it("serves OpenAPI spec and docs UI on the Integration Worker", async () => {
    const app = createIntegrationApp(unusedDeps);

    const specRes = await app.request("https://ledger.example.com/openapi.json");
    expect(specRes.status, await specRes.clone().text()).toBe(200);
    const spec = (await specRes.json()) as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<string, Record<string, unknown>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(spec.openapi).toBe("3.1.1");
    expect(spec.servers[0]?.url).toBe("https://ledger.example.com");
    expect(Object.keys(spec.paths)).toEqual([
      "/health",
      "/v1/categories",
      "/v1/transactions",
      "/v1/transactions/{id}",
      "/v1/summary",
    ]);
    expect(spec.components.securitySchemes).toHaveProperty("BearerKey");
    expect(spec.components.securitySchemes).not.toHaveProperty("OwnerSession");

    const docsRes = await app.request("https://ledger.example.com/docs");
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers.get("content-type")).toContain("text/html");
    const html = await docsRes.text();
    expect(html).toContain('data-url="/openapi.json"');
    expect(html).toContain("@scalar/api-reference");
  });

  it("serves OpenAPI spec and docs UI on the Dashboard Worker", async () => {
    const app = createDashboardApp(unusedDeps);

    const specRes = await app.request("https://dashboard.example.com/openapi.json");
    expect(specRes.status).toBe(200);
    const spec = (await specRes.json()) as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<string, Record<string, unknown>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(spec.openapi).toBe("3.1.1");
    expect(spec.servers[0]?.url).toBe("https://dashboard.example.com");
    expect(Object.keys(spec.paths)).toEqual([
      "/health",
      "/capabilities",
      "/v1/categories",
      "/v1/transactions",
      "/v1/transactions/batch",
      "/v1/transactions/{id}",
      "/v1/summary",
    ]);
    expect(spec.components.securitySchemes).toHaveProperty("OwnerSession");
    expect(spec.paths["/v1/transactions"]).toHaveProperty("post");
    expect(spec.paths["/v1/transactions/{id}"]).toHaveProperty("patch");
    expect(spec.paths["/v1/transactions/{id}"]).toHaveProperty("delete");

    const docsRes = await app.request("https://dashboard.example.com/docs");
    expect(docsRes.status).toBe(200);
    const html = await docsRes.text();
    expect(html).toContain('data-url="/openapi.json"');
  });

  it("serves OpenAPI spec and docs UI under /api on the Hosted Dashboard Worker", async () => {
    const specRes = await hostedDashboardApp.request(
      "https://hosted.example.com/api/openapi.json",
      {},
      { ASSETS: { fetch: async () => new Response("nope") } } as never,
    );
    expect(specRes.status).toBe(200);
    const spec = (await specRes.json()) as {
      servers: Array<{ url: string }>;
    };
    expect(spec.servers[0]?.url).toBe("https://hosted.example.com/api");

    const docsRes = await hostedDashboardApp.request(
      "https://hosted.example.com/api/docs",
      {},
      { ASSETS: { fetch: async () => new Response("nope") } } as never,
    );
    expect(docsRes.status).toBe(200);
    const html = await docsRes.text();
    expect(html).toContain('data-url="/api/openapi.json"');
  });

  it("keeps docs/openapi.json valid and up to date with all backend paths", () => {
    const raw = readFileSync(new URL("../../docs/openapi.json", import.meta.url), "utf8");
    const doc = JSON.parse(raw) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi).toBe("3.1.1");
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/capabilities",
        "/v1/categories",
        "/v1/transactions",
        "/v1/transactions/batch",
        "/v1/transactions/{id}",
        "/v1/summary",
      ]),
    );
    expect(doc.components.schemas).toHaveProperty("BatchTransactionsRequest");
    expect(doc.components.schemas).toHaveProperty("BatchTransactionsResult");
  });
});
