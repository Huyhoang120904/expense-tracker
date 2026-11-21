import fs from "node:fs";
import path from "node:path";

const ALLOWED_STATIC_ROUTES = new Map([
  ["/api/health", "/health"],
  ["/api/v1/categories", "/v1/categories"],
  ["/api/v1/transactions", "/v1/transactions"],
  ["/api/v1/summary", "/v1/summary"],
]);

const SINGLE_TRANSACTION_RE = /^\/api\/v1\/transactions\/([^/]+)$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const MAX_BODY_BYTES = 1024 * 1024;

function resolveTransactionItemPath(pathname) {
  const match = SINGLE_TRANSACTION_RE.exec(pathname);
  if (!match) {
    return null;
  }

  let decodedId;
  try {
    decodedId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  if (
    decodedId.length < 1 ||
    decodedId.length > 64 ||
    decodedId === "." ||
    decodedId === ".." ||
    decodedId === "batch" ||
    decodedId.includes("/") ||
    decodedId.includes("\\")
  ) {
    return null;
  }

  return `/v1/transactions/${encodeURIComponent(decodedId)}`;
}

export function isLoopbackUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveAllowedUpstreamPath(pathname) {
  const staticTarget = ALLOWED_STATIC_ROUTES.get(pathname);
  if (staticTarget) {
    return staticTarget;
  }
  return resolveTransactionItemPath(pathname);
}

export function resolveAllowedMutationPath(method, pathname) {
  if (method === "POST" && pathname === "/api/v1/transactions") {
    return "/v1/transactions";
  }
  if (method === "POST" && pathname === "/api/v1/transactions/batch") {
    return "/v1/transactions/batch";
  }
  if (method === "PATCH" || method === "DELETE") {
    return resolveTransactionItemPath(pathname);
  }
  return null;
}

export function loadLocalEnv(dashboardDir) {
  const loaded = {};
  for (const filename of [".env", ".env.local"]) {
    const filePath = path.join(dashboardDir, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
      const eqIndex = normalized.indexOf("=");
      if (eqIndex <= 0) {
        continue;
      }
      const key = normalized.slice(0, eqIndex).trim();
      let value = normalized.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      loaded[key] = value;
    }
  }
  return loaded;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

class PayloadTooLargeError extends Error {}

async function readRequestBody(req) {
  if (typeof req.body === "string") {
    const buf = Buffer.from(req.body, "utf8");
    if (buf.byteLength > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    return buf;
  }
  if (Buffer.isBuffer(req.body)) {
    if (req.body.byteLength > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    return req.body;
  }
  if (req.body !== undefined && req.body !== null && typeof req.body === "object") {
    const buf = Buffer.from(JSON.stringify(req.body), "utf8");
    if (buf.byteLength > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    return buf;
  }
  if (typeof req[Symbol.asyncIterator] !== "function") {
    return Buffer.alloc(0);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export function createApiProxyHandler({
  apiUrl = "http://127.0.0.1:8787",
  readKey = "",
  mode = "readonly",
  dashboardApiUrl = "",
  ownerEmail = "",
  fetchImpl = fetch,
} = {}) {
  const normalizedReadUrl = apiUrl.replace(/\/+$/, "");
  const effectiveOwnerMode =
    mode === "owner" &&
    Boolean(ownerEmail.trim()) &&
    isLoopbackUrl(dashboardApiUrl);
  const normalizedDashboardUrl = effectiveOwnerMode
    ? dashboardApiUrl.replace(/\/+$/, "")
    : "";
  const dashboardOrigin = effectiveOwnerMode
    ? new URL(normalizedDashboardUrl).origin
    : "";

  return async function handleApiProxy(req, res) {
    let requestUrl;
    try {
      requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      sendJson(res, 400, {
        error: {
          code: "invalid_request",
          message: "The request URL is malformed.",
        },
      });
      return;
    }

    const method = (req.method ?? "GET").toUpperCase();
    const isReadMethod = method === "GET" || method === "HEAD";

    if (requestUrl.pathname === "/api/capabilities") {
      if (!isReadMethod) {
        sendJson(res, 405, {
          error: {
            code: "forbidden",
            message: "Method not allowed for capabilities.",
          },
        });
        return;
      }
      if (method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
      sendJson(res, 200, {
        mode: effectiveOwnerMode ? "owner" : "readonly",
        can_write: effectiveOwnerMode,
      });
      return;
    }

    if (isReadMethod) {
      const upstreamPath = resolveAllowedUpstreamPath(requestUrl.pathname);
      if (!upstreamPath) {
        sendJson(res, 404, {
          error: {
            code: "not_found",
            message: "Route is not available in the local viewer.",
          },
        });
        return;
      }

      if (effectiveOwnerMode) {
        const upstreamUrl = `${normalizedDashboardUrl}${upstreamPath}${requestUrl.search}`;
        const headers = {
          Accept: "application/json",
          "Cf-Access-Authenticated-User-Email": ownerEmail.trim(),
        };
        await forwardUpstream(fetchImpl, upstreamUrl, method, headers, undefined, res);
        return;
      }

      const requiresAuth = upstreamPath.startsWith("/v1/");
      if (requiresAuth && !readKey) {
        sendJson(res, 503, {
          error: {
            code: "unauthorized",
            message:
              "Local read-only API key is not configured. Run npm run db:setup:local (in backend/).",
          },
        });
        return;
      }

      const upstreamUrl = `${normalizedReadUrl}${upstreamPath}${requestUrl.search}`;
      const headers = { Accept: "application/json" };
      if (requiresAuth) {
        headers.Authorization = `Bearer ${readKey}`;
      }
      await forwardUpstream(fetchImpl, upstreamUrl, method, headers, undefined, res);
      return;
    }

    if (!effectiveOwnerMode) {
      sendJson(res, 405, {
        error: {
          code: "forbidden",
          message: "Local viewer is read-only.",
        },
      });
      return;
    }

    const mutationPath = resolveAllowedMutationPath(method, requestUrl.pathname);
    if (!mutationPath) {
      if (
        resolveAllowedUpstreamPath(requestUrl.pathname) ||
        requestUrl.pathname === "/api/v1/transactions/batch"
      ) {
        sendJson(res, 405, {
          error: {
            code: "forbidden",
            message: "Method not allowed for this route.",
          },
        });
        return;
      }
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Route is not available in the local viewer.",
        },
      });
      return;
    }

    let bodyBuffer;
    try {
      bodyBuffer =
        method === "POST" || method === "PATCH"
          ? await readRequestBody(req)
          : undefined;
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 400, {
          error: {
            code: "invalid_request",
            message: "Request payload is too large.",
          },
        });
        return;
      }
      throw err;
    }

    const headers = {
      Accept: "application/json",
      "Cf-Access-Authenticated-User-Email": ownerEmail.trim(),
      Origin: dashboardOrigin,
    };
    const rawContentType = req.headers?.["content-type"];
    if (
      (method === "POST" || method === "PATCH") &&
      typeof rawContentType === "string" &&
      rawContentType.length > 0
    ) {
      headers["Content-Type"] = rawContentType;
    }

    const upstreamUrl = `${normalizedDashboardUrl}${mutationPath}${requestUrl.search}`;
    await forwardUpstream(fetchImpl, upstreamUrl, method, headers, bodyBuffer, res);
  };
}

async function forwardUpstream(
  fetchImpl,
  upstreamUrl,
  method,
  headers,
  body,
  res,
) {
  try {
    const upstreamResponse = await fetchImpl(upstreamUrl, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });

    if (upstreamResponse.status === 204) {
      res.writeHead(204, { "Cache-Control": "no-store" });
      res.end();
      return;
    }

    const responseHeaders = {
      "Content-Type":
        upstreamResponse.headers.get("content-type") ||
        "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    };
    const location = upstreamResponse.headers.get("location");
    if (location) {
      responseHeaders.Location = location;
    }

    const bodyBuffer =
      method === "HEAD"
        ? Buffer.alloc(0)
        : Buffer.from(await upstreamResponse.arrayBuffer());

    res.writeHead(upstreamResponse.status, responseHeaders);
    res.end(bodyBuffer);
  } catch {
    sendJson(res, 502, {
      error: {
        code: "internal_error",
        message: "Unable to reach the Expense Tracker API.",
      },
    });
  }
}
