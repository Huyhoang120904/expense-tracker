import { Hono } from "hono";
import { notFound } from "../domain/errors";
import type { AppEnv } from "../env";
import { toErrorResponse } from "../http/error-handler";
import dashboardApi, { createDashboardDependencies } from "./dashboard";

type HostedEnv = AppEnv & { ASSETS: Fetcher };

const app = new Hono<{ Bindings: HostedEnv }>();

app.onError((err, c) => toErrorResponse(c, err));
app.use("*", async (c, next) => {
  c.env = { ...c.env, DEV_AUTH_MODE: "production" };
  await next();
});
app.route("/api", dashboardApi);

app.all("/api/*", () => {
  throw notFound("The requested endpoint was not found.");
});

app.get("*", async (c) => {
  const { auth } = createDashboardDependencies(c.env);
  await auth.authenticateOwnerSession(c.req.raw, c.env);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
