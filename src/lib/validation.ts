import { z } from "zod";
import { ORDER_STATUSES, NETWORKS, ROLES } from "./types";

// ---------- Auth ----------
export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
  signupCode: z.string().trim().max(60).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Enter a valid email"),
  phone: z.string().max(20).optional().or(z.literal("")),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .optional()
    .or(z.literal("")),
});

// ---------- Orders ----------
export const normalizeGhanaPhone = (raw: string): string => {
  let p = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (p.startsWith("233") && p.length === 12) p = `0${p.slice(3)}`;
  if (p.length === 9) p = `0${p}`;
  return p;
};

const ghanaPhoneRegex = /^0(24|25|53|54|55|59|20|50|26|27|56|57)\d{7}$/;

export const phoneSchema = z.preprocess(
  (val) =>
    typeof val === "string" || typeof val === "number"
      ? normalizeGhanaPhone(String(val).trim())
      : val,
  z
    .string()
    .trim()
    .regex(
      ghanaPhoneRegex,
      "Enter a valid Ghanaian number e.g. 0241234567"
    )
);

export const sendOrderLineSchema = z.object({
  phoneNumber: phoneSchema,
  network: z.enum(NETWORKS as [string, ...string[]]),
  gbAmount: z.coerce.number().positive(),
  packageId: z.string().optional(),
});

export const sendOrdersSchema = z.object({
  orders: z.array(sendOrderLineSchema).min(1, "Add at least one order").max(500),
});

export const packageToggleSchema = z.object({
  active: z.boolean(),
});

export const orderStatusChangeSchema = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]]),
  reason: z.string().max(300).optional().or(z.literal("")),
  force: z.boolean().optional(),
});

export const bulkStatusSchema = z.object({
  orderIds: z.array(z.coerce.number().int().positive()).min(1),
  status: z.enum(ORDER_STATUSES as [string, ...string[]]),
  reason: z.string().max(300).optional().or(z.literal("")),
  force: z.boolean().optional(),
});

// ---------- Batches ----------
export const batchActionSchema = z.object({
  action: z.enum(["MARK_PROCESSING", "MARK_COMPLETED", "MARK_FAILED", "CANCEL"]),
  orderIds: z.array(z.coerce.number().int().positive()).optional(),
  reason: z.string().max(300).optional().or(z.literal("")),
  force: z.boolean().optional(),
});

export const exportOrdersSchema = z.object({
  network: z.enum(NETWORKS as [string, ...string[]]),
  orderIds: z.array(z.coerce.number().int().positive()).optional(),
  batchIds: z.array(z.string()).optional(),
  userId: z.string().optional().or(z.literal("")),
  packageId: z.string().optional().or(z.literal("")),
  from: z.string().optional().or(z.literal("")),
  to: z.string().optional().or(z.literal("")),
  isReexport: z.boolean().optional(),
  reason: z.string().max(300).optional().or(z.literal("")),
});

export const deliveryReportActionSchema = z.object({
  reportId: z.string().min(1),
  action: z.enum([
    // Existing actions (§34) — preserved
    "RESOLVE_RESEND",
    "RESOLVE_REFUND",
    "REJECT",
    // Improved admin workflow (§9/§16)
    "START_INVESTIGATION",
    "KEEP_INVESTIGATING",
    "MARK_DELIVERED",
    "ADD_RESPONSE",
    "RESOLVE",
  ]),
  resolutionNote: z.string().max(300).optional().or(z.literal("")),
  adminResponse: z.string().max(1000).optional().or(z.literal("")),
});

export const deliveryReportCreateSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  reason: z.string().min(1, "Select or enter a reason").max(200),
  message: z.string().max(600).optional().or(z.literal("")),
});

// ---------- Admin ----------
export const createUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLES as [string, ...string[]]),
  balance: z.coerce.number().min(0).default(0),
  pricingProfileId: z.string().optional().or(z.literal("")),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  role: z.enum(ROLES as [string, ...string[]]),
  status: z.enum(["ACTIVE", "DISABLED"]),
  balance: z.coerce.number().min(0),
  pricingProfileId: z.string().optional().or(z.literal("")),
  password: z.string().min(8).optional().or(z.literal("")),
});

export const pricingProfileSchema = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(["RETAIL", "RESELLER", "WHOLESALE", "MANAGER"]),
  active: z.boolean().default(true),
  tiers: z
    .array(
      z.object({
        gbAmount: z.coerce.number().positive(),
        priceGHS: z.coerce.number().min(0),
      })
    )
    .min(1, "Add at least one price tier"),
});

export const packageSchema = z.object({
  network: z.enum(NETWORKS as [string, ...string[]]),
  name: z.string().min(2).max(80),
  gbAmount: z.coerce.number().positive(),
  description: z.string().max(300).optional().or(z.literal("")),
  providerProductId: z.string().max(80).optional().or(z.literal("")),
  retailPriceGHS: z.coerce.number().min(0).optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

// ---------- Billing ----------
export const paystackTopupSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Amount must be positive")
    .max(5000, "Maximum Paystack top-up is GHS 5,000.00"),
});

// ---------- Admin ----------
export const settingsSchema = z.object({
  order_processing_halted: z.enum(["true", "false"]).optional(),
  support_whatsapp: z.string().max(40).optional(),
  site_name: z.string().max(80).optional(),
  default_momo_number: z.string().max(40).optional(),
});

export const pricingProfileUpdateSchema = pricingProfileSchema;

// ---------- Storefront ----------
export const storefrontSettingsSchema = z.object({
  storeName: z.string().min(2, "Store name is required").max(60),
  tagline: z.string().max(120).optional().or(z.literal("")),
  description: z.string().max(600).optional().or(z.literal("")),
  supportPhone: z.string().max(20).optional().or(z.literal("")),
  contactText: z.string().max(120).optional().or(z.literal("")),
  whatsappLabel: z.string().max(40).optional().or(z.literal("")),
});

/** User-side store application: the user only supplies their store identity. */
export const storefrontApplySchema = z.object({
  storeName: z.string().min(2, "Store name is required").max(60),
  description: z.string().max(600).optional().or(z.literal("")),
});

export const storefrontProductUpsertSchema = z.object({
  packageId: z.string().min(1, "Select a package"),
  sellingPrice: z.coerce
    .number()
    .positive("Selling price must be positive")
    .max(10000, "Price is too high"),
  isActive: z.boolean().default(true),
});

export const storefrontBulkPricingSchema = z.object({
  packageIds: z.array(z.string()).min(1, "Select at least one package"),
  markupPercent: z.coerce
    .number()
    .min(0, "Markup cannot be negative")
    .max(500, "Markup is too high"),
});

export const storefrontCheckoutSchema = z.object({
  packageId: z.string().min(1, "Select a data bundle"),
  customerPhone: z
    .string()
    .trim()
    .regex(/^0\d{9}$/, "Enter a valid 10-digit number starting with 0"),
});

export const storefrontTrackSchema = z.object({
  query: z
    .string()
    .trim()
    .min(4, "Enter an order ID, phone number, or payment reference")
    .max(60),
});

export const storefrontWithdrawalSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Amount must be positive")
    .max(10000, "Amount is too high"),
  network: z.enum(["MTN", "TELECEL", "AIRTELTIGO"]),
  momoNumber: phoneSchema,
  accountName: z.string().min(2, "Account name is required").max(80),
});

export const storefrontWithdrawalReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  adminNote: z.string().max(300).optional().or(z.literal("")),
});

export const adminStorefrontSchema = z.object({
  userId: z.string().min(1, "Select a user"),
  action: z.enum(["ENABLE", "SUSPEND", "REVOKE", "APPROVE", "REJECT"]),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{2,31}$/, "Slug must be 3-32 lowercase letters, numbers or dashes")
    .optional(),
  note: z.string().max(300).optional().or(z.literal("")),
});

export const adminMarkupBoundsSchema = z.object({
  minMarkup: z.coerce.number().min(0),
  maxMarkup: z.coerce.number().min(0),
});

// ---------- Public API ----------

export const publicOrderSchema = z.object({
  phoneNumber: phoneSchema,
  packageId: z.string().min(1, "packageId is required"),
  network: z.enum(NETWORKS as [string, ...string[]]).optional(),
});

export function formatDateRange(schema: z.ZodTypeAny) {
  return schema;
}

export const reportRangeSchema = z.object({
  from: z.string().min(1, "Start date is required"),
  to: z.string().min(1, "End date is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SendOrdersInput = z.infer<typeof sendOrdersSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ---------- Send & Claim ----------
export const sendClaimSubmitSchema = z.object({
  transactionReference: z.string().trim().min(3, "Transaction reference is required").max(100),
  amount: z.coerce.number().positive("Amount must be positive"),
  network: z.enum(NETWORKS as [string, ...string[]]),
  senderPhone: z.string().trim().max(30).optional().or(z.literal("")),
});

export const sendClaimSettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  network: z.enum(NETWORKS as [string, ...string[]]).optional(),
  momoNumber: z.string().trim().min(5).max(30).optional(),
  accountName: z.string().trim().min(2).max(100).optional(),
  instructions: z.string().max(1000).optional().or(z.literal("")),
  minimumAmount: z.coerce.number().positive().optional(),
  maximumAmount: z.coerce.number().positive().optional(),
  claimExpiryHours: z.coerce.number().int().positive().optional(),
});

export const smsWebhookInputSchema = z.object({
  message: z.string().optional(),
  body: z.string().optional(),
  text: z.string().optional(),
  content: z.string().optional(),
  sms: z.string().optional(),
  from: z.string().optional(),
  sender: z.string().optional(),
  recipient: z.string().optional(),
  network: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

export const manualCreditSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  reason: z.string().trim().min(3, "Reason is required").max(300),
  reference: z.string().trim().max(100).optional().or(z.literal("")),
});

// ---------- Sign-up Codes ----------
export const signupCodeCreateSchema = z.object({
  code: z.string().trim().min(3, "Code must be at least 3 characters").max(40),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const signupCodeBulkSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(500).default(10),
  prefix: z.string().trim().max(15).default("CLICK"),
  length: z.coerce.number().int().min(4).max(16).default(8),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const signupCodeUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type SendClaimSubmitInput = z.infer<typeof sendClaimSubmitSchema>;
export type SignupCodeCreateInput = z.infer<typeof signupCodeCreateSchema>;

