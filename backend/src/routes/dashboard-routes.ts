import { Hono } from "hono";
import { badRequest, notFound, validationError } from "../domain/errors";
import {
  batchTransactionsSchema,
  createTransactionSchema,
  idParamSchema,
  listTransactionsQuerySchema,
  summaryQuerySchema,
  updateTransactionSchema,
} from "../domain/validation";
import type { AppEnv } from "../env";
import { toErrorResponse } from "../http/error-handler";
import {
  assertJsonContentType,
  parseJsonBody,
  zodErrorToFields,
} from "../http/validators";
import type { RouteDepsFactory } from "./integration-routes";

export function createDashboardApp(
  getDeps: RouteDepsFactory,
): Hono<{ Bindings: AppEnv }> {
  const app = new Hono<{ Bindings: AppEnv }>();

  app.onError((err, c) => toErrorResponse(c, err));
  app.notFound((c) =>
    toErrorResponse(c, notFound("The requested endpoint was not found.")),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/v1/categories", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);
    const items = await ledger.listCategories();
    return c.json({ items }, 200);
  });

  app.post("/v1/transactions", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);
    auth.assertSameOriginMutation(c.req.raw, c.env);

    assertJsonContentType(c);
    const body = await parseJsonBody(c);
    const parsed = createTransactionSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(
        "One or more transaction fields are invalid.",
        zodErrorToFields(parsed.error),
      );
    }

    const created = await ledger.createTransactionForOwner(parsed.data);
    c.header("Location", `/v1/transactions/${created.id}`);
    return c.json({ id: created.id }, 201);
  });

  app.post("/v1/transactions/batch", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);
    auth.assertSameOriginMutation(c.req.raw, c.env);

    assertJsonContentType(c);
    const body = await parseJsonBody(c);
    const parsed = batchTransactionsSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(
        "One or more batch transaction fields are invalid.",
        zodErrorToFields(parsed.error),
      );
    }

    const result = await ledger.batchTransactions(parsed.data);
    return c.json(result, 200);
  });

  app.get("/v1/transactions", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);

    const parsed = listTransactionsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw badRequest(
        "Invalid query parameters.",
        zodErrorToFields(parsed.error),
      );
    }

    const page = await ledger.listTransactions(parsed.data);
    return c.json(page, 200);
  });

  app.get("/v1/transactions/:id", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);

    const parsedId = idParamSchema.safeParse(c.req.param("id"));
    if (!parsedId.success) {
      throw badRequest("Invalid transaction ID.", {
        id: parsedId.error.issues[0]?.message ?? "Invalid transaction ID.",
      });
    }

    const tx = await ledger.getTransaction(parsedId.data);
    return c.json(tx, 200);
  });

  app.patch("/v1/transactions/:id", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);
    auth.assertSameOriginMutation(c.req.raw, c.env);

    const parsedId = idParamSchema.safeParse(c.req.param("id"));
    if (!parsedId.success) {
      throw badRequest("Invalid transaction ID.", {
        id: parsedId.error.issues[0]?.message ?? "Invalid transaction ID.",
      });
    }

    assertJsonContentType(c);
    const body = await parseJsonBody(c);
    const parsed = updateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(
        "One or more transaction fields are invalid.",
        zodErrorToFields(parsed.error),
      );
    }

    const updated = await ledger.updateTransaction(parsedId.data, parsed.data);
    return c.json(updated, 200);
  });

  app.delete("/v1/transactions/:id", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);
    auth.assertSameOriginMutation(c.req.raw, c.env);

    const parsedId = idParamSchema.safeParse(c.req.param("id"));
    if (!parsedId.success) {
      throw badRequest("Invalid transaction ID.", {
        id: parsedId.error.issues[0]?.message ?? "Invalid transaction ID.",
      });
    }

    await ledger.deleteTransaction(parsedId.data);
    return c.body(null, 204);
  });

  app.get("/v1/summary", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateOwnerSession(c.req.raw, c.env);

    const parsed = summaryQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw badRequest(
        "Invalid query parameters.",
        zodErrorToFields(parsed.error),
      );
    }

    const summary = await ledger.getMonthlySummary(parsed.data.month);
    return c.json(summary, 200);
  });

  return app;
}
