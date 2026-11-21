import { z } from "zod";
import { sha256Hex } from "./crypto";
import { badRequest } from "./errors";
import type {
  BatchTransactionsInput,
  BatchUpdateTransactionPatch,
  CreateTransactionInput,
  CursorPayload,
  ListTransactionsQuery,
  NormalizedCreateTransaction,
  TransactionFilterSet,
  UpdateTransactionInput,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function monthToDateRange(month: string): {
  start: string;
  endExclusive: string;
} {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  const nextYear = monthNum === 12 ? year + 1 : year;
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
  return {
    start: `${month}-01`,
    endExclusive: `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

export const transactionTypeSchema = z.enum([
  "expense",
  "income",
  "transfer",
  "refund",
]);

export const monthSchema = z
  .string()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "Must be in YYYY-MM format.");

export const idParamSchema = z
  .string()
  .min(1, "ID cannot be empty.")
  .max(64, "ID must be at most 64 characters.");

export const idempotencyKeySchema = z
  .string()
  .min(16, "Idempotency-Key must be at least 16 characters.")
  .max(128, "Idempotency-Key must be at most 128 characters.")
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    "Idempotency-Key may only contain letters, digits, ., _, :, and -.",
  );

export const calendarDateSchema = z
  .string()
  .refine(isValidCalendarDate, "Must be a valid calendar date in YYYY-MM-DD format.");

const amountMinorSchema = z
  .number()
  .int("Amount must be an integer in minor units.")
  .min(1, "Amount must be at least 1.")
  .max(9007199254740991, "Amount exceeds safe integer limit.");

const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency code must be a 3-letter uppercase ISO code.");

const nullableCategoryIdSchema = z
  .string()
  .min(1, "Category ID cannot be empty.")
  .max(64, "Category ID must be at most 64 characters.")
  .nullable();

const nullableMerchantSchema = z
  .string()
  .max(200, "Merchant must be at most 200 characters.")
  .nullable();

const nullableNoteSchema = z
  .string()
  .max(2000, "Note must be at most 2000 characters.")
  .nullable();

export const createTransactionSchema: z.ZodType<CreateTransactionInput> =
  z.strictObject({
    transaction_date: calendarDateSchema,
    type: transactionTypeSchema,
    amount_minor: amountMinorSchema,
    currency_code: currencyCodeSchema,
    category_id: nullableCategoryIdSchema.optional(),
    merchant: nullableMerchantSchema.optional(),
    note: nullableNoteSchema.optional(),
  });

export const updateTransactionSchema: z.ZodType<UpdateTransactionInput> =
  z
    .strictObject({
      transaction_date: calendarDateSchema.optional(),
      type: transactionTypeSchema.optional(),
      amount_minor: amountMinorSchema.optional(),
      category_id: nullableCategoryIdSchema.optional(),
      merchant: nullableMerchantSchema.optional(),
      note: nullableNoteSchema.optional(),
    })
    .refine(
      (value) => Object.values(value).some((field) => field !== undefined),
      {
        message: "At least one field must be provided.",
      },
    );

export const MAX_BATCH_TRANSACTION_IDS = 100;

const batchIdsSchema = z
  .array(idParamSchema)
  .min(1, "At least one transaction ID is required.")
  .max(
    MAX_BATCH_TRANSACTION_IDS,
    "At most 100 transactions can be updated at once.",
  );

const batchUpdatePatchSchema: z.ZodType<BatchUpdateTransactionPatch> = z
  .strictObject({
    category_id: nullableCategoryIdSchema.optional(),
    type: transactionTypeSchema.optional(),
    transaction_date: calendarDateSchema.optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "At least one field must be provided.",
    },
  );

export const batchTransactionsSchema: z.ZodType<BatchTransactionsInput> =
  z.discriminatedUnion("action", [
    z.strictObject({
      action: z.literal("delete"),
      ids: batchIdsSchema,
    }),
    z.strictObject({
      action: z.literal("update"),
      ids: batchIdsSchema,
      patch: batchUpdatePatchSchema,
    }),
  ]);

export const listTransactionsQuerySchema: z.ZodType<ListTransactionsQuery> =
  z.strictObject({
    month: monthSchema.optional(),
    category_id: z
      .string()
      .min(1, "Category ID cannot be empty.")
      .max(64, "Category ID must be at most 64 characters.")
      .optional(),
    type: transactionTypeSchema.optional(),
    limit: z
      .string()
      .regex(/^\d+$/, "Limit must be an integer between 1 and 100.")
      .transform((value) => Number(value))
      .refine((value) => value >= 1 && value <= 100, {
        message: "Limit must be between 1 and 100.",
      })
      .optional()
      .transform((value) => value ?? 50),
    cursor: z
      .string()
      .min(1, "Cursor cannot be empty.")
      .max(1024, "Cursor is too long.")
      .optional(),
  });

export const summaryQuerySchema = z.strictObject({
  month: monthSchema,
});

export function normalizeCreateTransaction(
  input: CreateTransactionInput,
): NormalizedCreateTransaction {
  return {
    transaction_date: input.transaction_date,
    type: input.type,
    amount_minor: input.amount_minor,
    currency_code: input.currency_code,
    category_id: input.category_id ?? null,
    merchant: input.merchant ?? null,
    note: input.note ?? null,
  };
}

export async function hashNormalizedCreatePayload(
  normalized: NormalizedCreateTransaction,
): Promise<string> {
  const canonical = JSON.stringify([
    normalized.transaction_date,
    normalized.type,
    normalized.amount_minor,
    normalized.currency_code,
    normalized.category_id,
    normalized.merchant,
    normalized.note,
  ]);
  return sha256Hex(canonical);
}

export function buildFilterSet(query: {
  month?: string;
  category_id?: string;
  type?: ListTransactionsQuery["type"];
}): TransactionFilterSet {
  return {
    month: query.month ?? null,
    category_id: query.category_id ?? null,
    type: query.type ?? null,
  };
}

export function filterSetsEqual(
  a: TransactionFilterSet,
  b: TransactionFilterSet,
): boolean {
  return (
    a.month === b.month &&
    a.category_id === b.category_id &&
    a.type === b.type
  );
}

const cursorPayloadSchema: z.ZodType<CursorPayload> = z.strictObject({
  v: z.literal(1),
  d: calendarDateSchema,
  id: idParamSchema,
  f: z.strictObject({
    month: monthSchema.nullable(),
    category_id: z.string().min(1).max(64).nullable(),
    type: transactionTypeSchema.nullable(),
  }),
});

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw badRequest("The cursor is malformed.", {
      cursor: "Invalid cursor encoding.",
    });
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw badRequest("The cursor is malformed.", {
      cursor: "Invalid cursor encoding.",
    });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeCursor(payload: CursorPayload): string {
  return toBase64Url(encoder.encode(JSON.stringify(payload)));
}

export function decodeCursor(raw: string): CursorPayload {
  const bytes = fromBase64Url(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    throw badRequest("The cursor is malformed.", {
      cursor: "Invalid cursor payload.",
    });
  }

  const validated = cursorPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    throw badRequest("The cursor is malformed.", {
      cursor: "Invalid cursor payload.",
    });
  }
  return validated.data;
}
