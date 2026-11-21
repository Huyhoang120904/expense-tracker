import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashApiKeySecret } from "../src/domain/crypto";
import type { ApiClientKind, ApiScope } from "../src/domain/types";
import type { AppEnv } from "../src/env";
import { D1ApiKeyRepository } from "../src/repositories/api-key-repository";
import { D1LedgerRepository } from "../src/repositories/ledger-repository";
import { createDashboardApp } from "../src/routes/dashboard-routes";
import { createIntegrationApp } from "../src/routes/integration-routes";
import { AuthService } from "../src/services/auth-service";
import { LedgerService } from "../src/services/ledger-service";
import { SqliteD1Database } from "./helpers/sqlite-d1";

const OWNER_EMAIL = "owner@example.com";
const DASHBOARD_ORIGIN = "https://dashboard.example.com";

function buildApps() {
  const integrationApp = createIntegrationApp((env) => ({
    auth: new AuthService(new D1ApiKeyRepository(env.DB)),
    ledger: new LedgerService(new D1LedgerRepository(env.DB)),
  }));
  const dashboardApp = createDashboardApp((env) => ({
    auth: new AuthService(new D1ApiKeyRepository(env.DB)),
    ledger: new LedgerService(new D1LedgerRepository(env.DB)),
  }));
  return { integrationApp, dashboardApp };
}

async function seedClientKey(
  db: SqliteD1Database,
  options: {
    clientId: string;
    clientName: string;
    clientKind: ApiClientKind;
    keyId: string;
    secret: string;
    scopes: ApiScope[];
    expiresAt?: string | null;
    revokedAt?: string | null;
  },
): Promise<string> {
  const hash = await hashApiKeySecret(options.secret);
  db.sqlite
    .prepare(
      "INSERT OR IGNORE INTO api_clients (id, name, kind) VALUES (?, ?, ?)",
    )
    .run(options.clientId, options.clientName, options.clientKind);

  db.sqlite
    .prepare(
      `INSERT INTO api_keys (id, client_id, secret_hash, scopes_json, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, '2026-11-01T00:00:00Z', ?, ?)`,
    )
    .run(
      options.keyId,
      options.clientId,
      hash,
      JSON.stringify(options.scopes),
      options.expiresAt ?? null,
      options.revokedAt ?? null,
    );

  return `etk_${options.keyId}.${options.secret}`;
}

describe("Backend Ledger & API (Phases 1-5)", () => {
  let db: SqliteD1Database;
  let env: AppEnv;
  let integrationApp: ReturnType<typeof createIntegrationApp>;
  let dashboardApp: ReturnType<typeof createDashboardApp>;
  let agentToken: string;
  let telegramToken: string;
  let viewerToken: string;

  beforeEach(async () => {
    db = new SqliteD1Database();
    db.applyMigrations();

    env = {
      DB: db.asD1(),
      DEV_AUTH_MODE: "local",
      OWNER_EMAIL,
      DASHBOARD_ORIGIN,
    };

    const apps = buildApps();
    integrationApp = apps.integrationApp;
    dashboardApp = apps.dashboardApp;

    agentToken = await seedClientKey(db, {
      clientId: "client_agent",
      clientName: "Agent",
      clientKind: "agent",
      keyId: "k_agent_1",
      secret: "agent_secret_value_123456",
      scopes: ["transactions:read", "transactions:create", "transactions:parse"],
    });
    telegramToken = await seedClientKey(db, {
      clientId: "client_telegram",
      clientName: "Telegram Bot",
      clientKind: "telegram",
      keyId: "k_tg_1",
      secret: "tg_secret_value_123456",
      scopes: ["transactions:create", "transactions:parse"],
    });
    viewerToken = await seedClientKey(db, {
      clientId: "client_viewer",
      clientName: "Local Viewer",
      clientKind: "local_viewer",
      keyId: "k_view_1",
      secret: "view_secret_value_123456",
      scopes: ["transactions:read"],
    });
  });

  afterEach(() => {
    db.sqlite.close();
  });

  function callIntegration(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return Promise.resolve(
      integrationApp.fetch(new Request(`https://ledger.example.com${path}`, init), env),
    );
  }

  function callDashboard(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return Promise.resolve(
      dashboardApp.fetch(
        new Request(`${DASHBOARD_ORIGIN}${path}`, init),
        env,
      ),
    );
  }

  describe("Phase 1: Ledger migrations, auth, and scopes", () => {
    it("applies migrations against an empty database and seeds defaults", async () => {
      const settings = db.sqlite
        .prepare("SELECT id, currency_code, timezone FROM settings WHERE id = 1")
        .get() as { id: number; currency_code: string; timezone: string };
      expect(settings).toEqual({
        id: 1,
        currency_code: "VND",
        timezone: "Asia/Ho_Chi_Minh",
      });

      const res = await callIntegration("/v1/categories", {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ id: string; name: string; archived: boolean }>;
      };
      expect(body.items.length).toBeGreaterThanOrEqual(10);
      expect(body.items.some((c) => c.id === "food" && !c.archived)).toBe(true);
    });

    it("rejects missing, malformed, wrong-secret, expired, and revoked keys with 401", async () => {
      await seedClientKey(db, {
        clientId: "client_expired",
        clientName: "Expired",
        clientKind: "agent",
        keyId: "k_exp",
        secret: "expired_secret_12345",
        scopes: ["transactions:read"],
        expiresAt: "2020-01-01T00:00:00Z",
      });
      await seedClientKey(db, {
        clientId: "client_revoked",
        clientName: "Revoked",
        clientKind: "agent",
        keyId: "k_rev",
        secret: "revoked_secret_12345",
        scopes: ["transactions:read"],
        revokedAt: "2026-11-02T00:00:00Z",
      });

      const badHeaders = [
        undefined,
        "Basic dXNlcjpwYXNz",
        "Bearer invalid_token",
        "Bearer etk_k_agent_1.",
        "Bearer etk_unknown.secret123",
        "Bearer etk_k_agent_1.wrong_secret",
        "Bearer etk_k_exp.expired_secret_12345",
        "Bearer etk_k_rev.revoked_secret_12345",
      ];

      for (const authHeader of badHeaders) {
        const res = await callIntegration("/v1/categories", {
          headers: authHeader ? { Authorization: authHeader } : {},
        });
        expect(res.status).toBe(401);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe("unauthorized");
      }
    });

    it("returns 403 when active key lacks required scope", async () => {
      const readRes = await callIntegration("/v1/categories", {
        headers: { Authorization: `Bearer ${telegramToken}` },
      });
      expect(readRes.status).toBe(403);
      expect(((await readRes.json()) as { error: { code: string } }).error.code).toBe(
        "forbidden",
      );

      const writeRes = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${viewerToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "viewer-create-attempt-1",
        },
        body: JSON.stringify({
          transaction_date: "2026-11-17",
          type: "expense",
          amount_minor: 45000,
          currency_code: "VND",
        }),
      });
      expect(writeRes.status).toBe(403);
      expect(
        ((await writeRes.json()) as { error: { code: string } }).error.code,
      ).toBe("forbidden");
    });
  });

  describe("Phase 2: Create, retrieve, validation, and idempotency", () => {
    it("creates and retrieves expense and income rows with exact OpenAPI shape", async () => {
      const createRes = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "agent-expense-0001",
        },
        body: JSON.stringify({
          transaction_date: "2026-11-17",
          type: "expense",
          amount_minor: 45000,
          currency_code: "VND",
          category_id: "food",
          merchant: "Highlands Coffee",
          note: "Lunch",
        }),
      });

      expect(createRes.status).toBe(201);
      const createdBody = (await createRes.json()) as { id: string };
      expect(createdBody.id).toMatch(/^txn_/);
      expect(createRes.headers.get("Location")).toBe(
        `/v1/transactions/${createdBody.id}`,
      );

      const getRes = await callIntegration(
        `/v1/transactions/${createdBody.id}`,
        {
          headers: { Authorization: `Bearer ${viewerToken}` },
        },
      );
      expect(getRes.status).toBe(200);
      const tx = (await getRes.json()) as Record<string, unknown>;
      expect(Object.keys(tx).sort()).toEqual([
        "amount_minor",
        "category_id",
        "created_at",
        "currency_code",
        "id",
        "merchant",
        "note",
        "source",
        "transaction_date",
        "type",
        "updated_at",
      ]);
      expect(tx).toMatchObject({
        id: createdBody.id,
        transaction_date: "2026-11-17",
        type: "expense",
        amount_minor: 45000,
        currency_code: "VND",
        category_id: "food",
        merchant: "Highlands Coffee",
        note: "Lunch",
        source: "agent",
      });

      const tgCreateRes = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${telegramToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "telegram-income-0001",
        },
        body: JSON.stringify({
          transaction_date: "2026-11-01",
          type: "income",
          amount_minor: 15000000,
          currency_code: "VND",
          category_id: "salary",
        }),
      });
      expect(tgCreateRes.status).toBe(201);
      const tgBody = (await tgCreateRes.json()) as { id: string };
      const tgGetRes = await callIntegration(`/v1/transactions/${tgBody.id}`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(((await tgGetRes.json()) as { source: string }).source).toBe(
        "telegram",
      );
    });

    it("handles idempotent replay, payload normalization, key rotation, soft deletion, and conflicts", async () => {
      const payloadWithOmitted = {
        transaction_date: "2026-11-17",
        type: "expense",
        amount_minor: 45000,
        currency_code: "VND",
      };
      const payloadWithNulls = {
        transaction_date: "2026-11-17",
        type: "expense",
        amount_minor: 45000,
        currency_code: "VND",
        category_id: null,
        merchant: null,
        note: null,
      };

      const first = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "replay-test-key-0001",
        },
        body: JSON.stringify(payloadWithOmitted),
      });
      expect(first.status).toBe(201);
      const firstId = ((await first.json()) as { id: string }).id;

      // Equivalent normalized payload replays with 200 and original ID
      const second = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "replay-test-key-0001",
        },
        body: JSON.stringify(payloadWithNulls),
      });
      expect(second.status).toBe(200);
      expect(((await second.json()) as { id: string }).id).toBe(firstId);

      // Different payload with same key returns 409
      const conflict = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "replay-test-key-0001",
        },
        body: JSON.stringify({
          ...payloadWithOmitted,
          amount_minor: 50000,
        }),
      });
      expect(conflict.status).toBe(409);
      expect(
        ((await conflict.json()) as { error: { code: string } }).error.code,
      ).toBe("idempotency_conflict");

      // Different client using the same Idempotency-Key creates its own row
      const otherClient = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${telegramToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "replay-test-key-0001",
        },
        body: JSON.stringify(payloadWithOmitted),
      });
      expect(otherClient.status).toBe(201);
      const otherId = ((await otherClient.json()) as { id: string }).id;
      expect(otherId).not.toBe(firstId);

      // Rotate key for same client and soft-delete the transaction; replay stays 200
      const rotatedAgentToken = await seedClientKey(db, {
        clientId: "client_agent",
        clientName: "Agent",
        clientKind: "agent",
        keyId: "k_agent_2",
        secret: "agent_rotated_secret_1234",
        scopes: ["transactions:read", "transactions:create"],
      });

      const delRes = await callDashboard(`/v1/transactions/${firstId}`, {
        method: "DELETE",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
        },
      });
      expect(delRes.status).toBe(204);

      const replayAfterRotateAndDelete = await callIntegration(
        "/v1/transactions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${rotatedAgentToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": "replay-test-key-0001",
          },
          body: JSON.stringify(payloadWithOmitted),
        },
      );
      expect(replayAfterRotateAndDelete.status).toBe(200);
      expect(
        ((await replayAfterRotateAndDelete.json()) as { id: string }).id,
      ).toBe(firstId);
    });

    it("creates only one row for concurrent requests sharing an Idempotency-Key", async () => {
      const body = JSON.stringify({
        transaction_date: "2026-11-17",
        type: "expense",
        amount_minor: 35000,
        currency_code: "VND",
        category_id: "food",
      });

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          callIntegration("/v1/transactions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${agentToken}`,
              "Content-Type": "application/json",
              "Idempotency-Key": "concurrent-key-0001",
            },
            body,
          }),
        ),
      );

      const statuses = responses.map((r) => r.status);
      expect(statuses.every((s) => s === 200 || s === 201)).toBe(true);
      const ids = await Promise.all(
        responses.map(async (r) => ((await r.json()) as { id: string }).id),
      );
      expect(new Set(ids).size).toBe(1);

      const countRow = db.sqlite
        .prepare("SELECT COUNT(*) AS count FROM transactions")
        .get() as { count: number };
      expect(countRow.count).toBe(1);
    });

    it("enforces HTTP content-type, header, calendar date, currency, and category validation", async () => {
      db.sqlite
        .prepare(
          "INSERT INTO categories (id, name, archived_at) VALUES ('old_cat', 'Old', '2026-10-01T00:00:00Z')",
        )
        .run();

      const wrongContentType = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "text/plain",
          "Idempotency-Key": "validation-key-0001",
        },
        body: "{}",
      });
      expect(wrongContentType.status).toBe(415);

      const shortIdemKey = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "short",
        },
        body: "{}",
      });
      expect(shortIdemKey.status).toBe(400);

      const badDate = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "validation-key-0002",
        },
        body: JSON.stringify({
          transaction_date: "2026-02-29",
          type: "expense",
          amount_minor: 1000,
          currency_code: "VND",
        }),
      });
      expect(badDate.status).toBe(422);

      const badCurrency = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "validation-key-0003",
        },
        body: JSON.stringify({
          transaction_date: "2026-11-17",
          type: "expense",
          amount_minor: 1000,
          currency_code: "USD",
        }),
      });
      expect(badCurrency.status).toBe(422);

      const archivedCategory = await callIntegration("/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "validation-key-0004",
        },
        body: JSON.stringify({
          transaction_date: "2026-11-17",
          type: "expense",
          amount_minor: 1000,
          currency_code: "VND",
          category_id: "old_cat",
        }),
      });
      expect(archivedCategory.status).toBe(422);
    });
  });

  describe("Phase 3: Browse, filter, and paginate", () => {
    it("filters by month, category, and type and paginates tied dates without skips or duplicates", async () => {
      const stmt = db.sqlite.prepare(
        `INSERT INTO transactions (
           id, transaction_date, type, amount_minor, currency_code,
           category_id, merchant, note, source, created_by_client_id,
           created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, 'VND', ?, ?, NULL, 'agent', NULL, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z', NULL)`,
      );

      for (let i = 1; i <= 15; i += 1) {
        stmt.run(
          `txn_tied_${String(i).padStart(2, "0")}`,
          "2026-11-10",
          i % 3 === 0 ? "income" : "expense",
          10000 * i,
          i % 2 === 0 ? "food" : "transport",
          `Merchant ${i}`,
        );
      }
      // Extra row in previous month
      stmt.run(
        "txn_prev_month",
        "2026-10-15",
        "expense",
        25000,
        "food",
        "October Cafe",
      );

      const seenIds: string[] = [];
      let cursor: string | null = null;
      let pageCount = 0;

      do {
        const params = new URLSearchParams({
          month: "2026-11",
          limit: "4",
        });
        if (cursor) {
          params.set("cursor", cursor);
        }
        const res = await callIntegration(`/v1/transactions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${viewerToken}` },
        });
        expect(res.status).toBe(200);
        const page = (await res.json()) as {
          items: Array<{ id: string; transaction_date: string }>;
          next_cursor: string | null;
        };
        pageCount += 1;
        for (const item of page.items) {
          seenIds.push(item.id);
        }
        cursor = page.next_cursor;
      } while (cursor !== null);

      expect(pageCount).toBe(4);
      expect(seenIds).toHaveLength(15);
      expect(new Set(seenIds).size).toBe(15);
      // Verify descending ID order on tied date
      const expectedIds = Array.from({ length: 15 }, (_, idx) =>
        `txn_tied_${String(15 - idx).padStart(2, "0")}`,
      );
      expect(seenIds).toEqual(expectedIds);

      // Combined filter test
      const filteredRes = await callIntegration(
        "/v1/transactions?month=2026-11&category_id=food&type=expense",
        { headers: { Authorization: `Bearer ${viewerToken}` } },
      );
      expect(filteredRes.status).toBe(200);
      const filteredPage = (await filteredRes.json()) as {
        items: Array<{ id: string; category_id: string; type: string }>;
      };
      expect(
        filteredPage.items.every(
          (tx) => tx.category_id === "food" && tx.type === "expense",
        ),
      ).toBe(true);
      expect(filteredPage.items).toHaveLength(5);

      // Mismatched cursor with changed filter returns 400
      const firstPageRes = await callIntegration(
        "/v1/transactions?month=2026-11&limit=4",
        { headers: { Authorization: `Bearer ${viewerToken}` } },
      );
      const firstPage = (await firstPageRes.json()) as { next_cursor: string };
      const mismatchRes = await callIntegration(
        `/v1/transactions?month=2026-11&category_id=food&limit=4&cursor=${encodeURIComponent(firstPage.next_cursor)}`,
        { headers: { Authorization: `Bearer ${viewerToken}` } },
      );
      expect(mismatchRes.status).toBe(400);

      // Invalid filters and malformed cursor return 400
      for (const badPath of [
        "/v1/transactions?month=2026-13",
        "/v1/transactions?type=unknown",
        "/v1/transactions?limit=0",
        "/v1/transactions?limit=101",
        "/v1/transactions?cursor=not_valid_base64!!!",
      ]) {
        const badRes = await callIntegration(badPath, {
          headers: { Authorization: `Bearer ${viewerToken}` },
        });
        expect(badRes.status).toBe(400);
      }
    });
  });

  describe("Phase 4: Owner edits and soft deletes on Dashboard Worker", () => {
    it("allows owner updates and idempotent soft deletes while blocking integration keys and cross-origin calls", async () => {
      db.sqlite
        .prepare(
          "INSERT INTO categories (id, name, archived_at) VALUES ('archived_cat', 'Legacy', '2026-10-01T00:00:00Z')",
        )
        .run();

      const createRes = await callDashboard("/v1/transactions", {
        method: "POST",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction_date: "2026-11-18",
          type: "expense",
          amount_minor: 50000,
          currency_code: "VND",
          category_id: "food",
          merchant: "Pho 24",
          note: "Dinner",
        }),
      });
      expect(createRes.status).toBe(201);
      const { id } = (await createRes.json()) as { id: string };

      // Unauthenticated or Bearer token on Dashboard Worker -> 401
      const noSessionRes = await callDashboard(`/v1/transactions/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount_minor: 60000 }),
      });
      expect(noSessionRes.status).toBe(401);

      // Cross-origin owner mutation -> 403
      const crossOriginRes = await callDashboard(`/v1/transactions/${id}`, {
        method: "PATCH",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: "https://evil.example.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount_minor: 60000 }),
      });
      expect(crossOriginRes.status).toBe(403);

      // Integration Worker forbids PATCH and DELETE
      const intPatch = await callIntegration(`/v1/transactions/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount_minor: 60000 }),
      });
      expect(intPatch.status).toBe(403);

      const intDelete = await callIntegration(`/v1/transactions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${agentToken}` },
      });
      expect(intDelete.status).toBe(403);

      // Owner PATCH updates amount and clears note/merchant/category_id with null
      const patchRes = await callDashboard(`/v1/transactions/${id}`, {
        method: "PATCH",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount_minor: 75000,
          note: null,
          merchant: null,
        }),
      });
      expect(patchRes.status).toBe(200);
      const updated = (await patchRes.json()) as {
        amount_minor: number;
        note: string | null;
        merchant: string | null;
        currency_code: string;
        source: string;
      };
      expect(updated.amount_minor).toBe(75000);
      expect(updated.note).toBeNull();
      expect(updated.merchant).toBeNull();
      expect(updated.currency_code).toBe("VND");
      expect(updated.source).toBe("dashboard");

      // Assigning an archived category fails with 422, while keeping existing archived category succeeds
      const assignArchivedRes = await callDashboard(`/v1/transactions/${id}`, {
        method: "PATCH",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category_id: "archived_cat" }),
      });
      expect(assignArchivedRes.status).toBe(422);

      // An existing row already holding an archived category can update other fields or re-send its existing category_id
      db.sqlite
        .prepare(
          `INSERT INTO transactions (
             id, transaction_date, type, amount_minor, currency_code,
             category_id, merchant, note, source, created_by_client_id,
             created_at, updated_at, deleted_at
           ) VALUES ('txn_with_archived', '2026-10-20', 'expense', 30000, 'VND', 'archived_cat', 'Legacy Vendor', 'Old note', 'dashboard', NULL, '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z', NULL)`,
        )
        .run();

      const updateExistingArchivedNoteRes = await callDashboard(
        "/v1/transactions/txn_with_archived",
        {
          method: "PATCH",
          headers: {
            "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
            Origin: DASHBOARD_ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category_id: "archived_cat",
            note: "Updated historical note",
          }),
        },
      );
      expect(updateExistingArchivedNoteRes.status).toBe(200);
      expect(
        ((await updateExistingArchivedNoteRes.json()) as { note: string }).note,
      ).toBe("Updated historical note");

      // Empty PATCH body or immutable currency_code fails with 422
      const emptyPatchRes = await callDashboard(`/v1/transactions/${id}`, {
        method: "PATCH",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      expect(emptyPatchRes.status).toBe(422);

      // Soft delete -> 204, hidden from GET, repeated delete -> 204, unknown -> 404
      const deleteFirst = await callDashboard(`/v1/transactions/${id}`, {
        method: "DELETE",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
        },
      });
      expect(deleteFirst.status).toBe(204);

      const getAfterDelete = await callIntegration(`/v1/transactions/${id}`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(getAfterDelete.status).toBe(404);

      const deleteSecond = await callDashboard(`/v1/transactions/${id}`, {
        method: "DELETE",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
        },
      });
      expect(deleteSecond.status).toBe(204);

      const deleteUnknown = await callDashboard("/v1/transactions/txn_does_not_exist", {
        method: "DELETE",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
        },
      });
      expect(deleteUnknown.status).toBe(404);
    });

    it("supports atomic batch updates and deletes for owner while validating inputs and auth", async () => {
      db.sqlite
        .prepare(
          "INSERT INTO categories (id, name, archived_at) VALUES ('archived_batch_cat', 'Legacy Batch', '2026-10-01T00:00:00Z')",
        )
        .run();

      const insert = db.sqlite.prepare(
        `INSERT INTO transactions (
           id, transaction_date, type, amount_minor, currency_code,
           category_id, merchant, note, source, created_by_client_id,
           created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, 'VND', ?, ?, NULL, 'dashboard', NULL, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z', ?)`,
      );
      insert.run("txn_b_1", "2026-11-10", "expense", 40000, "food", "Cafe A", null);
      insert.run("txn_b_2", "2026-11-11", "expense", 60000, "transport", "Grab B", null);
      insert.run("txn_b_3", "2026-11-12", "expense", 25000, "food", "Bakery C", null);
      insert.run("txn_b_deleted", "2026-11-12", "expense", 99000, "food", "Deleted", "2026-11-13T00:00:00Z");

      // Auth & Origin checks
      const unauthBatch = await callDashboard("/v1/transactions/batch", {
        method: "POST",
        headers: {
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete", ids: ["txn_b_1"] }),
      });
      expect(unauthBatch.status).toBe(401);

      const badOriginBatch = await callDashboard("/v1/transactions/batch", {
        method: "POST",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: "https://evil.example.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete", ids: ["txn_b_1"] }),
      });
      expect(badOriginBatch.status).toBe(403);

      // Integration worker does not expose batch endpoint
      const intBatch = await callIntegration("/v1/transactions/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete", ids: ["txn_b_1"] }),
      });
      expect(intBatch.status).toBe(404);

      // Validation errors -> 422
      const tooManyIds = Array.from({ length: 101 }, (_, idx) => `txn_${idx}`);
      for (const badBody of [
        { action: "delete", ids: [] },
        { action: "delete", ids: tooManyIds },
        { action: "update", ids: ["txn_b_1"], patch: {} },
        { action: "update", ids: ["txn_b_1"], patch: { category_id: "food" }, extra: true },
        { action: "update", ids: ["txn_b_1"], patch: { transaction_date: "2026-02-29" } },
      ]) {
        const res = await callDashboard("/v1/transactions/batch", {
          method: "POST",
          headers: {
            "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
            Origin: DASHBOARD_ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(badBody),
        });
        expect(res.status).toBe(422);
      }

      // Archived or unknown category_id fails with 422 and touches no rows
      for (const badCat of ["archived_batch_cat", "nonexistent_cat"]) {
        const res = await callDashboard("/v1/transactions/batch", {
          method: "POST",
          headers: {
            "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
            Origin: DASHBOARD_ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update",
            ids: ["txn_b_1", "txn_b_2"],
            patch: { category_id: badCat },
          }),
        });
        expect(res.status).toBe(422);
      }

      const row2Before = db.sqlite
        .prepare("SELECT category_id FROM transactions WHERE id = 'txn_b_2'")
        .get() as { category_id: string | null };
      expect(row2Before.category_id).toBe("transport");

      // Batch update category_id, type, and transaction_date (including null category)
      const updateCatRes = await callDashboard("/v1/transactions/batch", {
        method: "POST",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update",
          ids: ["txn_b_1", "txn_b_2", "txn_b_1"],
          patch: {
            category_id: "shopping",
            type: "refund",
            transaction_date: "2026-11-15",
          },
        }),
      });
      expect(updateCatRes.status).toBe(200);
      expect(await updateCatRes.json()).toEqual({
        action: "update",
        requested: 2,
        affected: 2,
      });

      const updatedRows = db.sqlite
        .prepare(
          "SELECT id, category_id, type, transaction_date FROM transactions WHERE id IN ('txn_b_1', 'txn_b_2') ORDER BY id",
        )
        .all() as Array<{
        id: string;
        category_id: string | null;
        type: string;
        transaction_date: string;
      }>;
      expect(updatedRows).toEqual([
        {
          id: "txn_b_1",
          category_id: "shopping",
          type: "refund",
          transaction_date: "2026-11-15",
        },
        {
          id: "txn_b_2",
          category_id: "shopping",
          type: "refund",
          transaction_date: "2026-11-15",
        },
      ]);

      // Clear category_id to null
      const uncategorizeRes = await callDashboard("/v1/transactions/batch", {
        method: "POST",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update",
          ids: ["txn_b_1"],
          patch: { category_id: null, type: "expense" },
        }),
      });
      expect(uncategorizeRes.status).toBe(200);
      const row1AfterNull = db.sqlite
        .prepare("SELECT category_id, type FROM transactions WHERE id = 'txn_b_1'")
        .get() as { category_id: string | null; type: string };
      expect(row1AfterNull).toEqual({ category_id: null, type: "expense" });

      // Batch delete skips already-deleted & missing IDs while counting affected rows
      const batchDeleteRes = await callDashboard("/v1/transactions/batch", {
        method: "POST",
        headers: {
          "Cf-Access-Authenticated-User-Email": OWNER_EMAIL,
          Origin: DASHBOARD_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete",
          ids: ["txn_b_1", "txn_b_3", "txn_b_deleted", "txn_missing", "txn_b_1"],
        }),
      });
      expect(batchDeleteRes.status).toBe(200);
      expect(await batchDeleteRes.json()).toEqual({
        action: "delete",
        requested: 4,
        affected: 2,
      });

      const summaryAfterRes = await callDashboard("/v1/summary?month=2026-11", {
        headers: { "Cf-Access-Authenticated-User-Email": OWNER_EMAIL },
      });
      expect(summaryAfterRes.status).toBe(200);
      expect(await summaryAfterRes.json()).toMatchObject({
        gross_expenses_minor: 0,
        refunds_minor: 60000,
        net_spending_minor: -60000,
      });
    });
  });

  describe("Phase 5: Monthly totals and category breakdown", () => {
    it("computes income, gross spending, refunds, net spending, remaining, and category buckets accurately", async () => {
      const insert = db.sqlite.prepare(
        `INSERT INTO transactions (
           id, transaction_date, type, amount_minor, currency_code,
           category_id, merchant, note, source, created_by_client_id,
           created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, 'VND', ?, ?, NULL, 'agent', NULL, '2026-11-17T00:00:00Z', '2026-11-17T00:00:00Z', ?)`,
      );

      // Phase 5 acceptance scenario from docs/BACKEND_PHASES.md
      insert.run("txn_s_1", "2026-11-01", "income", 15000000, "salary", "Employer", null);
      insert.run("txn_s_2", "2026-11-10", "expense", 45000, "food", "Highlands", null);
      insert.run("txn_s_3", "2026-11-11", "refund", 5000, "food", "Highlands", null);
      insert.run("txn_s_4", "2026-11-12", "transfer", 1000000, null, "Savings", null);
      // Soft-deleted row should be excluded
      insert.run("txn_s_deleted", "2026-11-15", "expense", 999999, "food", "Ignored", "2026-11-16T00:00:00Z");

      const summaryRes = await callIntegration("/v1/summary?month=2026-11", {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(summaryRes.status).toBe(200);
      const summary = await summaryRes.json();
      expect(summary).toEqual({
        month: "2026-11",
        currency_code: "VND",
        income_minor: 15000000,
        gross_expenses_minor: 45000,
        refunds_minor: 5000,
        net_spending_minor: 40000,
        remaining_minor: 14960000,
        by_category: [
          {
            category_id: "food",
            gross_expenses_minor: 45000,
            refunds_minor: 5000,
            net_spending_minor: 40000,
          },
        ],
      });

      // Uncategorized expense produces null category_id bucket
      insert.run("txn_s_uncat", "2026-11-18", "expense", 20000, null, "Cash", null);
      const withUncatRes = await callIntegration("/v1/summary?month=2026-11", {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      const withUncat = (await withUncatRes.json()) as {
        by_category: Array<{ category_id: string | null; net_spending_minor: number }>;
      };
      expect(withUncat.by_category).toEqual([
        {
          category_id: "food",
          gross_expenses_minor: 45000,
          refunds_minor: 5000,
          net_spending_minor: 40000,
        },
        {
          category_id: null,
          gross_expenses_minor: 20000,
          refunds_minor: 0,
          net_spending_minor: 20000,
        },
      ]);

      // Empty month returns zero totals and empty category breakdown
      const emptyRes = await callIntegration("/v1/summary?month=2025-01", {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(emptyRes.status).toBe(200);
      expect(await emptyRes.json()).toEqual({
        month: "2025-01",
        currency_code: "VND",
        income_minor: 0,
        gross_expenses_minor: 0,
        refunds_minor: 0,
        net_spending_minor: 0,
        remaining_minor: 0,
        by_category: [],
      });

      // Missing or invalid month returns 400
      expect(
        (
          await callIntegration("/v1/summary", {
            headers: { Authorization: `Bearer ${viewerToken}` },
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await callIntegration("/v1/summary?month=2026-99", {
            headers: { Authorization: `Bearer ${viewerToken}` },
          })
        ).status,
      ).toBe(400);
    });
  });
});
