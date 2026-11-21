import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { forbidden, notFound } from "../domain/errors";
import type { ApiScope, AuthenticatedClient } from "../domain/types";
import {
  createTransactionSchema,
  idempotencyKeySchema,
  idParamSchema,
  listTransactionsQuerySchema,
  summaryQuerySchema,
} from "../domain/validation";
import type { AppEnv } from "../env";
import { toErrorResponse } from "../http/error-handler";
import { renderOpenApiDocsHtml } from "../openapi/docs-ui";
import {
  CategoriesResponseSchema,
  COMMON_AUTH_ERROR_RESPONSES,
  COMMON_MUTATION_ERROR_RESPONSES,
  COMMON_QUERY_ERROR_RESPONSES,
  ErrorSchema,
  HealthStatusSchema,
  MonthlySummarySchema,
  openApiValidationHook,
  requireJsonBodyMiddleware,
  TransactionIdSchema,
  TransactionPageSchema,
  TransactionSchema,
} from "../openapi/schemas";
import type { AuthService } from "../services/auth-service";
import type { LedgerService } from "../services/ledger-service";

export interface RouteDeps {
  auth: AuthService;
  ledger: LedgerService;
}

export type RouteDepsFactory = (env: AppEnv) => RouteDeps;

type IntegrationVariables = {
  client: AuthenticatedClient;
};

type IntegrationAppEnv = {
  Bindings: AppEnv;
  Variables: IntegrationVariables;
};

const IdParamObjectSchema = z.object({
  id: idParamSchema.openapi({ param: { name: "id", in: "path" } }),
});

const IdempotencyHeaderSchema = z.object({
  "idempotency-key": idempotencyKeySchema.openapi({
    param: {
      in: "header",
      description:
        "Unique within the client for one logical create request. Reuse the same key and normalized payload on retry.",
    },
  }),
});

export function createIntegrationApp(
  getDeps: RouteDepsFactory,
): OpenAPIHono<IntegrationAppEnv> {
  const app = new OpenAPIHono<IntegrationAppEnv>({
    defaultHook: openApiValidationHook,
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "BearerKey", {
    type: "http",
    scheme: "bearer",
    description: "Scoped expense tracker API key (`etk_<keyId>.<secret>`).",
  });

  app.onError((err, c) => toErrorResponse(c, err));
  app.notFound((c) =>
    toErrorResponse(c, notFound("The requested endpoint was not found.")),
  );

  const requireScope = (
    scope: ApiScope,
  ): MiddlewareHandler<IntegrationAppEnv> => {
    return async (c, next) => {
      const { auth } = getDeps(c.env);
      const client = await auth.authenticateApiKey(
        c.req.header("Authorization"),
        scope,
      );
      c.set("client", client);
      await next();
    };
  };

  app.openapi(
    createRoute({
      method: "get",
      path: "/health",
      operationId: "getHealth",
      summary: "Health check",
      tags: ["System"],
      security: [],
      responses: {
        200: {
          description: "Worker is healthy",
          content: {
            "application/json": {
              schema: HealthStatusSchema,
            },
          },
        },
      },
    }),
    (c) => c.json({ status: "ok" as const }, 200),
  );

  app.doc31("/openapi.json", (c) => ({
    openapi: "3.1.1",
    info: {
      title: "Personal Expense Tracker — Integration API",
      version: "0.1.0",
      description:
        "Scoped API-key endpoints for agents and integrations to read ledger data and create idempotent transactions.",
    },
    servers: [
      {
        url: new URL(c.req.url).origin,
        description: "Integration Worker",
      },
    ],
    security: [{ BearerKey: [] }],
  }));

  app.get("/docs", (c) =>
    c.html(
      renderOpenApiDocsHtml({
        title: "Personal Expense Tracker — Integration API",
        specUrl: "/openapi.json",
      }),
    ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/categories",
      operationId: "listCategories",
      summary: "List ledger categories",
      tags: ["Categories"],
      description:
        "Includes archived categories for historical labels. Use active categories when creating a transaction.",
      middleware: [requireScope("transactions:read")],
      responses: {
        200: {
          description: "Categories",
          content: {
            "application/json": {
              schema: CategoriesResponseSchema,
            },
          },
        },
        ...COMMON_AUTH_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const items = await ledger.listCategories();
      return c.json({ items }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/transactions",
      operationId: "createTransaction",
      summary: "Create a ledger transaction",
      tags: ["Transactions"],
      middleware: [
        requireScope("transactions:create"),
        requireJsonBodyMiddleware,
      ],
      request: {
        headers: IdempotencyHeaderSchema,
        body: {
          required: true,
          content: {
            "application/json": {
              schema: createTransactionSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Identical replay with the original ID",
          content: {
            "application/json": {
              schema: TransactionIdSchema,
            },
          },
        },
        201: {
          description: "Created",
          content: {
            "application/json": {
              schema: TransactionIdSchema,
            },
          },
          headers: z.object({
            Location: z.string().openapi({
              description:
                "Relative URL of the created row. Reading it requires read access.",
              example: "/v1/transactions/txn_example",
            }),
          }),
        },
        409: {
          description: "Idempotency key was used for a different create payload",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
        ...COMMON_MUTATION_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const client = c.get("client");
      const { "idempotency-key": idempotencyKey } = c.req.valid("header");
      const input = c.req.valid("json");

      const result = await ledger.createTransactionForClient(
        client,
        idempotencyKey,
        input,
      );

      if (result.replayed) {
        return c.json({ id: result.id }, 200);
      }

      c.header("Location", `/v1/transactions/${result.id}`);
      return c.json({ id: result.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/transactions",
      operationId: "listTransactions",
      summary: "List active transactions",
      tags: ["Transactions"],
      description:
        "Orders by transaction_date descending and then id descending. Omit month to list across months. Filters are combined. Use the same filters with the next cursor.",
      middleware: [requireScope("transactions:read")],
      request: {
        query: listTransactionsQuerySchema,
      },
      responses: {
        200: {
          description: "A page of transactions",
          content: {
            "application/json": {
              schema: TransactionPageSchema,
            },
          },
        },
        ...COMMON_QUERY_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const query = c.req.valid("query");
      const page = await ledger.listTransactions(query);
      return c.json(page, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/transactions/{id}",
      operationId: "getTransaction",
      summary: "Get an active transaction",
      tags: ["Transactions"],
      middleware: [requireScope("transactions:read")],
      request: {
        params: IdParamObjectSchema,
      },
      responses: {
        200: {
          description: "Transaction",
          content: {
            "application/json": {
              schema: TransactionSchema,
            },
          },
        },
        404: {
          description: "Transaction not found",
          content: {
            "application/json": {
              schema: ErrorSchema,
            },
          },
        },
        ...COMMON_QUERY_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const { id } = c.req.valid("param");
      const tx = await ledger.getTransaction(id);
      return c.json(tx, 200);
    },
  );

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

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/summary",
      operationId: "getMonthlySummary",
      summary: "Get monthly income and spending",
      tags: ["Summary"],
      description:
        "Uses active rows by local transaction date. Refunds reduce spending in their posting month. Transfers contribute zero. The category breakdown covers expenses and refunds and includes an uncategorized bucket when needed.",
      middleware: [requireScope("transactions:read")],
      request: {
        query: summaryQuerySchema,
      },
      responses: {
        200: {
          description: "Monthly totals",
          content: {
            "application/json": {
              schema: MonthlySummarySchema,
            },
          },
        },
        ...COMMON_QUERY_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const { month } = c.req.valid("query");
      const summary = await ledger.getMonthlySummary(month);
      return c.json(summary, 200);
    },
  );

  return app;
}
