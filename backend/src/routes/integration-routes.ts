import { Hono } from "hono";
import { badRequest, forbidden, notFound, validationError } from "../domain/errors";
import {
  createTransactionSchema,
  idempotencyKeySchema,
  idParamSchema,
  listTransactionsQuerySchema,
  summaryQuerySchema,
} from "../domain/validation";
import type { AppEnv } from "../env";
import { toErrorResponse } from "../http/error-handler";
import {
  assertJsonContentType,
  parseJsonBody,
  zodErrorToFields,
} from "../http/validators";
import type { AuthService } from "../services/auth-service";
import type { LedgerService } from "../services/ledger-service";

export interface RouteDeps {
  auth: AuthService;
  ledger: LedgerService;
}

export type RouteDepsFactory = (env: AppEnv) => RouteDeps;

export function createIntegrationApp(
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
    await auth.authenticateApiKey(
      c.req.header("Authorization"),
      "transactions:read",
    );
    const items = await ledger.listCategories();
    return c.json({ items }, 200);
  });

  app.post("/v1/transactions", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    const client = await auth.authenticateApiKey(
      c.req.header("Authorization"),
      "transactions:create",
    );

    assertJsonContentType(c);

    const rawIdempotencyKey = c.req.header("Idempotency-Key");
    const keyResult = idempotencyKeySchema.safeParse(rawIdempotencyKey);
    if (!keyResult.success) {
      throw badRequest("A valid Idempotency-Key header is required.", {
        "Idempotency-Key":
          keyResult.error.issues[0]?.message ?? "Invalid Idempotency-Key header.",
      });
    }

    const body = await parseJsonBody(c);
    const parsed = createTransactionSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(
        "One or more transaction fields are invalid.",
        zodErrorToFields(parsed.error),
      );
    }

    const result = await ledger.createTransactionForClient(
      client,
      keyResult.data,
      parsed.data,
    );

    if (result.replayed) {
      return c.json({ id: result.id }, 200);
    }

    c.header("Location", `/v1/transactions/${result.id}`);
    return c.json({ id: result.id }, 201);
  });

  app.get("/v1/transactions", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateApiKey(
      c.req.header("Authorization"),
      "transactions:read",
    );

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
    await auth.authenticateApiKey(
      c.req.header("Authorization"),
      "transactions:read",
    );

    const parsedId = idParamSchema.safeParse(c.req.param("id"));
    if (!parsedId.success) {
      throw badRequest("Invalid transaction ID.", {
        id: parsedId.error.issues[0]?.message ?? "Invalid transaction ID.",
      });
    }

    const tx = await ledger.getTransaction(parsedId.data);
    return c.json(tx, 200);
  });

  // Integration API keys are never permitted to edit or delete ledger rows.
  app.patch("/v1/transactions/:id", async (c) => {
    const { auth } = getDeps(c.env);
    await auth.authenticateApiKey(
      c.req.header("Authorization"),
      "transactions:read",
    );
    throw forbidden();
  });

  app.delete("/v1/transactions/:id", async (c) => {
    const { auth } = getDeps(c.env);
    await auth.authenticateApiKey(
      c.req.header("Authorization"),
      "transactions:read",
    );
    throw forbidden();
  });

  app.get("/v1/summary", async (c) => {
    const { auth, ledger } = getDeps(c.env);
    await auth.authenticateApiKey(
      c.req.header("Authorization"),
      "transactions:read",
    );

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
