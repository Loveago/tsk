import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pages,
  total,
  onPage,
  pageSize,
  pageSizeOptions = [15, 25, 50, 100],
  onPageSizeChange,
}: {
  page: number;
  pages: number;
  total?: number;
  onPage: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}) {
  if (pages <= 0 && (!total || total === 0)) return null;
  if (pages <= 1 && !onPageSizeChange && (total === undefined || total === 0)) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-3 text-slate-500">
        <span>
          Page {page} of {Math.max(1, pages)}
          {typeof total === "number" ? ` · ${total} total` : ""}
        </span>
        {onPageSizeChange && pageSize && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1526] dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt} className="dark:bg-[#0d1526]">
                  {opt} / page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}