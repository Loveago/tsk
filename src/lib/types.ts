export type NavigationTab =
  | "send_order"
  | "sent_orders"
  | "packages"
  | "reports"
  | "billing"
  | "api_docs";

export type UserRole = "ADMIN" | "MANAGER" | "SECRETARY" | "RESELLER" | "USER";
export type UserStatus = "ACTIVE" | "DISABLED" | "FROZEN" | "PENDING_PAYMENT";

export type NetworkProvider = "MTN" | "TELECEL" | "AIRTELTIGO" | "AIRTELTIGO_BIGTIME";

export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

/** Display alias — COMPLETED is stored as SUCCESS in the database. */
export type OrderStatusOrCompleted = OrderStatus | "COMPLETED";

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "PROCESSING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

export const NETWORKS: NetworkProvider[] = ["MTN", "TELECEL", "AIRTELTIGO", "AIRTELTIGO_BIGTIME"];

export const ROLES: UserRole[] = ["ADMIN", "MANAGER", "SECRETARY", "RESELLER", "USER"];

export type BatchStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export const BATCH_STATUSES: BatchStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

/** Export batches never sit in PENDING — they start at PROCESSING when the file is generated. */
export type ExportBatchStatus = Exclude<BatchStatus, "PENDING">;

export const EXPORT_BATCH_STATUSES: ExportBatchStatus[] = [
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export type DeliveryReportStatus = "OPEN" | "UNDER_REVIEW" | "INVESTIGATING" | "DELIVERED" | "RESOLVED" | "REFUNDED" | "CONFIRM_SENT" | "REJECTED";

export const DELIVERY_REPORT_STATUSES: DeliveryReportStatus[] = [
  "OPEN",
  "UNDER_REVIEW",
  "INVESTIGATING",
  "DELIVERED",
  "RESOLVED",
  "REFUNDED",
  "CONFIRM_SENT",
  "REJECTED",
];

/** Report statuses that block a new "Not Received" report for the same order (§7). */
export const ACTIVE_DELIVERY_REPORT_STATUSES: DeliveryReportStatus[] = ["OPEN", "UNDER_REVIEW", "INVESTIGATING", "DELIVERED"];

/** The 24-hour "Not Received" reporting window (§3). */
export const REPORT_WINDOW_HOURS = 24;

export function reportWindowEnd(completedAt: Date | string, windowHours: number = REPORT_WINDOW_HOURS): Date {
  const completed = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  return new Date(completed.getTime() + windowHours * 60 * 60 * 1000);
}

export function isWithinReportWindow(
  completedAt: Date | string | null | undefined,
  now: Date = new Date(),
  windowHours: number = REPORT_WINDOW_HOURS
): boolean {
  if (!completedAt) return false;
  const completed = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  return now.getTime() >= completed.getTime() && now.getTime() <= reportWindowEnd(completed, windowHours).getTime();
}

/** Human readable remaining window, e.g. "23h 41m" (§6). */
export function formatWindowRemaining(endsAt: Date | string, now: Date = new Date()): string {
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

/** Delivery report display code, e.g. NR-00184 (§14). */
export function deliveryReportCode(seq: number | null | undefined): string {
  return `NR-${String(seq ?? 0).padStart(5, "0")}`;
}

/** Allowed order status transitions (§16). `true` = allowed without override, "OVERRIDE" = admin override required. */
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, true | "OVERRIDE">>> = {
  PENDING: { PROCESSING: true, SUCCESS: "OVERRIDE", FAILED: true, CANCELLED: true },
  PROCESSING: { SUCCESS: true, PENDING: "OVERRIDE", FAILED: true, CANCELLED: true },
  SUCCESS: { REFUNDED: "OVERRIDE", FAILED: "OVERRIDE" },
  FAILED: { PROCESSING: true, PENDING: true, SUCCESS: "OVERRIDE", REFUNDED: "OVERRIDE" },
  CANCELLED: { REFUNDED: "OVERRIDE", SUCCESS: "OVERRIDE" },
  REFUNDED: {},
};

/** Normalize a status coming from the UI/API — COMPLETED/PROCESSED is stored as SUCCESS, REFUND as REFUNDED. */
export function normalizeOrderStatus(status: string): OrderStatus {
  const upper = (status || "").toUpperCase().trim();
  if (upper === "COMPLETED" || upper === "PROCESSED" || upper === "SUCCESS") return "SUCCESS";
  if (upper === "REFUND" || upper === "REFUNDED") return "REFUNDED";
  if (upper === "PENDING") return "PENDING";
  if (upper === "PROCESSING") return "PROCESSING";
  if (upper === "FAILED") return "FAILED";
  if (upper === "CANCELLED" || upper === "CANCELED") return "CANCELLED";
  return status as OrderStatus;
}

export function canTransition(from: string, to: string): { allowed: boolean; override: boolean } {
  const map = ALLOWED_ORDER_TRANSITIONS[normalizeOrderStatus(from)];
  if (!map) return { allowed: false, override: false };
  const entry = map[normalizeOrderStatus(to)];
  if (entry === true) return { allowed: true, override: false };
  if (entry === "OVERRIDE") return { allowed: true, override: true };
  return { allowed: false, override: false };
}

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["SUCCESS", "FAILED", "CANCELLED", "REFUNDED"];

export interface DataPackage {
  id: string;
  network: NetworkProvider;
  gbAmount: number;
  label: string;
  priceGHS: number;
  pricePerAllocation: string;
  active: boolean;
}

export interface OrderRecord {
  id: string;
  code: string;
  userId: string;
  phoneNumber: string;
  network: NetworkProvider;
  packageId: string | null;
  gbAmount: number;
  amount: number;
  status: OrderStatus;
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  balance: number;
  pricingProfileId: string | null;
}

export const STATUS_META: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  AWAITING_PAYMENT: {
    label: "Awaiting Payment",
    className: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dot: "bg-slate-400",
  },
  PENDING: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  Pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  PROCESSING: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  Processing: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  SUCCESS: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  COMPLETED: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  PROCESSED: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  Processed: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dot: "bg-red-500",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
    dot: "bg-slate-400",
  },
  REFUNDED: {
    label: "Refund",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
  REFUND: {
    label: "Refund",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
  Refund: {
    label: "Refund",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
};

export function formatGHS(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
}

/**
 * Sanitizes provider-originated failure reasons or administrative responses so customers
 * never see wholesale provider cost prices (e.g. Clickyfied's "Refunded GHS 18.75")
 * or provider names. Instead, it displays the price configured on our website
 * (e.g. "Refunded GHS 25.00" based on order.amount).
 */
export function sanitizeCustomerRefundNote(
  note: string | null | undefined,
  orderAmount?: number | null
): string | null {
  if (!note) return null;
  let text = note.trim();
  if (!text) return null;

  const websitePriceStr =
    typeof orderAmount === "number" && !isNaN(orderAmount) && orderAmount > 0
      ? `GHS ${orderAmount.toFixed(2)}`
      : null;

  const isRefund = /refund/i.test(text);

  if (isRefund) {
    if (websitePriceStr) {
      // 1. Replace explicit refund price patterns like "Refunded GHS 18.75 on Clickyfied", "Refunded GH₵ 18.75", "Refunded 18.75", "Refunded 5 GB"
      text = text.replace(
        /refund(?:ed)?(?:\s+(?:on|by)\s+[a-z0-9_-]+(?:\s*provider)?)?\s*[:\-–]?\s*(?:(?:ghs|gh₵)\s*)?[0-9]+(?:\.[0-9]+)?(?:\s*gb)?/gi,
        `Refunded ${websitePriceStr}`
      );
      // 2. Also handle phrases like "Refunded by Clickyfied provider", "Refunded on Clickyfied", "Order failed on Clickyfied and was refunded"
      text = text.replace(
        /refund(?:ed)?\s+(?:on|by)\s+[a-z0-9_-]+(?:\s*provider)?/gi,
        `Refunded ${websitePriceStr}`
      );
      if (/order failed (?:on|by) [a-z0-9_-]+ and was refunded/i.test(text)) {
        text = text.replace(/order failed (?:on|by) [a-z0-9_-]+ and was refunded/gi, `Refunded ${websitePriceStr}`);
      }
    } else {
      // If amount is not known, ensure wholesale numbers are masked
      text = text.replace(
        /refund(?:ed)?(?:\s+(?:on|by)\s+[a-z0-9_-]+(?:\s*provider)?)?\s*[:\-–]?\s*(?:(?:ghs|gh₵)\s*)?[0-9]+(?:\.[0-9]+)?(?:\s*gb)?/gi,
        "Refunded"
      );
    }
  }

  return sanitizeCustomerFacingText(text) || (websitePriceStr ? `Refunded ${websitePriceStr}` : "Refunded");
}

/**
 * Sanitizes any text intended for user/customer display (status notes, history logs,
 * timeline events, error reasons, dialog labels) to strip all internal API provider
 * names (Clickyfied, Clickify, Bigwindata, Bigwin) and internal IDs.
 */
export function sanitizeCustomerFacingText(text: string | null | undefined): string | null {
  if (!text) return null;
  let s = String(text).trim();
  if (!s) return null;

  // Mask internal batch codes / provider report IDs in notes
  s = s.replace(/\[PROVIDER_REPORT_ID:[^\]]+\]/gi, "");
  s = s.replace(/\[?CLICKYFIED_REPORT_ID:[^\]]+\]?/gi, "");
  s = s.replace(/CLICKYFIED:[a-z0-9_-]+(?::[a-z0-9_-]+)?/gi, "");

  // Convert common provider failure/status phrases into clean customer language
  s = s.replace(/order marked as failed by [a-z0-9_-]+(?:\s*provider)?/gi, "Order delivery failed");
  s = s.replace(/marked as failed by [a-z0-9_-]+(?:\s*provider)?/gi, "Delivery failed");
  s = s.replace(/failed (?:on|by) [a-z0-9_-]+(?:\s*provider)?/gi, "Failed to deliver");
  s = s.replace(/dispatched via [a-z0-9_-]+ api/gi, "Dispatched for automated delivery");
  s = s.replace(/dispatched to [a-z0-9_-]+/gi, "Dispatched for delivery");
  s = s.replace(/updated via [a-z0-9_-]+ callback/gi, "Updated delivery status");
  s = s.replace(/synced with [a-z0-9_-]+/gi, "Delivery status synced");
  s = s.replace(/submitted in [a-z0-9_-]+(?: mtn)? batch/gi, "Submitted in automated batch");
  s = s.replace(/[a-z0-9_-]+ batch attempt \([^)]+\) failed/gi, "Batch delivery attempt failed");
  s = s.replace(/[a-z0-9_-]+ dispatch failed/gi, "Delivery processing failed");
  s = s.replace(/[a-z0-9_-]+ request timed out[^.]*/gi, "Delivery processing timed out");
  s = s.replace(/[a-z0-9_-]+ (?:http|api|request)[^:]*:\s*/gi, "Delivery processing error: ");
  s = s.replace(/delivery proof image received from [a-z0-9_-]+/gi, "Delivery proof image received");
  s = s.replace(/order confirmed sent\/resolved by [a-z0-9_-]+(?:\s*provider)?/gi, "Order confirmed delivered");
  s = s.replace(/issue resolved by [a-z0-9_-]+(?:\s*provider)?/gi, "Issue resolved");
  s = s.replace(/[a-z0-9_-]+ report update:\s*/gi, "Report update: ");

  // Strip provider names explicitly
  s = s
    .replace(/on clickyfied/gi, "")
    .replace(/by clickyfied callback/gi, "")
    .replace(/by clickyfied provider/gi, "")
    .replace(/clickyfied callback/gi, "System Sync")
    .replace(/clickyfied api/gi, "System")
    .replace(/clickyfied provider/gi, "network provider")
    .replace(/clickyfied/gi, "")
    .replace(/clickify/gi, "")
    .replace(/bigwindata/gi, "")
    .replace(/bigwin/gi, "");

  // Clean up any double spaces, trailing colons or dashes
  s = s
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[:\-–\s]+/, "")
    .replace(/[:\-–\s]+$/, "")
    .trim();

  if (!s || s === ":" || s === "-" || s === "–") {
    return null;
  }

  return s;
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function gbLabel(gb: number): string {
  return Number.isInteger(gb) ? `${gb} GB` : `${gb} GB`;
}

export const NETWORK_META: Record<NetworkProvider, { label: string; className: string; dot: string }> = {
  MTN: {
    label: "MTN",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-400",
  },
  TELECEL: {
    label: "Telecel",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dot: "bg-red-500",
  },
  AIRTELTIGO: {
    label: "AT iShare",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  AIRTELTIGO_BIGTIME: {
    label: "AT Big Time",
    className: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20",
    dot: "bg-cyan-500",
  },
};

export const BATCH_STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  Pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  PROCESSING: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  Processing: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  COMPLETED: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  SUCCESS: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  PROCESSED: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  Processed: {
    label: "Processed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dot: "bg-red-500",
  },
  CANCELLED: {
    label: "Refund",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
  REFUNDED: {
    label: "Refund",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
  REFUND: {
    label: "Refund",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
  Refund: {
    label: "Refund",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
};

export const DELIVERY_REPORT_STATUS_META: Record<DeliveryReportStatus, { label: string; className: string; dot: string }> = {
  OPEN: {
    label: "UNDER REVIEW",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  UNDER_REVIEW: {
    label: "UNDER REVIEW",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  INVESTIGATING: {
    label: "INVESTIGATING",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  DELIVERED: {
    label: "CONFIRM SENT",
    className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
    dot: "bg-sky-500",
  },
  CONFIRM_SENT: {
    label: "CONFIRM SENT",
    className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
    dot: "bg-sky-500",
  },
  RESOLVED: {
    label: "RESOLVED",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  REFUNDED: {
    label: "REFUNDED",
    className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
    dot: "bg-purple-500",
  },
  REJECTED: {
    label: "REJECTED",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dot: "bg-red-500",
  },
};

/** Batch action → which individual order statuses it applies to (§5/§13 eligible recipients). */
export const BATCH_ACTION_ELIGIBLE: Record<string, OrderStatus[]> = {
  PENDING: ["PROCESSING", "FAILED", "CANCELLED", "SUCCESS", "REFUNDED"],
  MARK_PENDING: ["PROCESSING", "FAILED", "CANCELLED", "SUCCESS", "REFUNDED"],
  Pending: ["PROCESSING", "FAILED", "CANCELLED", "SUCCESS", "REFUNDED"],

  PROCESSING: ["PENDING", "FAILED", "CANCELLED", "SUCCESS", "REFUNDED"],
  MARK_PROCESSING: ["PENDING", "FAILED", "CANCELLED", "SUCCESS", "REFUNDED"],
  Processing: ["PENDING", "FAILED", "CANCELLED", "SUCCESS", "REFUNDED"],

  PROCESSED: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"],
  MARK_PROCESSED: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"],
  MARK_COMPLETED: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"],
  COMPLETED: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"],
  Processed: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"],

  MARK_FAILED: ["PENDING", "PROCESSING"],
  CANCEL: ["PENDING", "PROCESSING", "FAILED", "SUCCESS"],

  REFUND: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED"],
  MARK_REFUND: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED"],
  REFUNDED: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED"],
  Refund: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED"],
};
