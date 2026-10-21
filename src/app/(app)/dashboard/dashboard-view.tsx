"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "@/lib/toast";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import {
  CalendarClock, CircleCheck, ClipboardList, Grid3x3, PackageCheck, Plus, Search, TriangleAlert, BarChart3,
  FolderPlus, ArrowRightLeft, PackageOpen, Activity as ActivityIcon, Pencil, StickyNote, Archive, CircleDot, Circle, Layers,
} from "lucide-react";
import type { getDashboard } from "@/lib/data/dashboard";
import { Card, CardHeader, AnimatedNumber, EmptyState, RelativeTime } from "@/components/ui/misc";
import { GettingStarted } from "@/components/tutorial/getting-started";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { ChartTooltipBox, axisProps } from "@/components/charts/chart-tooltip";
import { TrayVisual } from "@/components/trays/tray-visual";
import { ShadeStrip } from "@/components/shell/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { cn, trayCode } from "@/lib/utils";
import { urgencyOf } from "@/lib/dates";
import { toChartNumber } from "@/lib/finance";

type Data = Awaited<ReturnType<typeof getDashboard>>;

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 1, 0.5, 1] as const } } };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

type Tone = "teal" | "green" | "blue" | "amber" | "red" | "violet";
const toneChip: Record<Tone, string> = {
  teal: "bg-occupied-soft text-occupied",
  green: "bg-ok-soft text-ok",
  blue: "bg-info-soft text-info",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
  violet: "bg-[#efe5f7] text-[#7a3f8c] dark:bg-[#2c1f3a] dark:text-[#d2a8e6]",
};

export function DashboardView({ d, denied }: { d: Data; denied?: boolean }) {
  const { t, fmt } = useI18n();
  const [hello, setHello] = React.useState("Welcome back");
  React.useEffect(() => setHello(greeting()), []);
  React.useEffect(() => {
    if (denied) toast.error("That page is for administrators. Ask an administrator if you need access.");
  }, [denied]);

  const occupancy = d.trays.active ? Math.round((d.trays.occupied / d.trays.active) * 100) : 0;
  const stats: Array<{ label: string; value: number; href: string; tone: Tone; icon: React.ReactNode; emphasize?: boolean }> = [
    { label: "Active trays", value: d.trays.active, href: "/trays", icon: <Grid3x3 />, tone: "blue" },
    { label: "Available trays", value: d.trays.available, href: "/trays?status=available", icon: <Circle />, tone: "green" },
    { label: "Occupied trays", value: d.trays.occupied, href: "/trays?status=occupied", icon: <CircleDot />, tone: "teal" },
    { label: "Active cases", value: d.cases.active, href: "/cases", icon: <ClipboardList />, tone: "violet" },
    { label: "Due soon", value: d.cases.due_soon, href: "/cases?due=soon", icon: <CalendarClock />, tone: "amber", emphasize: d.cases.due_soon > 0 },
    { label: "Overdue", value: d.cases.overdue, href: "/cases?due=overdue", icon: <TriangleAlert />, tone: "red", emphasize: d.cases.overdue > 0 },
    { label: "Completed this month", value: d.cases.completed_this_month, href: "/cases?status=completed", icon: <CircleCheck />, tone: "green" },
    { label: "Awaiting delivery", value: d.cases.awaiting_delivery, href: "/cases?status=completed", icon: <PackageCheck />, tone: "blue" },
  ];
  const heroTrays = d.trayMap.filter((x) => x.is_active).slice(0, 4);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Hero */}
      <motion.section variants={rise} className="dot-grid relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1727] via-navy to-deep p-6 text-white shadow-float sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 size-[26rem] rounded-full bg-teal/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-[22rem] rounded-full bg-[#3b5ea8]/25 blur-3xl" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-ice ring-1 ring-white/15">
              <CalendarClock className="size-3.5" /> {fmt.day(d.today, "EEEE, d MMMM")}
            </span>
            <h1 className="mt-4 font-display text-[2.1rem] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[2.6rem]">
              {t(hello)}, {d.firstName}
            </h1>
            <p className="mt-2 max-w-lg text-[15px] text-slate-300">
              {d.cases.overdue || d.cases.due_soon
                ? t("{overdue} overdue and {soon} due soon. {occupied} of {active} trays hold work.", { overdue: d.cases.overdue, soon: d.cases.due_soon, occupied: d.trays.occupied, active: d.trays.active })
                : t("Nothing is late. {occupied} of {active} trays hold work.", { occupied: d.trays.occupied, active: d.trays.active })}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <HeroAction href="/cases/new" icon={<Plus />} primary>{t("Add case")}</HeroAction>
              <HeroAction href="/trays" icon={<Grid3x3 />}>{t("View trays")}</HeroAction>
              <HeroAction href="/cases" icon={<Search />}>{t("Search case")}</HeroAction>
              <HeroAction href="/analytics" icon={<BarChart3 />}>{t("View analytics")}</HeroAction>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <OccupancyRing value={occupancy} occupied={d.trays.occupied} total={d.trays.active} />
            <div className="hidden flex-1 grid-cols-2 gap-2 sm:grid">
              {heroTrays.map((tr, i) => (
                <motion.div
                  key={tr.id}
                  initial={{ opacity: 0, y: 10, rotate: i % 2 ? 2 : -2 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                  className="rounded-xl bg-white/[0.06] p-1.5 ring-1 ring-white/10"
                >
                  <Link href={`/trays?tray=${tr.id}`} aria-label={`${t("Tray")} ${trayCode(tr.number)}`}>
                    <TrayVisual number={tr.number} state={tr.occupied ? "occupied" : "available"} compact idSuffix="-hero" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
        <ShadeStrip className="relative mt-7 max-w-xs opacity-80" />
      </motion.section>

      {/* Key figures */}
      {d.setup && <motion.div variants={rise}><GettingStarted setup={d.setup} /></motion.div>}
      <motion.div variants={rise} data-tour="dashboard-stats" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={cn(
              "group flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-soft transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lift",
              s.emphasize ? (s.tone === "red" ? "border-danger/35" : "border-warn/35") : "border-line/80 hover:border-line-strong",
            )}
          >
            <span className={cn("flex size-9 items-center justify-center rounded-xl [&_svg]:size-[18px]", toneChip[s.tone])}>{s.icon}</span>
            <span>
              <span className={cn("type-stat block", s.emphasize && s.tone === "red" && "text-danger", s.emphasize && s.tone === "amber" && "text-warn")}>
                <AnimatedNumber value={s.value} />
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-tight text-muted">{t(s.label)}</span>
            </span>
          </Link>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
        {/* Laboratory overview */}
        <motion.div variants={rise}>
          <Card className="h-full">
            <CardHeader
              title="Laboratory overview"
              description={t("{occupied} of {active} trays hold work", { occupied: d.trays.occupied, active: d.trays.active }) + (d.cases.completed_awaiting_tray_release ? ` · ${t("{n} finished and waiting to be emptied", { n: d.cases.completed_awaiting_tray_release })}` : "")}
              action={<Link href="/trays" className="text-[13px] font-medium text-primary hover:underline">{t("Open tray board")}</Link>}
            />
            <div className="px-5 pb-5 pt-4">
              {d.trayMap.length === 0 ? (
                <EmptyState icon={<Grid3x3 />} title="No trays yet" className="py-8">
                  {d.isAdmin ? <Link className="text-primary hover:underline" href="/trays">{t("Add your trays")}</Link> : t("Ask an administrator to add trays.")}
                </EmptyState>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5" aria-label={t("Tray occupancy map")}>
                  {d.trayMap.map((tr) => {
                    const u = tr.occupied ? urgencyOf(tr.due_date, d.today, d.due_soon_days, tr.lifecycle) : null;
                    const label = !tr.is_active ? "Inactive" : !tr.occupied ? "Available" : u === "overdue" ? "Occupied · overdue" : u === "due_soon" ? "Occupied · due soon" : u === "done" ? "Occupied · finished" : "Occupied";
                    return (
                      <li key={tr.id}>
                        <Tooltip content={`${t("Tray")} ${trayCode(tr.number)} — ${t(label)}`}>
                          <Link
                            href={`/trays?tray=${tr.id}`}
                            aria-label={`${t("Tray")} ${trayCode(tr.number)}: ${t(label)}`}
                            className={cn(
                              "relative flex h-11 items-center justify-center rounded-xl border text-[11px] font-semibold tabular transition-transform duration-150 hover:-translate-y-0.5",
                              !tr.is_active && "border-dashed border-line bg-transparent text-muted/60",
                              tr.is_active && !tr.occupied && "border-ok/45 bg-surface text-ok",
                              tr.occupied && "border-transparent bg-gradient-to-br from-teal to-occupied text-white dark:text-navy",
                            )}
                          >
                            {tr.number}
                            {(u === "overdue" || u === "due_soon" || u === "done") && (
                              <span className={cn("absolute right-1 top-1 size-2 rounded-full ring-2 ring-surface", u === "overdue" && "bg-danger", u === "due_soon" && "bg-warn", u === "done" && "bg-ok")} />
                            )}
                          </Link>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-ok/45 bg-surface" /> {t("Available")}</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-occupied" /> {t("Occupied")}</span>
                <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warn" /> {t("Due soon")}</span>
                <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-danger" /> {t("Overdue")}</span>
                <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ok" /> {t("Finished, still in tray")}</span>
              </div>
              {d.pipeline.length > 0 && (
                <div className="mt-6 border-t border-line pt-4">
                  <p className="mb-3 flex items-center gap-2 font-display text-[14px] font-semibold text-ink"><Layers className="size-4 text-primary" /> {t("Production pipeline")}</p>
                  <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {d.pipeline.map((p, i) => (
                      <li key={p.id} className="relative overflow-hidden rounded-xl bg-surface-2 px-3 py-2.5">
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-teal to-transparent" style={{ opacity: 0.25 + (i / Math.max(1, d.pipeline.length - 1)) * 0.75 }} />
                        <p className="flex items-center gap-1.5 text-xs text-muted"><span className="tabular">{i + 1}</span> {t(p.name)}</p>
                        <p className="mt-0.5 font-display text-[22px] font-semibold tabular text-ink"><AnimatedNumber value={p.cases} /></p>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-[11px] text-muted">{t("Cases currently at each stage (delivered shows this month).")}</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Upcoming deadlines */}
        <motion.div variants={rise}>
          <Card className="h-full">
            <CardHeader title="Upcoming deadlines" description="Active cases, earliest due first" action={<Link href="/cases?sort=due" className="text-[13px] font-medium text-primary hover:underline">{t("All cases")}</Link>} />
            <div className="px-2 pb-3 pt-2">
              {d.deadlines.length === 0 ? (
                <EmptyState icon={<CircleCheck />} title="Nothing in production" className="py-8">New cases will appear here with their due dates.</EmptyState>
              ) : (
                <ul>
                  {d.deadlines.map((c) => {
                    const u = urgencyOf(c.due_date, d.today, d.due_soon_days);
                    return (
                      <li key={c.id}>
                        <Link href={`/cases/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2">
                          <span className={cn("flex h-9 w-12 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular", c.tray_number ? "bg-occupied-soft text-occupied" : "bg-surface-2 text-muted")}>
                            {c.tray_number ? trayCode(c.tray_number) : "—"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">{c.reference} <PriorityBadge priority={c.priority} /></span>
                            <span className="block truncate text-xs text-muted">{t(c.category)} · {t(c.stage)} · {c.technician ?? t("Unassigned")}</span>
                          </span>
                          {u === "overdue" ? (
                            <Badge tone="danger" icon={<TriangleAlert />}>{fmt.due(c.due_date, d.today)}</Badge>
                          ) : u === "due_soon" ? (
                            <Badge tone="warn" icon={<CalendarClock />}>{fmt.due(c.due_date, d.today)}</Badge>
                          ) : (
                            <span className="text-xs text-muted tabular">{fmt.day(c.due_date, "d MMM")}</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <motion.div variants={rise} className="xl:col-span-2">
          <Card className="h-full">
            <CardHeader title="Cases completed per week" description="Last 8 weeks, by completion date" />
            <div className="h-64 px-2 pb-4 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.completions_by_week} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barTeal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--teal)" />
                      <stop offset="1" stopColor="var(--chart-1)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="week_start" {...axisProps} tickFormatter={(v) => fmt.day(v, "d MMM")} />
                  <YAxis {...axisProps} allowDecimals={false} width={32} />
                  <RTooltip
                    cursor={{ fill: "var(--surface-2)" }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTooltipBox label={t("Week of {date}", { date: fmt.day(String(label), "d MMM") })} rows={[{ name: t("Completed"), value: payload[0].value as number, color: "var(--chart-1)" }]} />
                      ) : null
                    }
                  />
                  <Bar dataKey="completed" fill="url(#barTeal)" radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={rise}>
          <Card className="h-full">
            <CardHeader title="Workload" description="Active cases per technician" action={<Link href="/team" className="text-[13px] font-medium text-primary hover:underline">{t("Team")}</Link>} />
            <div className="px-5 pb-5 pt-3">
              {d.workload.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">{t("No technicians yet.")}</p>
              ) : (
                <ul className="space-y-3">
                  {d.workload.map((w) => {
                    const max = Math.max(1, ...d.workload.map((x) => x.active));
                    return (
                      <li key={w.technician_id}>
                        <div className="mb-1 flex items-center justify-between text-[13px]">
                          <Link href={`/team/${w.technician_id}`} className="font-medium text-ink hover:text-primary">{w.name}</Link>
                          <span className="text-xs text-muted tabular">
                            {t("{n} active", { n: w.active })}{w.overdue ? <span className="text-danger"> · {t("{n} overdue", { n: w.overdue })}</span> : null}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                          <motion.div className="h-full rounded-full bg-gradient-to-r from-chart-1 to-teal" style={{ background: "linear-gradient(90deg, var(--chart-1), var(--teal))" }} initial={{ width: 0 }} animate={{ width: `${(w.active / max) * 100}%` }} transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }} />
                        </div>
                      </li>
                    );
                  })}
                  {d.unassigned_active > 0 && (
                    <li className="text-xs text-warn">
                      <Link href="/cases?tech=none" className="hover:underline">{t("{n} active cases without a technician", { n: d.unassigned_active })}</Link>
                    </li>
                  )}
                </ul>
              )}
              <p className="mt-4 text-[11px] text-muted">{t("Counts cases, not hours. Recorded labor hours are in Analytics.")}</p>
            </div>
          </Card>
        </motion.div>
      </div>

      <div className={cn("grid gap-6", d.finance && "xl:grid-cols-[1fr_1.6fr]")}>
        {d.finance && (
          <motion.div variants={rise}>
            <Card className="h-full">
              <CardHeader
                title="This month's money"
                description={t("Since {date}", { date: fmt.day(d.finance.period_start, "d MMM") })}
                action={<Link href="/finance" className="text-[13px] font-medium text-primary hover:underline">{t("Finance")}</Link>}
              />
              <dl className="divide-y divide-line px-5 pb-3 pt-2">
                {[
                  { k: "Billed (invoices issued)", v: d.finance.billed_sales },
                  { k: "Payments received", v: d.finance.payments_received },
                  { k: "Outstanding receivables (all time)", v: d.finance.outstanding_receivables },
                ].map((r) => (
                  <div key={r.k} className="flex items-baseline justify-between gap-3 py-3">
                    <dt className="text-[13px] text-muted">{t(r.k)}</dt>
                    <dd className="font-display text-[19px] font-semibold tabular">
                      <AnimatedNumber value={toChartNumber(r.v)} format={(n) => fmt.money(n.toFixed(2), d.finance!.currency)} />
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="px-5 pb-4 text-[11px] text-muted">{t("Billed is not the same as received: payments are counted on the day they arrive.")}</p>
            </Card>
          </motion.div>
        )}
        <motion.div variants={rise}>
          <Card className="h-full">
            <CardHeader title="Recent activity" />
            <div className="px-5 pb-4 pt-3">
              {d.activity.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted">{t("No activity yet.")}</p>
              ) : (
                <ol className="relative space-y-0.5 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-line">
                  {d.activity.map((a) => (
                    <li key={a.id} className="relative flex items-start gap-3 py-1.5">
                      <span className="relative z-10 flex size-[31px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-primary [&_svg]:size-3.5">
                        {activityIcon(a.action)}
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="text-[13px] text-ink">
                          {a.case_id ? <Link href={`/cases/${a.case_id}`} className="hover:text-primary">{t(a.summary)}</Link> : t(a.summary)}
                        </p>
                        <p className="text-[11px] text-muted">{a.actor ?? t("System")} · <RelativeTime ts={a.created_at} /></p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function OccupancyRing({ value, occupied, total }: { value: number; occupied: number; total: number }) {
  const { t } = useI18n();
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-36 shrink-0" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={t("Tray occupancy {n}%", { n: value })}>
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5fe3da" />
            <stop offset="1" stopColor="#19b6ae" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="12" />
        <motion.circle
          cx="64" cy="64" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1, ease: [0.25, 1, 0.5, 1], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-[30px] font-bold leading-none">{value}%</span>
        <span className="mt-1 text-[11px] text-slate-300">{t("{a} of {b} trays", { a: occupied, b: total })}</span>
      </div>
    </div>
  );
}

function activityIcon(action: string) {
  if (action === "case.created") return <FolderPlus />;
  if (action === "tray.assigned") return <Grid3x3 />;
  if (action === "tray.released") return <PackageOpen />;
  if (action === "tray.reassigned") return <ArrowRightLeft />;
  if (action === "case.stage") return <ActivityIcon />;
  if (action === "case.note") return <StickyNote />;
  if (action === "case.archived") return <Archive />;
  if (action.startsWith("case.")) return <Pencil />;
  return <ActivityIcon />;
}

function HeroAction({ href, icon, children, primary }: { href: string; icon: React.ReactNode; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.97] [&_svg]:size-4",
        primary ? "bg-teal text-navy shadow-[0_8px_24px_-8px_rgb(25_182_174/0.7)] hover:bg-[#3fd6cd]" : "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
