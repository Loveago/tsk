export type NavigationTab =
  | "send_order"
  | "sent_orders"
  | "packages"
  | "reports"
  | "billing"
  | "api_docs";

export type UserRole = "ADMIN" | "MANAGER" | "SECRETARY" | "RESELLER" | "USER";
export type UserStatus = "ACTIVE" | "DISABLED" | "FROZEN";

export type NetworkProvider = "MTN" | "TELECEL" | "AIRTELTIGO";

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

export const NETWORKS: NetworkProvider[] = ["MTN", "TELECEL", "AIRTELTIGO"];

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
  SUCCESS: { REFUNDED: "OVERRIDE" },
  FAILED: { PROCESSING: true, PENDING: true, SUCCESS: "OVERRIDE", REFUNDED: "OVERRIDE" },
  CANCELLED: { REFUNDED: "OVERRIDE", SUCCESS: "OVERRIDE" },
  REFUNDED: {},
};

/** Normalize a status coming from the UI/API — COMPLETED is stored as SUCCESS. */
export function normalizeOrderStatus(status: string): OrderStatus {
  return (status === "COMPLETED" ? "SUCCESS" : status) as OrderStatus;
}

export function canTransition(from: string, to: string): { allowed: boolean; override: boolean } {
  const map = ALLOWED_ORDER_TRANSITIONS[from as OrderStatus];
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
    label: "AWAITING PAYMENT",
    className: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dot: "bg-slate-400",
  },
  PENDING: {
    label: "PENDING",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  PROCESSING: {
    label: "PROCESSING",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  SUCCESS: {
    label: "COMPLETED",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  COMPLETED: {
    label: "COMPLETED",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  FAILED: {
    label: "FAILED",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dot: "bg-red-500",
  },
  CANCELLED: {
    label: "CANCELLED",
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
    dot: "bg-slate-400",
  },
  REFUNDED: {
    label: "REFUNDED",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
};

export function formatGHS(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
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
    label: "AirtelTigo",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
};

export const BATCH_STATUS_META: Record<BatchStatus, { label: string; className: string; dot: string }> = {
  PENDING: {
    label: "PENDING",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  PROCESSING: {
    label: "PROCESSING",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  COMPLETED: {
    label: "COMPLETED",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  FAILED: {
    label: "FAILED",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dot: "bg-red-500",
  },
  CANCELLED: {
    label: "CANCELLED",
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
    dot: "bg-slate-400",
  },
};

export const DELIVERY_REPORT_STATUS_META: Record<DeliveryReportStatus, { label: string; className: string; dot: string }> = {
  OPEN: {
    label: "OPEN",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  UNDER_REVIEW: {
    label: "UNDER REVIEW",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dot: "bg-violet-500",
  },
  INVESTIGATING: {
    label: "INVESTIGATING",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  DELIVERED: {
    label: "DELIVERED",
    className: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20",
    dot: "bg-teal-500",
  },
  RESOLVED: {
    label: "RESOLVED",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  REFUNDED: {
    label: "REFUNDED",
    className: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20",
    dot: "bg-cyan-500",
  },
  CONFIRM_SENT: {
    label: "CONFIRM SENT",
    className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20",
    dot: "bg-green-500",
  },
  REJECTED: {
    label: "REJECTED",
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dot: "bg-red-500",
  },
};

/** Batch action → which individual order statuses it applies to (§5/§13 eligible recipients). */
export const BATCH_ACTION_ELIGIBLE: Record<string, OrderStatus[]> = {
  MARK_PROCESSING: ["PENDING"],
  MARK_COMPLETED: ["PENDING", "PROCESSING"],
  MARK_FAILED: ["PENDING", "PROCESSING"],
  CANCEL: ["PENDING"],
};
