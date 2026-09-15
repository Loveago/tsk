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
export {
  normalizeGhanaPhoneNumber,
  normalizeGhanaPhone,
} from "./phone-utils";

import {
  GHANA_PHONE_REGEX as ghanaPhoneRegex,
  MTN_PHONE_REGEX as mtnPhoneRegex,
  normalizeGhanaPhoneNumber,
} from "./phone-utils";

export const phoneSchema = z.preprocess(
  (val) =>
    typeof val === "string" || typeof val === "number"
      ? normalizeGhanaPhoneNumber(String(val).trim())
      : val,
  z
    .string()
    .trim()
    .regex(
      ghanaPhoneRegex,
      "Enter a valid Ghanaian number e.g. 0241234567"
    )
);

export const mtnPhoneSchema = z.preprocess(
  (val) =>
    typeof val === "string" || typeof val === "number"
      ? normalizeGhanaPhoneNumber(String(val).trim())
      : val,
  z
    .string()
    .trim()
    .regex(
      mtnPhoneRegex,
      "Enter a valid Ghanaian MTN number e.g. 0241234567"
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
  /** Status to move exported orders into. Defaults to PROCESSING when omitted. */
  targetStatus: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
  /** Exact volume filter in MB (overrides min/max when set). */
  volumeExactMb: z.coerce.number().positive().optional(),
  /** Minimum volume filter in MB (inclusive). */
  volumeMinMb: z.coerce.number().positive().optional(),
  /** Maximum volume filter in MB (inclusive). */
  volumeMaxMb: z.coerce.number().positive().optional(),
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
    // New statuses
    "MARK_UNDER_REVIEW",
    "RESOLVE_REFUNDED",
    "RESOLVE_CONFIRM_SENT",
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
  status: z.enum(["ACTIVE", "DISABLED", "FROZEN"]),
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
    .default([]),
  networkTiers: z
    .record(
      z.string(),
      z.array(
        z.object({
          gbAmount: z.coerce.number().positive(),
          priceGHS: z.coerce.number().min(0),
        })
      )
    )
    .optional(),
});

export const packageSchema = z.object({
  network: z.string().min(2).max(40).transform((s) => s.trim().toUpperCase()),
  name: z.string().min(2).max(80),
  gbAmount: z.coerce.number().positive(),
  description: z.string().max(300).optional().or(z.literal("")),
  providerProductId: z.string().max(80).optional().or(z.literal("")),
  retailPriceGHS: z
    .preprocess(
      (val) => (val === "" || val === null || val === undefined ? null : Number(val)),
      z.number().min(0).nullable()
    )
    .optional(),
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
  number_submission_page_enabled: z.enum(["true", "false"]).optional(),
  mtn_single_order_per_day_enabled: z.enum(["true", "false"]).optional(),
  default_register_role: z.enum(["USER", "RESELLER"]).optional(),
  allow_user_registration: z.enum(["true", "false"]).optional(),
  support_whatsapp: z.string().max(40).optional(),
  site_name: z.string().max(80).optional(),
  site_announcement: z.string().max(300).optional(),
  default_momo_number: z.string().max(40).optional(),
  contact_email: z.string().max(80).optional(),
  mtn_number_verification_enabled: z.enum(["true", "false"]).optional(),
  mtn_verification_instructions: z.string().max(2000).optional(),
  storefront_feature_enabled: z.enum(["true", "false"]).optional(),
  storefront_apply_enabled: z.enum(["true", "false"]).optional(),
  storefront_min_markup: z.string().max(20).optional(),
  storefront_max_markup: z.string().max(20).optional(),
  storefront_min_withdrawal: z.string().max(20).optional(),
  max_orders_per_submission: z.string().max(10).optional(),
  paystack_topup_enabled: z.enum(["true", "false"]).optional(),
  paystack_min_topup: z.string().max(20).optional(),
  paystack_max_topup: z.string().max(20).optional(),
  paystack_secret_key: z.string().max(255).optional(),
  api_feature_enabled: z.enum(["true", "false"]).optional(),

  // Brevo & Email
  brevo_api_key: z.string().max(255).optional(),
  brevo_sender_email: z.string().max(120).optional(),
  brevo_sender_name: z.string().max(100).optional(),
  login_otp_enabled: z.enum(["true", "false"]).optional(),
  
  // Send Claim / MoMo
  send_claim_enabled: z.enum(["true", "false"]).optional(),
  send_claim_expiry_hours: z.string().max(10).optional(),
  send_claim_min_amount: z.string().max(20).optional(),
  send_claim_max_amount: z.string().max(20).optional(),
  send_claim_max_active_per_user: z.string().max(10).optional(),
  
  // Security
  max_login_attempts: z.string().max(10).optional(),
  login_lockout_minutes: z.string().max(10).optional(),
  password_reset_expiry_minutes: z.string().max(10).optional(),
  api_rate_limit_per_minute: z.string().max(10).optional(),
  
  // Maintenance Mode
  maintenance_mode_enabled: z.enum(["true", "false"]).optional(),
  
  // Notifications & Contact
  support_phone: z.string().max(40).optional(),
  support_telegram: z.string().max(100).optional(),
  support_email: z.string().max(80).optional(),
  footer_text: z.string().max(500).optional(),
  
  // Pricing & Packages
  show_package_prices_to_users: z.enum(["true", "false"]).optional(),
  low_balance_warning_threshold: z.string().max(20).optional(),
  allow_zero_price_orders: z.enum(["true", "false"]).optional(),
  
  // Wallet & Withdrawals
  storefront_max_withdrawal: z.string().max(20).optional(),
  storefront_withdrawal_fee_percent: z.string().max(10).optional(),
  storefront_withdrawal_enabled: z.enum(["true", "false"]).optional(),
  storefront_auto_approve_withdrawal: z.enum(["true", "false"]).optional(),
  
  // Reports
  reports_enabled: z.enum(["true", "false"]).optional(),
  reports_max_date_range_days: z.string().max(10).optional(),
  report_auto_close_days: z.string().max(10).optional(),
  report_not_received_window_hours: z.string().max(10).optional(),

  // Secretary Role & Page Permissions
  secretary_login_without_otp: z.enum(["true", "false"]).optional(),
  secretary_allowed_pages: z.string().max(2000).optional(),

  // Global Announcement & Dynamic Categories
  announcement_templates: z.string().max(10000).optional(),
  custom_package_categories: z.string().max(5000).optional(),

  // Provider APIs & Network Routing
  provider_routing_enabled: z.enum(["true", "false"]).optional(),
  provider_routing_default: z.string().max(50).optional(),
  provider_routing_auto_dispatch: z.enum(["true", "false"]).optional(),
  provider_route_MTN: z.string().max(50).optional(),
  provider_route_MTN_XPRESS: z.string().max(50).optional(),
  provider_route_TELECEL: z.string().max(50).optional(),
  provider_route_AIRTELTIGO: z.string().max(50).optional(),
  provider_route_AIRTELTIGO_ISHARE: z.string().max(50).optional(),
  provider_route_AIRTELTIGO_BIGTIME: z.string().max(50).optional(),

  // Bigwindata Settings
  bigwindata_enabled: z.enum(["true", "false"]).optional(),
  bigwindata_api_key: z.string().max(255).optional(),
  bigwindata_base_url: z.string().max(255).optional(),
  bigwindata_webhook_secret: z.string().max(255).optional(),

  // Clickyfied Settings
  clickyfied_enabled: z.enum(["true", "false"]).optional(),
  clickyfied_api_key: z.string().max(255).optional(),
  clickyfied_base_url: z.string().max(255).optional(),
  clickyfied_client_id: z.string().max(255).optional(),
  clickyfied_callback_signing_secret: z.string().max(255).optional(),
  clickyfied_mtn_verification_enabled: z.enum(["true", "false"]).optional(),
  clickyfied_not_received_enabled: z.enum(["true", "false"]).optional(),
  app_base_url: z.string().max(255).optional(),
}).passthrough();

export const pricingProfileUpdateSchema = pricingProfileSchema;

// ---------- Storefront ----------
export const storefrontSettingsSchema = z.object({
  storeName: z.string().min(2).max(60),
  description: z.string().max(600).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  whatsappGroupLink: z.string().max(255).optional().or(z.literal("")),
  supportPhone: z.string().max(40).optional().or(z.literal("")),
  contactText: z.string().max(160).optional().or(z.literal("")),
  whatsappLabel: z.string().max(40).optional().or(z.literal("")),
});

/** User-side store application: store name, contact number, and WhatsApp group link are mandatory. */
export const storefrontApplySchema = z.object({
  storeName: z.string().trim().min(2, "Store name is required").max(60),
  contactNumber: z.string().trim().min(9, "Valid contact number is required").max(20),
  whatsappGroupLink: z
    .string()
    .trim()
    .min(5, "WhatsApp group link is required")
    .max(255),
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

// ---------- MTN Number Verification ----------
export const mtnVerificationSubmitSchema = z.object({
  phoneNumber: mtnPhoneSchema,
});

export const mtnBatchCreateSchema = z.object({
  requestIds: z.array(z.string().min(1)).min(1, "Select at least one request to create a batch"),
});

export const mtnBatchVerifySchema = z.object({
  mode: z.enum(["ALL", "SELECTED", "REJECT"]),
  verifiedNumberIds: z.array(z.string()).optional(),
  rejectionReason: z.string().max(300).optional().or(z.literal("")),
});

export const mtnAcceptedAddSchema = z.object({
  phoneNumber: mtnPhoneSchema,
});

export const mtnAcceptedBulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one record to delete"),
});

export const mtnImportConfirmSchema = z.object({
  sessionId: z.string().optional(),
  numbers: z.array(z.string().min(9)).optional(),
  source: z.string().min(1).default("IMPORT_TXT"),
  batchReference: z.string().optional(),
}).refine((data) => Boolean(data.sessionId) || (Array.isArray(data.numbers) && data.numbers.length > 0), {
  message: "Either a valid import sessionId or numbers array is required",
});


// ---------- Login OTP ----------
export const verifyOtpSchema = z.object({
  ticket: z.string().min(1, "OTP ticket is required"),
  code: z.string().min(6, "Code must be 6 digits").max(6, "Code must be 6 digits"),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({
  ticket: z.string().min(1, "OTP ticket is required"),
});
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

