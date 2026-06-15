import { z } from "zod";

const positiveAmount = z.coerce.number().positive("Amount must be positive").max(10_000_000);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const CreateFosSchema = z.object({
  full_name: z.string().min(2, "Name is too short"),
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().optional().nullable(),
});

export const CreateRetailerSchema = z.object({
  retailer_code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, underscore or dash only"),
  full_name: z.string().min(2, "Name is too short"),
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().optional().nullable(),
  fos_id: z.string().uuid().optional().nullable(),
});

export const AssignRetailerSchema = z.object({
  retailer_id: z.string().uuid(),
  fos_id: z.string().uuid().nullable(),
});

export const SetActiveSchema = z.object({
  user_id: z.string().uuid(),
  active: z.coerce.boolean(),
});

export const SetFosAutoApproveSchema = z.object({
  fos_id: z.string().uuid(),
  auto_approve: z.coerce.boolean(),
});

export const SetAllFosAutoApproveSchema = z.object({
  auto_approve: z.coerce.boolean(),
});

export const NewMoneyRequestSchema = z.object({
  account_id: z.string().uuid(),
  amount: positiveAmount,
  notes: z.string().max(500).optional(),
});

export const FosReviewSchema = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(["accept", "edit", "decline"]),
  amount: positiveAmount.optional(),
  notes: z.string().max(500).optional(),
  account_id: z.string().uuid().optional().nullable(),
});

export const DistributorRequestDecisionSchema = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(["approve", "decline"]),
  amount: positiveAmount.optional(),
  notes: z.string().max(500).optional(),
});

export const NewCashSubmissionSchema = z.object({
  retailer_id: z.string().uuid(),
  account_id: z.string().uuid(),
  amount: positiveAmount,
  txn_date: isoDate.optional(),
  notes: z.string().max(500).optional(),
});

export const RetailerCashSubmissionSchema = z.object({
  account_id: z.string().uuid(),
  amount: positiveAmount,
  txn_date: isoDate.optional(),
  notes: z.string().max(500).optional(),
});

export const CashDecisionSchema = z.object({
  cash_id: z.string().uuid(),
  decision: z.enum(["approve", "decline"]),
  amount: positiveAmount.optional(),
  notes: z.string().max(500).optional(),
});

export const EodRowSchema = z
  .object({
    // Either retailer_code or retailer_phone must be set; phone is preferred
    // because it's what real payment-provider exports give us.
    retailer_code: z.string().min(1).max(32).optional(),
    retailer_phone: z.string().min(7).max(20).optional(),
    retailer_name: z.string().max(200).optional(),
    type: z.enum(["transfer", "reversal"]),
    amount: positiveAmount,
    txn_date: isoDate,
    bank_reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.retailer_code || d.retailer_phone || d.retailer_name, {
    message: "A retailer code, phone or name is required",
    path: ["retailer_code"],
  });

export type EodRow = z.infer<typeof EodRowSchema>;
