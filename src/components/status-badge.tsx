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

/** Badge for Not Received report statuses (OPEN | INVESTIGATING | DELIVERED | RESOLVED | REJECTED). */
export function DeliveryReportStatusBadge({
  status,
  className,
}: {
  status: DeliveryReportStatus | string;
  className?: string;
}) {
  const meta = DELIVERY_REPORT_STATUS_META[status as DeliveryReportStatus];
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
