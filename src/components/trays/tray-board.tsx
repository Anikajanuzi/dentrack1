"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "@/lib/toast";
import {
  ArrowDownUp, ArrowRightLeft, Ban, CalendarClock, ExternalLink, History, LayoutGrid, List, PackageOpen,
  Plus, Power, Search, Tag, User, X,
} from "lucide-react";
import { TrayVisual, type TrayState } from "./tray-visual";
import type { PlaceableCase, TrayRow } from "@/lib/data/trays";
import {
  addTraysAction, assignTrayAction, moveCaseAction, releaseTrayAction, setTrayActiveAction, trayHistoryAction, updateTrayLabelAction,
} from "@/lib/actions/trays";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, Sheet } from "@/components/ui/dialog";
import { Badge, PriorityBadge, StatusBadge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/misc";
import { cn, trayCode } from "@/lib/utils";
import { urgencyOf, type Urgency } from "@/lib/dates";

type StatusFilter = "all" | "available" | "occupied" | "inactive";
type DueFilter = "any" | "overdue" | "due_soon" | "week";

interface Props {
  today: string;
  dueSoonDays: number;
  trays: TrayRow[];
  placeable: PlaceableCase[];
  technicians: { id: string; full_name: string }[];
  isAdmin: boolean;
  myTechnicianId: string | null;
}

const stateOf = (item: TrayRow): TrayState => (!item.is_active ? "inactive" : item.case_id ? "occupied" : "available");
const urgencyRank: Record<string, number> = { overdue: 0, due_soon: 1, ok: 2, done: 3 };

export function TrayBoard(props: Props) {
  const { t, fmt } = useI18n();
  const { trays, today, dueSoonDays, isAdmin } = props;
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = React.useState(params.get("q") ?? "");
  const [status, setStatus] = React.useState<StatusFilter>((params.get("status") as StatusFilter) ?? "all");
  const [tech, setTech] = React.useState(params.get("tech") ?? "");
  const [due, setDue] = React.useState<DueFilter>("any");
  const [sort, setSort] = React.useState<"number" | "urgency">("number");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = React.useState<string | null>(params.get("tray"));
  const [dialog, setDialog] = React.useState<null | "assign" | "release" | "move" | "add">(null);

  React.useEffect(() => {
    try {
      const v = localStorage.getItem("dt-tray-view");
      if (v === "grid" || v === "list") setView(v);
    } catch {}
  }, []);
  const changeView = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem("dt-tray-view", v);
    } catch {}
  };

  const selected = trays.find((item) => item.tray_id === selectedId) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const qNum = /^\d+$/.test(q) ? Number(q) : null;
    let list = trays.filter((item) => {
      const s = stateOf(item);
      if (status !== "all" && s !== status) return false;
      if (tech && item.technician_id !== tech) return false;
      if (due !== "any") {
        if (!item.due_date || item.lifecycle !== "active") return false;
        const u = urgencyOf(item.due_date, today, dueSoonDays, item.lifecycle);
        if (due === "overdue" && u !== "overdue") return false;
        if (due === "due_soon" && u !== "due_soon") return false;
        if (due === "week" && !(u === "overdue" || u === "due_soon" || (new Date(item.due_date) <= new Date(new Date(today).getTime() + 7 * 864e5)))) return false;
      }
      if (!q) return true;
      if (qNum !== null && item.number === qNum) return true;
      return [item.case_reference, item.patient_reference, item.label, item.clinic_name, item.technician_name]
        .some((v) => v?.toLowerCase().includes(q));
    });
    if (sort === "urgency") {
      list = [...list].sort((a, b) => {
        const ua = a.case_id ? urgencyRank[urgencyOf(a.due_date, today, dueSoonDays, a.lifecycle) ?? "done"] : 9;
        const ub = b.case_id ? urgencyRank[urgencyOf(b.due_date, today, dueSoonDays, b.lifecycle) ?? "done"] : 9;
        return ua - ub || (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.number - b.number;
      });
    }
    return list;
  }, [trays, query, status, tech, due, sort, today, dueSoonDays]);

  const counts = React.useMemo(() => {
    const active = trays.filter((item) => item.is_active);
    const occupied = active.filter((item) => item.case_id).length;
    return {
      active: active.length,
      occupied,
      available: active.length - occupied,
      inactive: trays.length - active.length,
      awaitingRelease: active.filter((item) => item.case_id && item.lifecycle !== "active").length,
    };
  }, [trays]);
  const occupancy = counts.active ? Math.round((counts.occupied / counts.active) * 1000) / 10 : 0;
  const filtersActive = query || status !== "all" || tech || due !== "any";

  return (
    <div className="flex flex-col gap-5">
      {/* Occupancy strip */}
      <div data-tour="tray-board" className="grid gap-4 rounded-xl border border-line bg-surface p-4 shadow-soft md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="text-[13px] text-muted">
              <span className="type-stat mr-1.5 text-ink">{counts.occupied}</span>{t("of {0} active trays occupied", { 0: counts.active })}
            </p>
            <p className="text-[13px] text-muted">
              <span className="mr-1 font-semibold text-ok tabular">{counts.available}</span>{t("available")}
            </p>
            {counts.awaitingRelease > 0 && (
              <button
                onClick={() => { setStatus("occupied"); setSort("urgency"); }}
                className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                <span className="mr-1 font-semibold text-ink tabular">{counts.awaitingRelease}</span>
                {t("finished, waiting to be emptied")}
              </button>
            )}
          </div>
          <div
            className="mt-3 flex h-2 overflow-hidden rounded-full bg-ok-soft"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={occupancy}
            aria-label={t("Tray occupancy {0}%", { 0: occupancy })}
          >
            <motion.div
              className="h-full rounded-full bg-occupied"
              initial={false}
              animate={{ width: `${occupancy}%` }}
              transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
            />
          </div>
        </div>
        <p className="text-right text-[13px] text-muted max-md:text-left">
          {t("Occupancy")} <span className="font-semibold text-ink tabular">{fmt.num(occupancy, 1)}%</span>
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Tray number, case or patient")}
            className="pl-9"
            aria-label={t("Search trays")}
          />
        </div>
        <div className="contents">
          <div className="flex rounded-lg border border-line bg-surface p-0.5 shadow-soft" role="radiogroup" aria-label={t("Tray status")}>
            {(["all", "available", "occupied", ...(counts.inactive ? ["inactive"] : [])] as StatusFilter[]).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  "relative h-8 rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:text-ink",
                  status === s && "text-ink",
                )}
              >
                {status === s && (
                  <motion.span layoutId="tray-status-pill" className="absolute inset-0 rounded-md bg-surface-2 ring-1 ring-line" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                )}
                <span className="relative">{t({ all: "All", available: "Available", occupied: "Occupied", inactive: "Inactive" }[s])}</span>
              </button>
            ))}
          </div>
          <Select value={tech} onChange={(e) => setTech(e.target.value)} className="h-9 w-auto min-w-40" aria-label={t("Filter by technician")}>
            <option value="">{t("All technicians")}</option>
            {props.myTechnicianId && <option value={props.myTechnicianId}>{t("My cases")}</option>}
            {props.technicians.filter((item) => item.id !== props.myTechnicianId).map((item) => (
              <option key={item.id} value={item.id}>{item.full_name}</option>
            ))}
          </Select>
          <Select value={due} onChange={(e) => setDue(e.target.value as DueFilter)} className="h-9 w-auto" aria-label={t("Filter by due date")}>
            <option value="any">{t("Any due date")}</option>
            <option value="overdue">{t("Overdue")}</option>
            <option value="due_soon">{t("Due soon")}</option>
            <option value="week">{t("Due within 7 days")}</option>
          </Select>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setStatus("all"); setTech(""); setDue("any"); }}>
              <X /> {t("Clear")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 xl:ml-auto">
          <Button variant="secondary" size="sm" onClick={() => setSort(sort === "number" ? "urgency" : "number")} aria-label={t("Sort by {0}", { 0: sort === "number" ? "urgency" : "number" })}>
            <ArrowDownUp /> {sort === "number" ? t("By number") : t("By urgency")}
          </Button>
          <div className="flex rounded-lg border border-line bg-surface p-0.5 shadow-soft">
            <button onClick={() => changeView("grid")} aria-label={t("Grid view")} aria-pressed={view === "grid"} className={cn("rounded-md p-1.5 text-muted hover:text-ink", view === "grid" && "bg-surface-2 text-ink")}>
              <LayoutGrid className="size-4" />
            </button>
            <button onClick={() => changeView("list")} aria-label={t("List view")} aria-pressed={view === "list"} className={cn("rounded-md p-1.5 text-muted hover:text-ink", view === "list" && "bg-surface-2 text-ink")}>
              <List className="size-4" />
            </button>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setDialog("add")}>
              <Plus /> {t("Add trays")}
            </Button>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">{t("{0} trays shown", { 0: filtered.length })}</p>

      {trays.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title={t("No trays yet")}
          action={isAdmin ? <Button onClick={() => setDialog("add")}><Plus /> {t("Add trays")}</Button> : undefined}
        >
          {isAdmin ? t("Add the numbers engraved on your physical trays to start placing cases.") : t("An administrator needs to add the laboratory's trays.")}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search />} title={t("No trays match these filters")}>
          {t("Try another number or clear the filters.")}
        </EmptyState>
      ) : view === "grid" ? (
        <motion.ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.018 } } }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((item, i) => (
              <TrayTile key={item.tray_id} tourTarget={i === 0} tray={item} today={today} dueSoonDays={dueSoonDays} selected={item.tray_id === selectedId} onSelect={() => setSelectedId(item.tray_id)} />
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <TrayList trays={filtered} today={today} dueSoonDays={dueSoonDays} onSelect={(id) => setSelectedId(id)} />
      )}

      <TrayPanel
        tray={selected}
        today={today}
        dueSoonDays={dueSoonDays}
        isAdmin={isAdmin}
        onClose={() => setSelectedId(null)}
        onAction={(a) => setDialog(a)}
      />

      {selected && (
        <>
          <AssignDialog open={dialog === "assign"} onOpenChange={(o) => !o && setDialog(null)} tray={selected} cases={props.placeable} today={today} dueSoonDays={dueSoonDays} onDone={() => { setDialog(null); router.refresh(); }} />
          <ReleaseDialog open={dialog === "release"} onOpenChange={(o) => !o && setDialog(null)} tray={selected} onDone={() => { setDialog(null); router.refresh(); }} />
          <MoveDialog open={dialog === "move"} onOpenChange={(o) => !o && setDialog(null)} tray={selected} trays={trays} onDone={(newTray) => { setDialog(null); setSelectedId(newTray); router.refresh(); }} />
        </>
      )}
      <AddTraysDialog open={dialog === "add"} onOpenChange={(o) => !o && setDialog(null)} highest={trays.reduce((m, item) => Math.max(m, item.number), 0)} onDone={() => { setDialog(null); router.refresh(); }} />
    </div>
  );
}

function UrgencyBadge({ u, due, today, lifecycle }: { u: Urgency | null; due: string | null; today: string; lifecycle: string | null }) {
  const { t, fmt } = useI18n();
  if (lifecycle === "completed") return <StatusBadge status="completed" />;
  if (lifecycle === "delivered") return <StatusBadge status="delivered" />;
  if (lifecycle === "cancelled") return <StatusBadge status="cancelled" />;
  if (!due) return null;
  if (u === "overdue") return <Badge tone="danger" icon={<CalendarClock />}>{fmt.due(due, today)}</Badge>;
  if (u === "due_soon") return <Badge tone="warn" icon={<CalendarClock />}>{fmt.due(due, today)}</Badge>;
  return <span className="text-xs text-muted">{t("Due")} {fmt.day(due, "d MMM")}</span>;
}

function TrayTile({ tray: tr, today, dueSoonDays, selected, onSelect, tourTarget }: { tray: TrayRow; today: string; dueSoonDays: number; selected: boolean; onSelect: () => void; tourTarget?: boolean }) {
  const { t } = useI18n();
  const s = stateOf(tr);
  const u = urgencyOf(tr.due_date, today, dueSoonDays, tr.lifecycle);
  const tip = s === "occupied"
    ? `${tr.case_reference} · ${t(tr.stage_name)}${tr.technician_name ? ` · ${tr.technician_name}` : ""}`
    : t(s === "available" ? "Available — click to place a case" : "Deactivated");
  return (
    <motion.li
      data-tour={tourTarget ? "tray-tile" : undefined}
      layout
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
    >
      <Tooltip content={tip}>
        <motion.button
          onClick={onSelect}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={cn(
            "group relative flex w-full flex-col gap-2 rounded-2xl border bg-surface p-2.5 pb-3 text-left shadow-soft outline-none transition-[border-color,box-shadow] duration-200 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring",
            selected ? "border-primary ring-2 ring-primary/25" : "border-line hover:border-line-strong",
          )}
          aria-label={t("Tray {0}: {1}{2}", { 0: trayCode(tr.number), 1: t(s), 2: tr.case_reference ? t(", case {0}", { 0: tr.case_reference }) : "" })}
          aria-pressed={selected}
        >
          <div className="transition-[filter] duration-200 group-hover:brightness-[1.04]">
            <TrayVisual number={tr.number} state={s} urgency={u === "done" ? null : u} />
          </div>
          <div className="flex min-h-[42px] flex-col gap-1 px-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold tabular text-ink transition-colors group-hover:text-primary">{trayCode(tr.number)}</span>
              <StatusBadge status={s} />
            </div>
            {s === "occupied" ? (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="truncate text-xs font-medium text-ink-2">{tr.case_reference}</span>
                {<UrgencyBadge u={u} due={tr.due_date} today={today} lifecycle={tr.lifecycle} />}
              </div>
            ) : (
              <span className="truncate text-xs text-muted">{tr.label ?? (s === "available" ? t("Ready for a case") : t("Not in use"))}</span>
            )}
          </div>
        </motion.button>
      </Tooltip>
    </motion.li>
  );
}

function TrayList({ trays, today, dueSoonDays, onSelect }: { trays: TrayRow[]; today: string; dueSoonDays: number; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-soft">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="border-b border-line bg-surface-2/60 text-xs text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{t("Tray")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Status")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Case")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Patient")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Stage")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Technician")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Due")}</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {trays.map((item) => {
              const s = stateOf(item);
              const u = urgencyOf(item.due_date, today, dueSoonDays, item.lifecycle);
              return (
                <motion.tr
                  key={item.tray_id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2/60 focus-within:bg-surface-2/60"
                  onClick={() => onSelect(item.tray_id)}
                >
                  <td className="px-4 py-2.5">
                    <button className="font-semibold tabular text-ink outline-none hover:text-primary focus-visible:underline" onClick={() => onSelect(item.tray_id)}>
                      {trayCode(item.number)}
                    </button>
                    {item.label && <span className="ml-2 text-xs text-muted">{item.label}</span>}
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={s} /></td>
                  <td className="px-4 py-2.5 font-medium">{item.case_reference ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5 text-ink-2">{item.patient_reference ?? (item.case_id ? <span className="text-muted">{t("Restricted")}</span> : "—")}</td>
                  <td className="px-4 py-2.5 text-ink-2">{item.stage_name ? t(item.stage_name) : "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{item.technician_name ?? "—"}</td>
                  <td className="px-4 py-2.5">{item.due_date ? <UrgencyBadge u={u} due={item.due_date} today={today} lifecycle={item.lifecycle} /> : "—"}</td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 text-muted [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{t(label)}</p>
        <div className="text-[13px] font-medium text-ink">{children}</div>
      </div>
    </div>
  );
}

function TrayPanel({
  tray, today, dueSoonDays, isAdmin, onClose, onAction,
}: {
  tray: TrayRow | null; today: string; dueSoonDays: number; isAdmin: boolean;
  onClose: () => void; onAction: (a: "assign" | "release" | "move") => void;
}) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [history, setHistory] = React.useState<Awaited<ReturnType<typeof trayHistoryAction>> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const trayId = tray?.tray_id;

  React.useEffect(() => {
    setHistory(null);
    setLabel(tray?.label ?? "");
    if (!trayId) return;
    let cancelled = false;
    trayHistoryAction(trayId).then((h) => !cancelled && setHistory(h)).catch(() => {});
    return () => { cancelled = true; };
  }, [trayId, tray?.label, tray?.case_id]);

  if (!tray) return <Sheet open={false} onOpenChange={() => {}} title="">{null}</Sheet>;
  const s = stateOf(tray);
  const u = urgencyOf(tray.due_date, today, dueSoonDays, tray.lifecycle);

  async function toggleActive() {
    setBusy(true);
    const r = await setTrayActiveAction(tray!.tray_id, !tray!.is_active);
    setBusy(false);
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  }
  async function saveLabel() {
    const r = await updateTrayLabelAction(tray!.tray_id, label);
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  }

  return (
    <Sheet
      open={Boolean(tray)}
      onOpenChange={(o) => !o && onClose()}
      title={t("Tray {0}", { 0: trayCode(tray.number) })}
      description={<span className="inline-flex items-center gap-2"><StatusBadge status={s} />{tray.label && <span>{tray.label}</span>}</span>}
      footer={
        s === "available" ? (
          <Button className="flex-1" onClick={() => onAction("assign")}><Plus /> {t("Place a case")}</Button>
        ) : s === "occupied" ? (
          <>
            <Button className="flex-1" onClick={() => onAction("release")}><PackageOpen /> {t("Release tray")}</Button>
            <Button variant="secondary" onClick={() => onAction("move")}><ArrowRightLeft /> {t("Move")}</Button>
          </>
        ) : isAdmin ? (
          <Button className="flex-1" onClick={toggleActive} loading={busy}><Power /> {t("Reactivate tray")}</Button>
        ) : null
      }
    >
      <motion.div
        key={tray.tray_id + (tray.case_id ?? "")}
        initial={{ scale: 0.97, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
        className="mx-auto max-w-[300px]"
      >
        <TrayVisual number={tray.number} state={s} urgency={u === "done" ? null : u} idSuffix="-panel" />
      </motion.div>

      {s === "occupied" && tray.case_id ? (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted">{t("Case in this tray")}</p>
              <p className="type-title">{tray.case_reference}</p>
            </div>
            <Link href={`/cases/${tray.case_id}`} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-primary hover:bg-accent">
              {t("Open case")} <ExternalLink className="size-3.5" />
            </Link>
          </div>
          {tray.lifecycle !== "active" && (
            <div className="mt-3 rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px] text-ink">
              {t("Production is {0}. Once the work is physically removed, release the tray to make it available.", { 0: t(tray.lifecycle ?? "") })}
            </div>
          )}
          <div className="mt-2 divide-y divide-line">
            <Detail icon={<CalendarClock />} label="Due date">
              <span className="flex flex-wrap items-center gap-2">{fmt.day(tray.due_date)} {<UrgencyBadge u={u} due={tray.due_date} today={today} lifecycle={tray.lifecycle} />}</span>
            </Detail>
            <Detail icon={<Tag />} label="Stage">{t(tray.stage_name)} {tray.priority && <PriorityBadge priority={tray.priority} />}</Detail>
            <Detail icon={<Tag />} label="Prosthetic">{t(tray.category_name)}</Detail>
            <Detail icon={<User />} label="Patient · Clinic">
              {tray.patient_reference ?? t("Restricted")} · {tray.clinic_name}
            </Detail>
            <Detail icon={<User />} label="Technician">{tray.technician_name ?? t("Unassigned")}</Detail>
            <Detail icon={<History />} label="In this tray since">{fmt.dateTime(tray.assigned_at)}</Detail>
          </div>
        </div>
      ) : s === "available" ? (
        <p className="mt-5 text-[13px] text-muted">{t("This tray is empty and ready. Place a case to mark it occupied.")}</p>
      ) : (
        <p className="mt-5 text-[13px] text-muted">{t("This tray is deactivated and can't receive cases.")}</p>
      )}

      {isAdmin && (
        <div className="mt-6 border-t border-line pt-4">
          <Field label="Tray label" hint="Optional, e.g. a shelf or workstation." htmlFor="tray-label">
            <div className="flex gap-2">
              <Input id="tray-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={t("e.g. Ceramics bench")} />
              <Button variant="secondary" onClick={saveLabel} disabled={label === (tray.label ?? "")}>{t("Save")}</Button>
            </div>
          </Field>
          {s === "available" && (
            <Button variant="danger-ghost" size="sm" className="mt-3" onClick={toggleActive} loading={busy}>
              <Ban /> {t("Deactivate tray")}
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-2 text-[13px] font-semibold text-ink">{t("Tray history")}</p>
        {!history ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-8" />)}</div>
        ) : history.length === 0 ? (
          <p className="text-[13px] text-muted">{t("No cases have used this tray yet.")}</p>
        ) : (
          <ol className="space-y-1">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
                <Link href={`/cases/${h.case_id}`} className="font-medium text-ink hover:text-primary">{h.reference}</Link>
                <span className="text-right text-xs text-muted">
                  {fmt.dateTime(h.assigned_at)} → {h.released_at ? fmt.dateTime(h.released_at) : t("now")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Sheet>
  );
}

function AssignDialog({
  open, onOpenChange, tray, cases, today, dueSoonDays, onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; tray: TrayRow; cases: PlaceableCase[]; today: string; dueSoonDays: number; onDone: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setQ(""); setPicked(null); } }, [open]);
  const list = cases.filter((c) => !q || [c.reference, c.patient_reference, c.category, c.technician].some((v) => v?.toLowerCase().includes(q.toLowerCase())));

  async function submit() {
    if (!picked) return;
    setBusy(true);
    const r = await assignTrayAction(tray.tray_id, picked);
    setBusy(false);
    if (r.ok) {
      toast.success(t("{0} placed in tray {1}", { 0: cases.find((c) => c.id === picked)?.reference, 1: trayCode(tray.number) }));
      onDone();
    } else toast.error(r.error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Place a case in tray {0}", { 0: trayCode(tray.number) })}
      description="Cases in production that are not in a tray yet."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Link href={`/cases/new?tray=${tray.tray_id}`} className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-sm font-medium text-ink hover:bg-surface-2">{t("New case")}</Link>
          <Button onClick={submit} disabled={!picked} loading={busy}>{t("Place case")}</Button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search case, patient or technician")} className="pl-9" aria-label={t("Search cases")} />
      </div>
      {list.length === 0 ? (
        <EmptyState title={cases.length ? t("No matching cases") : t("Every case is already in a tray")} className="py-8">
          {cases.length ? t("Try a different search.") : t("Create a new case to use this tray.")}
        </EmptyState>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto" role="listbox" aria-label={t("Cases")}>
          {list.map((c) => {
            const u = urgencyOf(c.due_date, today, dueSoonDays, c.lifecycle);
            return (
              <li key={c.id}>
                <button
                  role="option"
                  aria-selected={picked === c.id}
                  onClick={() => setPicked(c.id)}
                  onDoubleClick={() => { setPicked(c.id); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    picked === c.id ? "border-primary bg-accent" : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-ink">{c.reference}</span>
                    <span className="block truncate text-xs text-muted">
                      {t(c.category)} · {c.patient_reference ?? t("Restricted")} · {c.technician ?? t("Unassigned")}
                    </span>
                  </span>
                  {<UrgencyBadge u={u} due={c.due_date} today={today} lifecycle={c.lifecycle} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

function ReleaseDialog({ open, onOpenChange, tray, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; tray: TrayRow; onDone: () => void }) {
  const { t } = useI18n();
  const [confirmed, setConfirmed] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setConfirmed(false); setReason(""); } }, [open]);
  const stillActive = tray.lifecycle === "active";

  async function submit() {
    setBusy(true);
    const r = await releaseTrayAction(tray.tray_id, confirmed, reason);
    setBusy(false);
    if (r.ok) { toast.success(t("Tray {0} is available", { 0: trayCode(tray.number) })); onDone(); } else toast.error(r.error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t("Release tray {0}", { 0: trayCode(tray.number) })}
      description={t("Case {0} keeps its full history; only the tray becomes available.", { 0: tray.case_reference })}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button onClick={submit} disabled={!confirmed || (stillActive && !reason.trim())} loading={busy}>{t("Release tray")}</Button>
        </>
      }
    >
      {stillActive && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] text-ink">
          {t("This case is still in production ({0}). To move it to another tray, use Move instead.", { 0: t(tray.stage_name) })}
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:bg-surface-2">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" aria-label={t("Tray is physically empty")} />
        <span className="text-[13px] text-ink">
          {t("I've checked tray {0} and both compartments are physically empty.", { 0: trayCode(tray.number) })}
        </span>
      </label>
      {stillActive && (
        <Field label="Reason" htmlFor="release-reason" className="mt-4" required>
          <Textarea id="release-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. Work sent to external milling")} maxLength={300} />
        </Field>
      )}
    </Dialog>
  );
}

function MoveDialog({ open, onOpenChange, tray, trays, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; tray: TrayRow; trays: TrayRow[]; onDone: (newTrayId: string) => void }) {
  const { t } = useI18n();
  const [target, setTarget] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setTarget(""); setConfirmed(false); } }, [open]);
  const available = trays.filter((item) => item.is_active && !item.case_id);

  async function submit() {
    setBusy(true);
    const r = await moveCaseAction(tray.case_id!, target, confirmed);
    setBusy(false);
    if (r.ok) { toast.success(t("{0} moved to {1}", { 0: tray.case_reference, 1: trayCode(trays.find((item) => item.tray_id === target)!.number) })); onDone(target); } else toast.error(r.error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t("Move {0}", { 0: tray.case_reference })}
      description={t("From tray {0} to another available tray.", { 0: trayCode(tray.number) })}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button onClick={submit} disabled={!target || !confirmed} loading={busy}>{t("Move case")}</Button>
        </>
      }
    >
      <Field label="New tray" htmlFor="move-target">
        <Select id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{t("Choose an available tray")}</option>
          {available.map((item) => <option key={item.tray_id} value={item.tray_id}>{trayCode(item.number)}{item.label ? ` — ${item.label}` : ""}</option>)}
        </Select>
      </Field>
      {available.length === 0 && <p className="mt-2 text-xs text-danger">{t("No trays are available.")}</p>}
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:bg-surface-2">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" aria-label={t("Old tray is empty")} />
        <span className="text-[13px] text-ink">{t("I've moved the work and tray {0} is now physically empty.", { 0: trayCode(tray.number) })}</span>
      </label>
    </Dialog>
  );
}

function AddTraysDialog({ open, onOpenChange, highest, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; highest: number; onDone: () => void }) {
  const { t } = useI18n();
  const [from, setFrom] = React.useState(String(highest + 1));
  const [to, setTo] = React.useState(String(highest + 12));
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setFrom(String(highest + 1)); setTo(String(highest + 12)); } }, [open, highest]);
  const n = Number(to) - Number(from) + 1;

  async function submit() {
    setBusy(true);
    const r = await addTraysAction(Number(from), Number(to));
    setBusy(false);
    if (r.ok) { toast.success(r.data ? `${r.data} tray${r.data === 1 ? "" : "s"} added` : "Those tray numbers already exist"); onDone(); } else toast.error(r.error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t("Add trays")}
      description="Use the numbers engraved on the physical trays. Existing numbers are skipped."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button onClick={submit} loading={busy} disabled={!(n >= 1 && n <= 500)}>{n >= 1 && n <= 500 ? t("Add {0} trays", { 0: n }) : t("Add trays")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="From number" htmlFor="tray-from">
          <Input id="tray-from" type="number" min={1} max={9999} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To number" htmlFor="tray-to">
          <Input id="tray-to" type="number" min={1} max={9999} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {!(n >= 1 && n <= 500) && <p className="mt-2 text-xs text-danger">{t("Choose a range of 1 to 500 trays.")}</p>}
    </Dialog>
  );
}
