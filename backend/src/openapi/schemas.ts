import { z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import type { ZodError } from "zod";
import { badRequest, validationError } from "../domain/errors";
import {
  transactionTypeSchema,
} from "../domain/validation";
import type { AppEnv } from "../env";
import {
  assertJsonContentType,
  parseJsonBody,
  zodErrorToFields,
} from "../http/validators";

export const HealthStatusSchema = z
  .object({
    status: z.enum(["ok"]),
  })
  .openapi("HealthStatus");

export const CapabilitiesSchema = z
  .object({
    mode: z.enum(["owner"]),
    can_write: z.boolean(),
  })
  .openapi("Capabilities");

export const TransactionIdSchema = z
  .object({
    id: z.string().min(1).max(64),
  })
  .openapi("TransactionId");

export const CategorySchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string(),
    archived: z.boolean(),
  })
  .openapi("Category");

export const CategoriesResponseSchema = z
  .object({
    items: z.array(CategorySchema),
  })
  .openapi("CategoriesResponse");

export const TransactionSchema = z
  .object({
    id: z.string().min(1).max(64),
    transaction_date: z.string(),
    type: transactionTypeSchema,
    amount_minor: z.number().int().min(1).max(9007199254740991),
    currency_code: z.string().regex(/^[A-Z]{3}$/),
    category_id: z.string().min(1).max(64).nullable(),
    merchant: z.string().max(200).nullable(),
    note: z.string().max(2000).nullable(),
    source: z.enum(["agent", "telegram", "dashboard"]),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Transaction");

export const TransactionPageSchema = z
  .object({
    items: z.array(TransactionSchema),
    next_cursor: z.string().nullable(),
  })
  .openapi("TransactionPage");

export const CategorySpendingSchema = z
  .object({
    category_id: z.string().min(1).max(64).nullable(),
    gross_expenses_minor: z.number().int().min(0),
    refunds_minor: z.number().int().min(0),
    net_spending_minor: z.number().int(),
  })
  .openapi("CategorySpending");

export const MonthlySummarySchema = z
  .object({
    month: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/),
    currency_code: z.string().regex(/^[A-Z]{3}$/),
    income_minor: z.number().int().min(0),
    gross_expenses_minor: z.number().int().min(0),
    refunds_minor: z.number().int().min(0),
    net_spending_minor: z.number().int(),
    remaining_minor: z.number().int(),
    by_category: z.array(CategorySpendingSchema),
  })
  .openapi("MonthlySummary");

export const BatchTransactionsResultSchema = z
  .object({
    action: z.enum(["delete", "update"]),
    requested: z.number().int().min(1),
    affected: z.number().int().min(0),
  })
  .openapi("BatchTransactionsResult");

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "invalid_request",
        "unauthorized",
        "forbidden",
        "not_found",
        "idempotency_conflict",
        "unsupported_media_type",
        "validation_error",
        "internal_error",
      ]),
      message: z.string(),
      fields: z.record(z.string(), z.string()).optional(),
    }),
  })
  .openapi("Error");

function jsonErrorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: ErrorSchema,
      },
    },
  };
}

export const COMMON_AUTH_ERROR_RESPONSES = {
  401: jsonErrorResponse("Missing or invalid credentials"),
  403: jsonErrorResponse("Credential lacks permission"),
  500: jsonErrorResponse("Unexpected error"),
};

export const COMMON_QUERY_ERROR_RESPONSES = {
  400: jsonErrorResponse("Bad request"),
  ...COMMON_AUTH_ERROR_RESPONSES,
};

export const COMMON_MUTATION_ERROR_RESPONSES = {
  400: jsonErrorResponse("Bad request"),
  401: jsonErrorResponse("Missing or invalid credentials"),
  403: jsonErrorResponse("Credential lacks permission"),
  415: jsonErrorResponse("Content type must be application/json"),
  422: jsonErrorResponse("Transaction fields failed validation"),
  500: jsonErrorResponse("Unexpected error"),
};

/**
 * Middleware that enforces `application/json` (415) and parses a JSON object
 * body (400) before `@hono/zod-openapi` runs Zod schema validation.
 */
export const requireJsonBodyMiddleware: MiddlewareHandler<{ Bindings: AppEnv }> =
  async (c, next) => {
    assertJsonContentType(c);
    await parseJsonBody(c);
    await next();
  };

/**
 * Maps `@hono/zod-openapi` validation failures to the API's standard `AppError`
 * status codes (422 for JSON body, 400 for query/param/header).
 */
export function openApiValidationHook(
  result:
    | { success: true }
    | { success: false; error: ZodError; target: string },
  _c: Context,
): Response | void {
  if (result.success) {
    return;
  }

  const fields = zodErrorToFields(result.error);
  if (result.target === "json") {
    throw validationError(
      "One or more transaction fields are invalid.",
      fields,
    );
  }
  if (result.target === "param") {
    throw badRequest("Invalid transaction ID.", fields);
  }
  if (result.target === "header") {
    const firstMessage = result.error.issues[0]?.message;
    throw badRequest("A valid Idempotency-Key header is required.", {
      "Idempotency-Key": firstMessage ?? "Invalid Idempotency-Key header.",
    });
  }
  throw badRequest("Invalid query parameters.", fields);
}
