"use client";

import { Input, Select, Label } from "@/components/ui/input";
import { STATUS_META } from "@/lib/types";

const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"];

export function OrdersFilterBar({
  status,
  network,
  q,
  onChange,
}: {
  status: string;
  network: string;
  q: string;
  onChange: (patch: { status?: string; network?: string; q?: string }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={status} onChange={(e) => onChange({ status: e.target.value })}>
          <option value="">All</option>
          <option value="Pending">Pending</option>
          <option value="Processing">Processing</option>
          <option value="Processed">Processed</option>
          <option value="Refund">Refund</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Network</Label>
        <Select value={network} onChange={(e) => onChange({ network: e.target.value })}>
          <option value="">All</option>
          {NETWORKS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </Select>
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label>Search phone</Label>
        <Input
          placeholder="024…"
          value={q}
          onChange={(e) => onChange({ q: e.target.value })}
        />
      </div>
    </div>
  );
}
