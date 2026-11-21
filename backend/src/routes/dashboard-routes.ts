import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { notFound } from "../domain/errors";
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
import { renderOpenApiDocsHtml } from "../openapi/docs-ui";
import {
  BatchTransactionsResultSchema,
  CapabilitiesSchema,
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
import type { RouteDepsFactory } from "./integration-routes";

const IdParamObjectSchema = z.object({
  id: idParamSchema.openapi({ param: { name: "id", in: "path" } }),
});

export function createDashboardApp(
  getDeps: RouteDepsFactory,
): OpenAPIHono<{ Bindings: AppEnv }> {
  const app = new OpenAPIHono<{ Bindings: AppEnv }>({
    defaultHook: openApiValidationHook,
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "OwnerSession", {
    type: "apiKey",
    in: "cookie",
    name: "CF_Authorization",
    description:
      "Cloudflare Access session for the owner. Owner mutations also require a same-origin browser request. Access can redirect to sign-in before the Worker runs.",
  });

  app.onError((err, c) => toErrorResponse(c, err));
  app.notFound((c) =>
    toErrorResponse(c, notFound("The requested endpoint was not found.")),
  );

  const requireOwnerSession = (
    isMutation = false,
  ): MiddlewareHandler<{ Bindings: AppEnv }> => {
    return async (c, next) => {
      const { auth } = getDeps(c.env);
      await auth.authenticateOwnerSession(c.req.raw, c.env);
      if (isMutation) {
        auth.assertSameOriginMutation(c.req.raw, c.env);
      }
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

  app.doc31("/openapi.json", (c) => {
    const url = new URL(c.req.url);
    const basePath = c.req.path.replace(/\/openapi\.json$/, "");
    return {
      openapi: "3.1.1",
      info: {
        title: "Personal Expense Tracker — Dashboard API",
        version: "0.1.0",
        description:
          "Owner-session endpoints for the expense tracker dashboard, including ledger CRUD and batch operations.",
      },
      servers: [
        {
          url: `${url.origin}${basePath}`,
          description: "Dashboard Worker, behind Cloudflare Access",
        },
      ],
      security: [{ OwnerSession: [] }],
    };
  });

  app.get("/docs", (c) => {
    const specUrl = c.req.path.replace(/\/docs$/, "/openapi.json");
    return c.html(
      renderOpenApiDocsHtml({
        title: "Personal Expense Tracker — Dashboard API",
        specUrl,
      }),
    );
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/capabilities",
      operationId: "getCapabilities",
      summary: "Get dashboard session capabilities",
      tags: ["System"],
      middleware: [requireOwnerSession()],
      responses: {
        200: {
          description: "Current session capabilities",
          content: {
            "application/json": {
              schema: CapabilitiesSchema,
            },
          },
        },
        ...COMMON_AUTH_ERROR_RESPONSES,
      },
    }),
    (c) =>
      c.json({ mode: "owner" as const, can_write: true }, 200, {
        "Cache-Control": "no-store",
      }),
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
      middleware: [requireOwnerSession()],
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
      operationId: "createTransactionAsOwner",
      summary: "Create a ledger transaction as owner",
      tags: ["Transactions"],
      middleware: [requireOwnerSession(true), requireJsonBodyMiddleware],
      request: {
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
        201: {
          description: "Created",
          content: {
            "application/json": {
              schema: TransactionIdSchema,
            },
          },
          headers: z.object({
            Location: z.string().openapi({
              description: "Relative URL of the created row.",
              example: "/v1/transactions/txn_example",
            }),
          }),
        },
        ...COMMON_MUTATION_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const input = c.req.valid("json");
      const created = await ledger.createTransactionForOwner(input);
      c.header("Location", `${c.req.path}/${created.id}`);
      return c.json({ id: created.id }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/transactions/batch",
      operationId: "batchTransactions",
      summary: "Batch update or delete active transactions",
      tags: ["Transactions"],
      description:
        "Applies a single update patch or soft-delete across up to 100 transaction IDs in one atomic batch.",
      middleware: [requireOwnerSession(true), requireJsonBodyMiddleware],
      request: {
        body: {
          required: true,
          content: {
            "application/json": {
              schema: batchTransactionsSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Batch operation summary",
          content: {
            "application/json": {
              schema: BatchTransactionsResultSchema,
            },
          },
        },
        ...COMMON_MUTATION_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const input = c.req.valid("json");
      const result = await ledger.batchTransactions(input);
      return c.json(result, 200);
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
      middleware: [requireOwnerSession()],
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
      middleware: [requireOwnerSession()],
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

  app.openapi(
    createRoute({
      method: "patch",
      path: "/v1/transactions/{id}",
      operationId: "updateTransaction",
      summary: "Edit an active transaction",
      tags: ["Transactions"],
      description:
        "Send at least one field. Omitted fields retain their values. Use null to clear a category, merchant, or note. A category assignment must be active unless it is the transaction's existing category.",
      middleware: [requireOwnerSession(true), requireJsonBodyMiddleware],
      request: {
        params: IdParamObjectSchema,
        body: {
          required: true,
          content: {
            "application/json": {
              schema: updateTransactionSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated transaction",
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
        ...COMMON_MUTATION_ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const { ledger } = getDeps(c.env);
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const updated = await ledger.updateTransaction(id, patch);
      return c.json(updated, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/v1/transactions/{id}",
      operationId: "deleteTransaction",
      summary: "Soft-delete a transaction",
      tags: ["Transactions"],
      description:
        "A repeated delete of an already deleted transaction returns 204. An unknown ID returns 404.",
      middleware: [requireOwnerSession(true)],
      request: {
        params: IdParamObjectSchema,
      },
      responses: {
        204: {
          description: "Deleted or already deleted",
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
      await ledger.deleteTransaction(id);
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/summary",
      operationId: "getMonthlySummary",
      summary: "Get monthly income and spending",
      tags: ["Summary"],
      description:
        "Uses active rows by local transaction date. Refunds reduce spending in their posting month. Transfers contribute zero. The category breakdown covers expenses and refunds and includes an uncategorized bucket when needed.",
      middleware: [requireOwnerSession()],
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
