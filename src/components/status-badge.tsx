import { cn } from "@/lib/utils";
import { STATUS_META, DELIVERY_REPORT_STATUS_META, type OrderStatus, type DeliveryReportStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus | string;
  className?: string;
}) {
  const upper = typeof status === "string" ? status.toUpperCase() : status;
  const meta =
    STATUS_META[status as string] ||
    STATUS_META[upper as string] ||
    (typeof status === "string" ? STATUS_META[status === "COMPLETED" ? "SUCCESS" : status] : undefined);
  if (!meta) {
    return (
      <Badge variant="muted" className={className}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className={cn(meta.className, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

/** Badge for Not Received report statuses (OPEN | UNDER_REVIEW | INVESTIGATING | CONFIRM_SENT | DELIVERED | RESOLVED | REFUNDED | REJECTED). */
export function DeliveryReportStatusBadge({
  status,
  className,
}: {
  status: DeliveryReportStatus | string;
  className?: string;
}) {
  const normKey = String(status || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "_");

  const meta =
    DELIVERY_REPORT_STATUS_META[normKey as DeliveryReportStatus] ||
    (normKey === "CONFIRMED_SENT" || normKey === "CONFIRMED" || normKey === "SENT"
      ? DELIVERY_REPORT_STATUS_META.CONFIRM_SENT
      : normKey === "REFUND"
      ? DELIVERY_REPORT_STATUS_META.REFUNDED
      : undefined);

  if (!meta) {
    return (
      <Badge variant="muted" className={className}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className={cn(meta.className, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}
