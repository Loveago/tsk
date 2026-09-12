"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function ExportButtons({
  type,
  params = "",
}: {
  type: "orders" | "users" | "transactions";
  params?: string;
}) {
  const go = (format: string) => {
    window.open(`/api/admin/export?type=${type}&format=${format}${params ? `&${params}` : ""}`, "_blank");
  };
  return (
    <div className="flex items-center gap-1.5">
      <Download className="h-4 w-4 text-slate-400" />
      <Button size="sm" variant="outline" onClick={() => go("csv")}>CSV</Button>
      <Button size="sm" variant="outline" onClick={() => go("xlsx")}>Excel</Button>
      <Button size="sm" variant="outline" onClick={() => go("pdf")}>PDF</Button>
    </div>
  );
}
