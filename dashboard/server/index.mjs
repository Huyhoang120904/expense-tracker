import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiProxyHandler, loadLocalEnv } from "./proxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(__dirname, "..");
const distDir = path.resolve(dashboardDir, "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const fileEnv = loadLocalEnv(dashboardDir);
const apiUrl =
  process.env.EXPENSE_TRACKER_API_URL ||
  fileEnv.EXPENSE_TRACKER_API_URL ||
  "http://127.0.0.1:8787";
const readKey =
  process.env.EXPENSE_TRACKER_READ_KEY ||
  fileEnv.EXPENSE_TRACKER_READ_KEY ||
  "";
const mode =
  process.env.EXPENSE_TRACKER_MODE ||
  fileEnv.EXPENSE_TRACKER_MODE ||
  "readonly";
const dashboardApiUrl =
  process.env.EXPENSE_TRACKER_DASHBOARD_API_URL ||
  fileEnv.EXPENSE_TRACKER_DASHBOARD_API_URL ||
  "";
const ownerEmail =
  process.env.EXPENSE_TRACKER_OWNER_EMAIL ||
  fileEnv.EXPENSE_TRACKER_OWNER_EMAIL ||
  "";
const port = Number(
  process.env.LOCAL_DASHBOARD_PORT || fileEnv.LOCAL_DASHBOARD_PORT || 4173,
);

const handleApiProxy = createApiProxyHandler({
  apiUrl,
  readKey,
  mode,
  dashboardApiUrl,
  ownerEmail,
});

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function serveStatic(req, res, pathname) {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendText(res, 400, "Bad Request");
    return;
  }

  const relative =
    decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let targetPath = path.resolve(distDir, relative);

  if (targetPath !== distDir && !targetPath.startsWith(distDir + path.sep)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  let stat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
  if (stat?.isDirectory()) {
    targetPath = path.join(targetPath, "index.html");
    stat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
  }

  if (!stat || !stat.isFile()) {
    if (!path.extname(relative)) {
      const fallbackPath = path.join(distDir, "index.html");
      if (fs.existsSync(fallbackPath)) {
        const html = fs.readFileSync(fallbackPath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(method === "HEAD" ? undefined : html);
        return;
      }
    }
    sendText(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const body = method === "HEAD" ? undefined : fs.readFileSync(targetPath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
    await handleApiProxy(req, res);
    return;
  }
  serveStatic(req, res, requestUrl.pathname);
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `Local Expense Tracker viewer running at http://127.0.0.1:${port} -> ${apiUrl}`,
  );
  if (!readKey) {
    console.warn(
      "Warning: EXPENSE_TRACKER_READ_KEY is not set. Run `npm run db:setup:local` in `backend/` to provision local keys.",
    );
  }
});
