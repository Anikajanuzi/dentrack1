"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { MailPlus, Plus, Power, Users, X } from "lucide-react";
import type { getTeam } from "@/lib/data/team";
import { inviteMemberAction, revokeInvitationAction, saveTechnicianAction, updateMemberAction } from "@/lib/actions/team";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, RelativeTime } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { initials } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof getTeam>>;
type T = Data["technicians"][number];

export function TeamView({ d }: { d: Data }) {
  const { fmt, t } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = React.useState<null | "tech" | "invite">(null);
  async function act(p: Promise<{ ok: boolean; error?: string; message?: string }>) {
    const r = await p;
    if (r.ok) { if (r.message) toast.success(r.message); router.refresh(); } else toast.error(r.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <DataTable
        rows={d.technicians}
        search={(item) => `${item.full_name} ${item.job_title ?? ""} ${item.email ?? ""}`}
        searchPlaceholder="Search technicians"
        onRowClick={(item) => router.push(`/team/${item.id}`)}
        initialSort={{ key: "name", dir: "asc" }}
        minWidth={780}
        toolbar={d.isAdmin ? (
          <>
            <Button size="sm" onClick={() => setDialog("tech")}><Plus /> {t("Add technician")}</Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("invite")}><MailPlus /> {t("Invite user")}</Button>
          </>
        ) : undefined}
        empty={{ title: "No technicians yet", icon: <Users />, body: "Add the people who work on cases. They don't need a login; invite them later if they should sign in." }}
        columns={[
          { key: "name", header: "Technician", sort: (item: T) => item.full_name, render: (item: T) => (
            <span className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{initials(item.full_name)}</span>
              <span>
                <Link href={`/team/${item.id}`} onClick={(e) => e.stopPropagation()} className="block font-semibold text-ink hover:text-primary">{item.full_name}{!item.is_active && <Badge tone="neutral" className="ml-2">{t("Inactive")}</Badge>}</Link>
                <span className="block text-xs text-muted">{item.job_title ?? t("Technician")}{item.user_id ? "" : t(" · no login")}</span>
              </span>
            </span>
          ) },
          { key: "active", header: "Active cases", align: "right", sort: (item: T) => item.active, render: (item: T) => item.active },
          { key: "week", header: "Due in 7 days", align: "right", sort: (item: T) => item.due_week, render: (item: T) => item.due_week },
          { key: "overdue", header: "Overdue", align: "right", sort: (item: T) => item.overdue, render: (item: T) => <span className={item.overdue ? "font-semibold text-danger" : "text-muted"}>{item.overdue}</span> },
          { key: "done30", header: "Completed (30 days)", align: "right", sort: (item: T) => item.completed_30d, render: (item: T) => item.completed_30d },
          ...(d.canManageCosts ? [{ key: "hours", header: "Recorded hours (30 days)", align: "right" as const, sort: (item: T) => Number(item.hours_30d ?? 0), render: (item: T) => fmt.num(Number(item.hours_30d ?? 0)) }] : []),
        ]}
      />
      <p className="-mt-3 text-xs text-muted">{t("Counts come from recorded cases and labor entries. DENTRACK doesn't score or rank people.")}</p>

      {d.isAdmin && (
        <Card>
          <CardHeader title={t("Accounts and permissions")} description="People who can sign in. Technicians never see prices, invoices or payments; cost recording is an explicit extra permission." />
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="text-xs text-muted"><tr><th className="px-3 py-2 text-left font-medium">{t("Person")}</th><th className="px-3 py-2 text-left font-medium">{t("Role")}</th><th className="px-3 py-2 text-left font-medium">{t("Can record costs")}</th><th className="px-3 py-2 text-left font-medium">{t("Access")}</th></tr></thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="px-3 py-2.5"><span className="font-medium">{m.full_name}</span><span className="block text-xs text-muted">{m.email}</span></td>
                    <td className="px-3 py-2.5">
                      <Select aria-label={t("Role for {0}", { 0: m.full_name })} className="h-8 w-40" value={m.role} disabled={m.user_id === d.me} onChange={(e) => act(updateMemberAction(m.id, { role: e.target.value as "admin" | "technician" }))}>
                        <option value="admin">{t("Administrator")}</option>
                        <option value="technician">{t("Technician")}</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5">
                      <Switch aria-label={t("Cost recording for {0}", { 0: m.full_name })} checked={m.role === "admin" || m.can_manage_costs} disabled={m.role === "admin"} onCheckedChange={(v) => act(updateMemberAction(m.id, { can_manage_costs: v }))} />
                    </td>
                    <td className="px-3 py-2.5">
                      {m.user_id === d.me ? <span className="text-xs text-muted">{t("You")}</span> : (
                        <Button size="sm" variant={m.is_active ? "ghost" : "secondary"} onClick={() => act(updateMemberAction(m.id, { is_active: !m.is_active }))}>
                          <Power /> {m.is_active ? t("Remove access") : t("Restore access")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.invitations.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 text-[13px] font-semibold">{t("Pending invitations")}</p>
              <ul className="space-y-1.5">
                {d.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <span>{i.email} <span className="text-muted">· {i.role === "admin" ? t("Administrator") : t("Technician")}{i.technician ? t(" (linked to {0})", { 0: i.technician }) : ""} · {(() => { const [pre, post] = t("invited {0}", { 0: "\u0000" }).split("\u0000"); return <>{pre}<RelativeTime ts={i.created_at} />{post}</>; })()}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => act(revokeInvitationAction(i.id))}><X /> {t("Revoke")}</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <TechDialog open={dialog === "tech"} onOpenChange={(o) => !o && setDialog(null)} />
      <InviteDialog open={dialog === "invite"} onOpenChange={(o) => !o && setDialog(null)} technicians={d.technicians.filter((item) => !item.user_id && item.is_active)} />
    </div>
  );
}

export function TechDialog({ open, onOpenChange, tech }: { open: boolean; onOpenChange: (o: boolean) => void; tech?: { id: string; full_name: string; job_title: string | null } }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = React.useState({ full_name: "", job_title: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setV({ full_name: tech?.full_name ?? "", job_title: tech?.job_title ?? "" }); }, [open, tech]);
  async function submit() {
    setBusy(true);
    const r = await saveTechnicianAction(tech?.id ?? null, v);
    setBusy(false);
    if (r.ok) { toast.success(r.message); onOpenChange(false); router.refresh(); } else toast.error(r.fieldErrors?.full_name ?? r.error);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={tech ? t("Edit technician") : t("Add technician")}
      description={tech ? undefined : t("Technicians can be assigned cases without a login. Invite them later if they should sign in.")}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button onClick={submit} loading={busy}>{tech ? t("Save") : t("Add technician")}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Full name" htmlFor="t-n" required><Input id="t-n" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} autoFocus /></Field>
        <Field label="Job title" htmlFor="t-j"><Input id="t-j" value={v.job_title} onChange={(e) => setV({ ...v, job_title: e.target.value })} placeholder={t("e.g. Ceramist")} /></Field>
      </div>
    </Dialog>
  );
}

function InviteDialog({ open, onOpenChange, technicians }: { open: boolean; onOpenChange: (o: boolean) => void; technicians: { id: string; full_name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = React.useState({ email: "", role: "technician" as "admin" | "technician", can_manage_costs: false, technician_id: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setV({ email: "", role: "technician", can_manage_costs: false, technician_id: "" }); }, [open]);
  async function submit() {
    setBusy(true);
    const r = await inviteMemberAction(v);
    setBusy(false);
    if (r.ok) { toast.success(r.message); onOpenChange(false); router.refresh(); } else toast.error(r.fieldErrors?.email ?? r.error);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("Invite a user")}
      description="They join this laboratory when they create an account with this email."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button><Button onClick={submit} loading={busy}>{t("Send invitation")}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="i-e" className="sm:col-span-2" required><Input id="i-e" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoFocus /></Field>
        <Field label="Role" htmlFor="i-r">
          <Select id="i-r" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as "admin" | "technician" })}>
            <option value="technician">{t("Technician")}</option>
            <option value="admin">{t("Administrator (full access incl. finance)")}</option>
          </Select>
        </Field>
        {v.role === "technician" && (
          <Field label="Link to technician" htmlFor="i-t" hint="Use an existing technician profile so their case history carries over.">
            <Select id="i-t" value={v.technician_id} onChange={(e) => setV({ ...v, technician_id: e.target.value })}>
              <option value="">{t("Create a new technician profile")}</option>
              {technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
            </Select>
          </Field>
        )}
        {v.role === "technician" && (
          <label className="flex items-center gap-3 text-[13px] sm:col-span-2">
            <Switch checked={v.can_manage_costs} onCheckedChange={(c) => setV({ ...v, can_manage_costs: c })} aria-label={t("Can record costs")} />
            {t("Can record material, labor and other direct costs (no access to prices or payments)")}
          </label>
        )}
      </div>
    </Dialog>
  );
}
