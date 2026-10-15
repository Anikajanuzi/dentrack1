"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "./input";
import { EmptyState } from "./misc";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sort?: (row: T) => string | number | null;
  align?: "left" | "right";
  className?: string;
}

/** Client-side searchable, sortable table for directory-sized lists. */
export function DataTable<T extends { id: string }>({
  rows, columns, search, searchPlaceholder = "Search", empty, initialSort, onRowClick, toolbar, minWidth = 640,
}: {
  rows: T[];
  columns: Column<T>[];
  search?: (row: T) => string;
  searchPlaceholder?: string;
  empty: { title: string; body?: React.ReactNode; icon?: React.ReactNode };
  initialSort?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  minWidth?: number;
}) {
  const { t } = useI18n();
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState(initialSort ?? null);
  const filtered = React.useMemo(() => {
    let list = rows;
    if (q.trim() && search) {
      const needle = q.trim().toLowerCase();
      list = list.filter((r) => search(r).toLowerCase().includes(needle));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sort) {
        list = [...list].sort((a, b) => {
          const va = col.sort!(a), vb = col.sort!(b);
          if (va === vb) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [rows, q, search, sort, columns]);

  return (
    <div className="flex flex-col gap-3">
      {(search || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(searchPlaceholder)} className="pl-9" aria-label={t(searchPlaceholder)} />
            </div>
          )}
          {toolbar}
          <span className="ml-auto text-[13px] text-muted tabular" aria-live="polite">{t("{a} of {b}", { a: filtered.length, b: rows.length })}</span>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-soft">
        {filtered.length === 0 ? (
          <EmptyState icon={empty.icon} title={q ? "No matches" : empty.title}>{q ? t("Try a different search.") : typeof empty.body === "string" ? t(empty.body) : empty.body}</EmptyState>
        ) : (
          <table className="w-full text-left text-[13px]" style={{ minWidth }}>
            <thead className="border-b border-line bg-surface-2/60 text-xs text-muted">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cn("px-4 py-2.5 font-medium", c.align === "right" && "text-right")} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sort ? (
                      <button
                        className={cn("inline-flex items-center gap-1 hover:text-ink", sort?.key === c.key && "text-ink")}
                        onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }))}
                      >
                        {t(c.header)}
                        {sort?.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-50" />}
                      </button>
                    ) : t(c.header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((r) => (
                  <motion.tr
                    key={r.id}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn("border-b border-line last:border-0", onRowClick && "cursor-pointer hover:bg-surface-2/60")}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-4 py-2.5 align-middle", c.align === "right" && "text-right tabular", c.className)}>{c.render(r)}</td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
