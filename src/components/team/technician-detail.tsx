"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { ArrowLeft, CalendarClock, Pencil, Power, TriangleAlert } from "lucide-react";
import type { getTechnician } from "@/lib/data/team";
import { setTechnicianActiveAction } from "@/lib/actions/team";
import { TechDialog } from "./team-view";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { urgencyOf } from "@/lib/dates";
import { trayCode } from "@/lib/utils";

export function TechnicianDetail({ d }: { d: Awaited<ReturnType<typeof getTechnician>> }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const active = d.cases.filter((c) => c.lifecycle === "active");
  const finished = d.cases.filter((c) => c.lifecycle !== "active");
  async function toggle() {
    const r = await setTechnicianActiveAction(d.t.id, !d.t.is_active);
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  }
  return (
    <div className="flex flex-col gap-5">
      <Link href="/team" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-4" /> {t("Technicians")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="type-display flex items-center gap-3">{d.t.full_name}{!d.t.is_active && <Badge tone="neutral">{t("Inactive")}</Badge>}</h1>
          <p className="mt-1 text-[14px] text-muted">{d.t.job_title ?? t("Technician")}{d.t.email ? ` · ${d.t.email}` : t(" · no login")}</p>
        </div>
        {d.isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEdit(true)}><Pencil /> {t("Edit")}</Button>
            <Button variant="ghost" onClick={toggle}><Power /> {d.t.is_active ? t("Deactivate") : t("Reactivate")}</Button>
          </div>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title={t("Active cases ({0})", { 0: active.length })} description="Earliest due first" />
          <ul className="p-2">
            {active.length === 0 && <li className="px-3 py-6 text-[13px] text-muted">{t("No active cases.")}</li>}
            {active.map((c) => {
              const u = urgencyOf(c.due_date, d.today, d.dueSoonDays);
              return (
                <li key={c.id}>
                  <Link href={`/cases/${c.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                    <span className="w-12 text-xs font-semibold tabular text-ink-2">{c.tray_number ? trayCode(c.tray_number) : "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{c.reference}</span>
                      <span className="block truncate text-xs text-muted">{t(c.category)} · {t(c.stage)}</span>
                    </span>
                    {u === "overdue" ? <Badge tone="danger" icon={<TriangleAlert />}>{fmt.due(c.due_date, d.today)}</Badge>
                      : u === "due_soon" ? <Badge tone="warn" icon={<CalendarClock />}>{fmt.due(c.due_date, d.today)}</Badge>
                      : <span className="text-xs text-muted">{fmt.day(c.due_date, "d MMM")}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t("Recently finished")} />
            <ul className="px-5 py-3">
              {finished.length === 0 && <li className="text-[13px] text-muted">{t("Nothing yet.")}</li>}
              {finished.slice(0, 10).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-0">
                  <Link href={`/cases/${c.id}`} className="font-medium hover:text-primary">{c.reference}</Link>
                  <span className="text-xs text-muted">{c.completed_at ? fmt.dateTime(c.completed_at, d.timezone) : ""}</span>
                  <StatusBadge status={c.lifecycle} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t("Recent activity on their cases")} />
            <ul className="px-5 py-3">
              {d.activity.length === 0 && <li className="text-[13px] text-muted">{t("No activity yet.")}</li>}
              {d.activity.map((a) => (
                <li key={a.id} className="py-1.5 text-[13px]">
                  <p>{a.summary}</p>
                  <p className="text-[11px] text-muted">{fmt.dateTime(a.created_at, d.timezone)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <TechDialog open={edit} onOpenChange={setEdit} tech={d.t} />
    </div>
  );
}
