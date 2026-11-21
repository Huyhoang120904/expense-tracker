import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createApiProxyHandler } from "./server/proxy.mjs";

function socialMetadataPlugin(publicOrigin?: string): Plugin {
  const publicUrl = publicOrigin ? new URL(publicOrigin) : undefined;
  if (publicUrl && !["http:", "https:"].includes(publicUrl.protocol)) {
    throw new Error("DASHBOARD_PUBLIC_ORIGIN must use HTTP or HTTPS.");
  }

  const imagePath = "/so-thu-chi-og.png";
  const imageUrl = publicUrl ? `${publicUrl.origin}${imagePath}` : imagePath;

  return {
    name: "social-metadata",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return {
          html: html.replace("%DASHBOARD_OG_IMAGE_URL%", imageUrl),
          tags: publicUrl
            ? [{ tag: "meta", attrs: { property: "og:url", content: `${publicUrl.origin}/` } }]
            : [],
        };
      },
    },
  };
}

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
      socialMetadataPlugin(env.DASHBOARD_PUBLIC_ORIGIN),
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
