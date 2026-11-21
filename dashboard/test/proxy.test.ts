import { describe, expect, it, vi } from "vitest";
import {
  createApiProxyHandler,
  isLoopbackUrl,
  resolveAllowedMutationPath,
  resolveAllowedUpstreamPath,
} from "../server/proxy.mjs";

function createMockRes() {
  const state = {
    status: 0,
    headers: {} as Record<string, string>,
    body: "",
  };
  const res = {
    writeHead(status: number, headers: Record<string, string> = {}) {
      state.status = status;
      state.headers = headers;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        state.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      }
    },
  };
  return { res, state };
}

describe("Local dashboard proxy", () => {
  it("resolves only allowed read routes and validates loopback URLs", () => {
    expect(resolveAllowedUpstreamPath("/api/health")).toBe("/health");
    expect(resolveAllowedUpstreamPath("/api/v1/categories")).toBe(
      "/v1/categories",
    );
    expect(resolveAllowedUpstreamPath("/api/v1/transactions")).toBe(
      "/v1/transactions",
    );
    expect(resolveAllowedUpstreamPath("/api/v1/transactions/txn_abc_123")).toBe(
      "/v1/transactions/txn_abc_123",
    );
    expect(resolveAllowedUpstreamPath("/api/v1/summary")).toBe("/v1/summary");

    expect(resolveAllowedUpstreamPath("/api/v1/keys")).toBeNull();
    expect(resolveAllowedUpstreamPath("/api/v1/transactions/a/b")).toBeNull();
    expect(resolveAllowedUpstreamPath("/api/v1/transactions/..")).toBeNull();
    expect(resolveAllowedUpstreamPath("/api/admin")).toBeNull();

    expect(resolveAllowedMutationPath("POST", "/api/v1/transactions")).toBe(
      "/v1/transactions",
    );
    expect(
      resolveAllowedMutationPath("POST", "/api/v1/transactions/batch"),
    ).toBe("/v1/transactions/batch");
    expect(
      resolveAllowedMutationPath("DELETE", "/api/v1/transactions/batch"),
    ).toBeNull();
    expect(resolveAllowedUpstreamPath("/api/v1/transactions/batch")).toBeNull();
    expect(
      resolveAllowedMutationPath("PATCH", "/api/v1/transactions/txn_1"),
    ).toBe("/v1/transactions/txn_1");
    expect(
      resolveAllowedMutationPath("DELETE", "/api/v1/transactions/txn_1"),
    ).toBe("/v1/transactions/txn_1");
    expect(resolveAllowedMutationPath("PUT", "/api/v1/transactions")).toBeNull();
    expect(resolveAllowedMutationPath("POST", "/api/v1/summary")).toBeNull();

    expect(isLoopbackUrl("http://127.0.0.1:8788")).toBe(true);
    expect(isLoopbackUrl("http://localhost:8788")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:8788")).toBe(true);
    expect(isLoopbackUrl("https://evil.example.com")).toBe(false);
    expect(isLoopbackUrl("")).toBe(false);
  });

  it("injects server-side Bearer key and strips client auth/cookies in readonly mode", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ items: [], next_cursor: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const handler = createApiProxyHandler({
      apiUrl: "http://127.0.0.1:8787",
      readKey: "etk_local.secret_123",
      fetchImpl: fetchMock,
    });

    const caps = createMockRes();
    await handler(
      { method: "GET", url: "/api/capabilities", headers: {} },
      caps.res,
    );
    expect(caps.state.status).toBe(200);
    expect(JSON.parse(caps.state.body)).toEqual({
      mode: "readonly",
      can_write: false,
    });

    const { res, state } = createMockRes();
    await handler(
      {
        method: "GET",
        url: "/api/v1/transactions?month=2026-11&limit=10",
        headers: {
          authorization: "Bearer client_spoofed",
          cookie: "CF_Authorization=spoof",
        },
      },
      res,
    );

    expect(state.status).toBe(200);
    expect(JSON.parse(state.body)).toEqual({ items: [], next_cursor: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe(
      "http://127.0.0.1:8787/v1/transactions?month=2026-11&limit=10",
    );
    expect((calledInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer etk_local.secret_123",
    );
    expect(
      (calledInit?.headers as Record<string, string>).Cookie,
    ).toBeUndefined();
  });

  it("rejects non-read HTTP methods with 405 in readonly mode without contacting upstream", async () => {
    const fetchMock = vi.fn();
    const handler = createApiProxyHandler({
      apiUrl: "http://127.0.0.1:8787",
      readKey: "etk_local.secret_123",
      fetchImpl: fetchMock,
    });

    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const { res, state } = createMockRes();
      await handler({ method, url: "/api/v1/transactions", headers: {} }, res);
      expect(state.status).toBe(405);
      expect(JSON.parse(state.body).error.code).toBe("forbidden");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects disallowed paths with 404 without contacting upstream", async () => {
    const fetchMock = vi.fn();
    const handler = createApiProxyHandler({
      apiUrl: "http://127.0.0.1:8787",
      readKey: "etk_local.secret_123",
      fetchImpl: fetchMock,
    });

    const { res, state } = createMockRes();
    await handler({ method: "GET", url: "/api/v1/keys", headers: {} }, res);
    expect(state.status).toBe(404);
    expect(JSON.parse(state.body).error.code).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 for /v1/* when read key is unconfigured while allowing /api/health", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const handler = createApiProxyHandler({
      apiUrl: "http://127.0.0.1:8787",
      readKey: "",
      fetchImpl: fetchMock,
    });

    const summaryRes = createMockRes();
    await handler(
      { method: "GET", url: "/api/v1/summary?month=2026-11", headers: {} },
      summaryRes.res,
    );
    expect(summaryRes.state.status).toBe(503);
    expect(JSON.parse(summaryRes.state.body).error.code).toBe("unauthorized");

    const healthRes = createMockRes();
    await handler({ method: "GET", url: "/api/health", headers: {} }, healthRes.res);
    expect(healthRes.state.status).toBe(200);
    expect(JSON.parse(healthRes.state.body)).toEqual({ status: "ok" });
  });

  it("supports loopback owner mode mutations while blocking disallowed methods and non-loopback targets", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/v1/transactions/batch")) {
        return new Response(
          JSON.stringify({ action: "delete", requested: 1, affected: 1 }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ id: "txn_new_1", url }), {
        status: init?.method === "POST" ? 201 : 200,
        headers: {
          "Content-Type": "application/json",
          ...(init?.method === "POST"
            ? { Location: "/v1/transactions/txn_new_1" }
            : {}),
        },
      });
    });

    const ownerHandler = createApiProxyHandler({
      apiUrl: "http://127.0.0.1:8787",
      readKey: "etk_local.secret_123",
      mode: "owner",
      dashboardApiUrl: "http://127.0.0.1:8788",
      ownerEmail: "owner@example.com",
      fetchImpl: fetchMock,
    });

    const caps = createMockRes();
    await ownerHandler(
      { method: "GET", url: "/api/capabilities", headers: {} },
      caps.res,
    );
    expect(JSON.parse(caps.state.body)).toEqual({
      mode: "owner",
      can_write: true,
    });

    const postRes = createMockRes();
    await ownerHandler(
      {
        method: "POST",
        url: "/api/v1/transactions",
        headers: {
          "content-type": "application/json",
          "cf-access-authenticated-user-email": "spoof@evil.com",
        },
        body: JSON.stringify({
          transaction_date: "2026-11-19",
          type: "expense",
          amount_minor: 45000,
          currency_code: "VND",
        }),
      },
      postRes.res,
    );
    expect(postRes.state.status).toBe(201);
    expect(postRes.state.headers.Location).toBe("/v1/transactions/txn_new_1");
    const [, postInit] = fetchMock.mock.calls[0]!;
    expect(
      (postInit?.headers as Record<string, string>)[
        "Cf-Access-Authenticated-User-Email"
      ],
    ).toBe("owner@example.com");
    expect((postInit?.headers as Record<string, string>).Origin).toBe(
      "http://127.0.0.1:8788",
    );

    const patchRes = createMockRes();
    await ownerHandler(
      {
        method: "PATCH",
        url: "/api/v1/transactions/txn_new_1",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_minor: 50000 }),
      },
      patchRes.res,
    );
    expect(patchRes.state.status).toBe(200);

    const delRes = createMockRes();
    await ownerHandler(
      { method: "DELETE", url: "/api/v1/transactions/txn_new_1", headers: {} },
      delRes.res,
    );
    expect(delRes.state.status).toBe(204);
    expect(delRes.state.body).toBe("");

    const batchPostRes = createMockRes();
    await ownerHandler(
      {
        method: "POST",
        url: "/api/v1/transactions/batch",
        headers: {
          "content-type": "application/json",
          "cf-access-authenticated-user-email": "spoof@evil.com",
        },
        body: JSON.stringify({
          action: "delete",
          ids: ["txn_new_1"],
        }),
      },
      batchPostRes.res,
    );
    expect(batchPostRes.state.status).toBe(200);
    const batchCall = fetchMock.mock.calls.at(-1)!;
    expect(batchCall[0]).toBe("http://127.0.0.1:8788/v1/transactions/batch");
    expect(
      (batchCall[1]?.headers as Record<string, string>)[
        "Cf-Access-Authenticated-User-Email"
      ],
    ).toBe("owner@example.com");
    expect((batchCall[1]?.headers as Record<string, string>).Origin).toBe(
      "http://127.0.0.1:8788",
    );

    const batchBadMethodRes = createMockRes();
    await ownerHandler(
      {
        method: "DELETE",
        url: "/api/v1/transactions/batch",
        headers: {},
      },
      batchBadMethodRes.res,
    );
    expect(batchBadMethodRes.state.status).toBe(405);

    const batchGetRes = createMockRes();
    await ownerHandler(
      {
        method: "GET",
        url: "/api/v1/transactions/batch",
        headers: {},
      },
      batchGetRes.res,
    );
    expect(batchGetRes.state.status).toBe(404);

    // Disallowed method or route in owner mode
    const badMethod = createMockRes();
    await ownerHandler(
      { method: "PUT", url: "/api/v1/transactions", headers: {} },
      badMethod.res,
    );
    expect(badMethod.state.status).toBe(405);

    const badRoute = createMockRes();
    await ownerHandler(
      { method: "POST", url: "/api/v1/keys", headers: {} },
      badRoute.res,
    );
    expect(badRoute.state.status).toBe(404);

    // Non-loopback dashboardApiUrl falls back safely to readonly
    const remoteHandler = createApiProxyHandler({
      apiUrl: "http://127.0.0.1:8787",
      readKey: "etk_local.secret_123",
      mode: "owner",
      dashboardApiUrl: "https://dashboard.example.com",
      ownerEmail: "owner@example.com",
      fetchImpl: fetchMock,
    });
    const remoteCaps = createMockRes();
    await remoteHandler(
      { method: "GET", url: "/api/capabilities", headers: {} },
      remoteCaps.res,
    );
    expect(JSON.parse(remoteCaps.state.body)).toEqual({
      mode: "readonly",
      can_write: false,
    });
    const remotePost = createMockRes();
    await remoteHandler(
      { method: "POST", url: "/api/v1/transactions", headers: {}, body: "{}" },
      remotePost.res,
    );
    expect(remotePost.state.status).toBe(405);

    const remoteBatchPost = createMockRes();
    await remoteHandler(
      {
        method: "POST",
        url: "/api/v1/transactions/batch",
        headers: {},
        body: JSON.stringify({ action: "delete", ids: ["txn_1"] }),
      },
      remoteBatchPost.res,
    );
    expect(remoteBatchPost.state.status).toBe(405);
  });
});
