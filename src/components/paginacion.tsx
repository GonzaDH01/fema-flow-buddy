import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Paginación en memoria para listados largos. */
export function usePaginacion<T>(items: T[], pageSize = 50) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize),
    [items, page, pageSize, totalPages],
  );

  return { page: Math.min(page, totalPages), setPage, pageItems, total, totalPages, pageSize };
}

export function Paginacion({
  page, totalPages, total, pageSize, onPage, label = "registros",
}: {
  page: number; totalPages: number; total: number; pageSize: number;
  onPage: (p: number) => void; label?: string;
}) {
  if (total <= pageSize) return null;
  const desde = (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
      <span>
        {desde}–{hasta} de {total} {label}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="px-2 tabular-nums">{page} / {totalPages}</span>
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}