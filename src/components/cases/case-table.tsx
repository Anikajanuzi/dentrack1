"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, ChevronLeft, ChevronRight, ClipboardList, Search, TriangleAlert, X } from "lucide-react";
import type { CaseListRow } from "@/lib/data/cases";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { urgencyOf } from "@/lib/dates";
import { cn, trayCode } from "@/lib/utils";

interface Opt { id: string; name?: string; full_name?: string }

export function CaseTable({
  rows, total, page, pageSize, today, dueSoonDays, options, archived, myTechnicianId,
}: {
  rows: CaseListRow[]; total: number; page: number; pageSize: number; today: string; dueSoonDays: number;
  options: { clinics: Opt[]; categories: Opt[]; technicians: Opt[] }; archived?: boolean; myTechnicianId?: string | null;
}) {
  const { fmt, t, tn } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [pending, startTransition] = React.useTransition();

  const setParam = React.useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }, [sp, pathname, router]);

  // Debounced search. Cancelled when the user opens a case, so a late URL update can't override navigation.
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if ((sp.get("q") ?? "") === q) return;
    timer.current = setTimeout(() => setParam({ q: q || null }), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, sp, setParam]);
  const cancelPendingSearch = () => { if (timer.current) clearTimeout(timer.current); };

  const anyFilter = ["q", "status", "due", "tech", "clinic", "category", "service"].some((k) => sp.get(k));
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Case, patient, clinic or tray #")} className="pl-9" aria-label={t("Search cases")} />
        </div>
        {!archived && (
          <Select aria-label={t("Status")} className="w-auto" value={sp.get("status") ?? "open"} onChange={(e) => setParam({ status: e.target.value === "open" ? null : e.target.value })}>
            <option value="open">{t("In the lab")}</option>
            <option value="active">{t("In production")}</option>
            <option value="completed">{t("Completed, not delivered")}</option>
            <option value="delivered">{t("Delivered")}</option>
            <option value="cancelled">{t("Cancelled")}</option>
            <option value="all">{t("All statuses")}</option>
          </Select>
        )}
        {!archived && (
          <Select aria-label={t("Due")} className="w-auto" value={sp.get("due") ?? ""} onChange={(e) => setParam({ due: e.target.value || null })}>
            <option value="">{t("Any due date")}</option>
            <option value="overdue">{t("Overdue")}</option>
            <option value="soon">{t("Due soon")}</option>
          </Select>
        )}
        <Select aria-label={t("Technician")} className="w-auto" value={sp.get("tech") ?? ""} onChange={(e) => setParam({ tech: e.target.value || null })}>
          <option value="">{t("All technicians")}</option>
          {myTechnicianId && <option value={myTechnicianId}>{t("My cases")}</option>}
          <option value="none">{t("Unassigned")}</option>
          {options.technicians.filter((item) => item.id !== myTechnicianId).map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
        </Select>
        <Select aria-label={t("Clinic")} className="w-auto max-w-52" value={sp.get("clinic") ?? ""} onChange={(e) => setParam({ clinic: e.target.value || null })}>
          <option value="">{t("All clinics")}</option>
          {options.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label={t("Category")} className="w-auto max-w-56" value={sp.get("category") ?? ""} onChange={(e) => setParam({ category: e.target.value || null })}>
          <option value="">{t("All prosthetics")}</option>
          {options.categories.map((c) => <option key={c.id} value={c.id}>{t(c.name)}</option>)}
        </Select>
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); startTransition(() => router.replace(pathname)); }}>
            <X /> {t("Clear")}
          </Button>
        )}
        <span className="ml-auto text-[13px] text-muted tabular" aria-live="polite">{tn(total, "{n} case", "{n} cases")}</span>
      </div>

      <div data-tour="case-list" className={cn("overflow-x-auto rounded-xl border border-line bg-surface shadow-soft transition-opacity", pending && "opacity-60")}>
        {rows.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title={anyFilter ? t("No cases match these filters") : archived ? t("The archive is empty") : t("No cases yet")}>
            {anyFilter ? t("Try a broader search.") : archived ? t("Delivered or cancelled cases appear here once archived.") : <>{t("A case is one piece of work a clinic sends you, from intake to delivery.")} <Link className="font-medium text-primary hover:underline" href="/cases/new">{t("Create the first case")}</Link></>}
          </EmptyState>
        ) : (
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-line bg-surface-2/60 text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Case")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Patient")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Prosthetic")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Clinic")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Technician")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Tray")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Stage")}</th>
                <th className="px-4 py-2.5 font-medium">{archived ? t("Archived") : t("Due")}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((c, i) => {
                  const u = urgencyOf(c.due_date, today, dueSoonDays, c.lifecycle);
                  return (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.012 }}
                      className="group border-b border-line last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="px-4 py-2.5">
                        <Link href={`/cases/${c.id}`} onClick={cancelPendingSearch} className="font-semibold text-ink outline-none group-hover:text-primary focus-visible:underline">
                          {c.reference}
                        </Link>
                        <span className="ml-2 inline-flex"><PriorityBadge priority={c.priority} /></span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">{c.patient_reference ?? <span className="text-muted">{t("Restricted")}</span>}</td>
                      <td className="px-4 py-2.5 text-ink-2"><span className="block max-w-48 truncate" title={t(c.service ?? c.category)}>{t(c.service ?? c.category)}</span></td>
                      <td className="px-4 py-2.5 text-ink-2"><span className="block max-w-40 truncate">{c.clinic}</span></td>
                      <td className="px-4 py-2.5 text-ink-2">{c.technician ?? <span className="text-warn">{t("Unassigned")}</span>}</td>
                      <td className="px-4 py-2.5 tabular text-ink-2">{c.tray_number ? trayCode(c.tray_number) : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-2.5">{c.lifecycle === "active" ? <span className="text-ink-2">{t(c.stage)}</span> : <StatusBadge status={c.lifecycle} />}</td>
                      <td className="px-4 py-2.5">
                        {archived ? <span className="text-muted">{fmt.day(c.archived_at?.slice(0, 10))}</span>
                          : u === "overdue" ? <Badge tone="danger" icon={<TriangleAlert />}>{fmt.due(c.due_date, today)}</Badge>
                          : u === "due_soon" ? <Badge tone="warn" icon={<CalendarClock />}>{fmt.due(c.due_date, today)}</Badge>
                          : <span className="text-ink-2 tabular">{fmt.day(c.due_date, "d MMM yyyy")}</span>}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-[13px] text-muted">
          {t("Page {0} of {1}", { 0: page, 1: pages })}
          <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })} aria-label={t("Previous page")}><ChevronLeft /></Button>
          <Button variant="secondary" size="icon-sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })} aria-label={t("Next page")}><ChevronRight /></Button>
        </div>
      )}
    </div>
  );
}
