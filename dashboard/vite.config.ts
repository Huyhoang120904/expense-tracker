import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createApiProxyHandler } from "./server/proxy.mjs";

function localApiProxyPlugin(options: {
  apiUrl: string;
  readKey: string;
  mode: string;
  dashboardApiUrl: string;
  ownerEmail: string;
}): Plugin {
  const handleApiProxy = createApiProxyHandler(options);
  return {
    name: "local-api-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "/";
        if (url === "/api" || url.startsWith("/api/")) {
          void handleApiProxy(req, res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      localApiProxyPlugin({
        apiUrl: env.EXPENSE_TRACKER_API_URL || "http://127.0.0.1:8787",
        readKey: env.EXPENSE_TRACKER_READ_KEY || "",
        mode: env.EXPENSE_TRACKER_MODE || "readonly",
        dashboardApiUrl: env.EXPENSE_TRACKER_DASHBOARD_API_URL || "",
        ownerEmail: env.EXPENSE_TRACKER_OWNER_EMAIL || "",
      }),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
  };
});
