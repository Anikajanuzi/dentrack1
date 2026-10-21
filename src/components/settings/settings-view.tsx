"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import { ArrowDown, ArrowUp, Check, Moon, Monitor, Pencil, Plus, Sun, Trash2, X } from "lucide-react";
import type { getSettings } from "@/lib/data/settings";
import {
  addLaborRateAction, addServicePriceAction, addStageAction, deleteStageAction, moveStageOrderAction, renameStageAction,
  saveCategoryAction, saveMaterialAction, saveNotificationPrefsAction, saveServiceAction, toggleCategoryAction,
  toggleMaterialAction, toggleServiceAction, updateLabAction,
} from "@/lib/actions/settings";
import { savePreferencesAction } from "@/lib/actions/shell";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Card, CardHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn, trayCode } from "@/lib/utils";
import { HelpCard } from "@/components/tutorial/help-menu";

type Data = Awaited<ReturnType<typeof getSettings>>;
type R = { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };

function useAct() {
  const router = useRouter();
  return React.useCallback(async (p: Promise<R>, opts: { quiet?: boolean } = {}) => {
    const r = await p;
    if (r.ok) { if (!opts.quiet) toast.success(r.message ?? "Saved"); router.refresh(); }
    else toast.error(Object.values(r.fieldErrors ?? {})[0] ?? r.error);
    return r;
  }, [router]);
}

export function SettingsView({ d }: { d: Data }) {
  const { t } = useI18n();
  const sp = useSearchParams();
  const tabs = [
    { value: "appearance", label: "Appearance" },
    { value: "lab", label: "Laboratory" },
    { value: "trays", label: "Trays" },
    { value: "workflow", label: "Workflow" },
    ...(d.isAdmin ? [{ value: "services", label: "Services & prices" }, { value: "costs", label: "Materials & labor" }] : []),
    { value: "team", label: "Team" },
    { value: "notifications", label: "Notifications" },
  ];
  const initial = sp.get("tab");
  const [tab, setTab] = React.useState(tabs.some((item) => item.value === initial) ? initial! : "appearance");
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList id="settings" value={tab} items={tabs} />
      <div className="max-w-5xl pt-5">
        <TabsContent value="appearance"><Appearance d={d} /></TabsContent>
        <TabsContent value="lab"><LabProfile d={d} /></TabsContent>
        <TabsContent value="trays"><TraysSettings d={d} /></TabsContent>
        <TabsContent value="workflow"><Workflow d={d} /></TabsContent>
        {d.isAdmin && <TabsContent value="services"><Services d={d} /></TabsContent>}
        {d.isAdmin && <TabsContent value="costs"><MaterialsLabor d={d} /></TabsContent>}
        <TabsContent value="team">
          <Card className="p-5 text-[13px]">
            <p>{t("Invite users, assign roles and grant cost-recording permission on the Technicians page.")} <Link href="/team" className="font-medium text-primary hover:underline">{t("Open Technicians")}</Link></p>
          </Card>
        </TabsContent>
        <TabsContent value="notifications"><Notifications d={d} /></TabsContent>
      </div>
    </Tabs>
  );
}

function Appearance({ d }: { d: Data }) {
  const { t } = useI18n();
  const act = useAct();
  const [theme, setTheme] = React.useState(d.user.theme);
  const [reduced, setReduced] = React.useState(d.user.reducedMotion);
  const [name, setName] = React.useState(d.user.fullName);
  function chooseTheme(t: typeof theme) {
    setTheme(t);
    try { localStorage.setItem("dt-theme", t); } catch {}
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    act(savePreferencesAction({ theme: t }), { quiet: true });
  }
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">{t("Theme")}</h2>
        <div className="mt-4 grid max-w-xl grid-cols-3 gap-3" role="radiogroup" aria-label={t("Theme")}>
          {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const).map(([v, l, Icon]) => (
            <button key={v} role="radio" aria-checked={theme === v} onClick={() => chooseTheme(v)}
              className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-[13px] font-medium transition-colors", theme === v ? "border-primary bg-accent text-accent-fg" : "border-line hover:bg-surface-2")}>
              <Icon className="size-5" />{t(l)}
            </button>
          ))}
        </div>
      </Card>
      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-[15px] font-semibold">{t("Reduce motion")}</h2>
          <p className="text-[13px] text-muted">{t("Turns off transitions and animations. Your operating system's setting is always respected too.")}</p>
        </div>
        <Switch checked={reduced} onCheckedChange={(v) => { setReduced(v); document.documentElement.dataset.motion = v ? "reduced" : ""; act(savePreferencesAction({ reducedMotion: v }), { quiet: true }); }} aria-label={t("Reduce motion")} />
      </Card>
      <HelpCard showChecklistOption={d.isAdmin && !d.lab.is_demo} />
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">{t("Your name")}</h2>
        <form className="mt-3 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); act(savePreferencesAction({ fullName: name })); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("Full name")} />
          <Button type="submit" variant="secondary">{t("Save")}</Button>
        </form>
        <p className="mt-2 text-xs text-muted">{t("Signed in as {0}", { 0: d.user.email })}</p>
      </Card>
    </div>
  );
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "HUF", "PLN", "CZK", "RON", "SEK", "NOK", "DKK", "ALL", "RSD", "BAM", "MKD", "TRY", "CAD", "AUD"];

function LabProfile({ d }: { d: Data }) {
  const { t } = useI18n();
  const act = useAct();
  const l = d.lab;
  const [v, setV] = React.useState({
    name: l.name, contact_email: l.contact_email ?? "", phone: l.phone ?? "", address: l.address ?? "", logo_url: l.logo_url ?? "",
    currency: l.currency, timezone: l.timezone, date_format: l.date_format as "dd MMM yyyy", due_soon_days: String(l.due_soon_days),
  });
  const [busy, setBusy] = React.useState(false);
  const zones = React.useMemo(() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return [l.timezone]; } }, [l.timezone]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const dis = !d.isAdmin;
  return (
    <Card className="p-5">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await act(updateLabAction(v)); setBusy(false); }}>
        <Field label="Laboratory name" htmlFor="l-n" className="sm:col-span-2"><Input id="l-n" value={v.name} onChange={set("name")} disabled={dis} /></Field>
        <Field label="Contact email" htmlFor="l-e"><Input id="l-e" type="email" value={v.contact_email} onChange={set("contact_email")} disabled={dis} /></Field>
        <Field label="Phone" htmlFor="l-p"><Input id="l-p" value={v.phone} onChange={set("phone")} disabled={dis} /></Field>
        <Field label="Address" htmlFor="l-a" className="sm:col-span-2"><Input id="l-a" value={v.address} onChange={set("address")} disabled={dis} /></Field>
        <Field label="Logo URL" htmlFor="l-logo" hint="An https:// link to your logo image (shown on invoices)." className="sm:col-span-2"><Input id="l-logo" value={v.logo_url} onChange={set("logo_url")} disabled={dis} placeholder="https://" /></Field>
        <Field label="Default currency" htmlFor="l-c" hint="Changing it relabels amounts; it doesn't convert them.">
          <Select id="l-c" value={v.currency} onChange={set("currency")} disabled={dis}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        <Field label="Timezone" htmlFor="l-tz" hint="Due dates, overdue status and reports use this timezone.">
          <Select id="l-tz" value={v.timezone} onChange={set("timezone")} disabled={dis}>{zones.map((z) => <option key={z}>{z}</option>)}</Select>
        </Field>
        <Field label="Date format" htmlFor="l-df">
          <Select id="l-df" value={v.date_format} onChange={set("date_format")} disabled={dis}>
            <option value="dd MMM yyyy">15 Oct 2026</option><option value="dd/MM/yyyy">15/10/2026</option><option value="MM/dd/yyyy">10/15/2026</option><option value="yyyy-MM-dd">2026-10-15</option>
          </Select>
        </Field>
        <Field label="'Due soon' window (days)" htmlFor="l-ds" hint="Cases due within this many days are flagged amber.">
          <Input id="l-ds" type="number" min={0} max={30} value={v.due_soon_days} onChange={set("due_soon_days")} disabled={dis} />
        </Field>
        {d.isAdmin ? <div className="sm:col-span-2"><Button type="submit" loading={busy}>{t("Save laboratory settings")}</Button></div>
          : <p className="text-xs text-muted sm:col-span-2">{t("Only administrators can change laboratory settings.")}</p>}
      </form>
    </Card>
  );
}

function TraysSettings({ d }: { d: Data }) {
  const { t } = useI18n();
  const active = d.trays.filter((item) => item.is_active);
  return (
    <Card>
      <CardHeader title={t("{0} active trays, {1} deactivated", { 0: active.length, 1: d.trays.length - active.length })} description="Add trays, edit labels and deactivate them from the tray board. Each tray's history is in its side panel." action={<Link href="/trays" className="text-[13px] font-medium text-primary hover:underline">{t("Open tray board")}</Link>} />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-5">
        {d.trays.map((item) => (
          <li key={item.id}>
            <Link href={`/trays?tray=${item.id}`} className={cn("block rounded-lg border px-3 py-2 text-[13px] hover:bg-surface-2", item.is_active ? "border-line" : "border-dashed border-line text-muted")}>
              <span className="font-semibold tabular">{trayCode(item.number)}</span>
              <span className="block truncate text-xs text-muted">{item.label ?? (item.is_active ? t("No label") : t("Deactivated"))} · {t("used {0}×", { 0: item.uses })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Workflow({ d }: { d: Data }) {
  const { t } = useI18n();
  const act = useAct();
  const [name, setName] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const custom = d.stages.filter((s) => !s.system_key);
  return (
    <Card>
      <CardHeader title={t("Production stages")} description="Received, Completed and Delivered are fixed because tray, revenue and completion rules depend on them. Add your own steps in between." />
      <ol className="px-5 py-3">
        {d.stages.map((s, i) => {
          const ci = custom.findIndex((c) => c.id === s.id);
          return (
            <li key={s.id} className="flex items-center gap-3 border-b border-line py-2.5 text-[13px] last:border-0">
              <span className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold tabular">{i + 1}</span>
              {editing?.id === s.id ? (
                <form className="flex flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await act(renameStageAction(s.id, editing.name)); if (r.ok) setEditing(null); }}>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" autoFocus aria-label={t("Stage name")} />
                  <Button size="icon-sm" type="submit" aria-label={t("Save")}><Check /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label={t("Cancel")}><X /></Button>
                </form>
              ) : (
                <span className="flex-1 font-medium">{t(s.name)} {s.system_key && <Badge className="ml-1.5">{t("Fixed")}</Badge>}</span>
              )}
              {d.isAdmin && editing?.id !== s.id && (
                <span className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={t("Rename {0}", { 0: s.name })} onClick={() => setEditing({ id: s.id, name: s.name })}><Pencil /></Button>
                  {!s.system_key && <>
                    <Button size="icon-sm" variant="ghost" aria-label={t("Move up")} disabled={ci === 0} onClick={() => act(moveStageOrderAction(s.id, -1), { quiet: true })}><ArrowUp /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t("Move down")} disabled={ci === custom.length - 1} onClick={() => act(moveStageOrderAction(s.id, 1), { quiet: true })}><ArrowDown /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t("Delete {0}", { 0: s.name })} disabled={s.in_use > 0} onClick={() => act(deleteStageAction(s.id))} className="hover:text-danger"><Trash2 /></Button>
                  </>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {d.isAdmin && (
        <form className="flex gap-2 border-t border-line p-5" onSubmit={async (e) => { e.preventDefault(); const r = await act(addStageAction(name)); if (r.ok) setName(""); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("New stage, e.g. Try-in")} aria-label={t("New stage name")} className="max-w-xs" />
          <Button type="submit" variant="secondary"><Plus /> {t("Add stage")}</Button>
        </form>
      )}
    </Card>
  );
}

function Services({ d }: { d: Data }) {
  const { fmt, t } = useI18n();
  const act = useAct();
  const a = d.admin!;
  const [cat, setCat] = React.useState("");
  const [svcDialog, setSvcDialog] = React.useState<null | { id?: string; name: string; category_id: string; price: string; effective_from: string }>(null);
  const [priceDialog, setPriceDialog] = React.useState<null | { id: string; name: string; price: string; effective_from: string; history: { price: string; effective_from: string }[] }>(null);
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t("Prosthetic categories")} />
        <ul className="flex flex-wrap gap-2 px-5 pt-4">
          {d.categories.map((c) => (
            <li key={c.id} className={cn("flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px]", !c.is_active && "opacity-50")}>
              {t(c.name)} <span className="text-xs text-muted">{c.services}</span>
              <Switch checked={c.is_active} onCheckedChange={(v) => act(toggleCategoryAction(c.id, v), { quiet: true })} aria-label={t("{0} active", { 0: c.name })} className="scale-75" />
            </li>
          ))}
        </ul>
        <form className="flex gap-2 p-5" onSubmit={async (e) => { e.preventDefault(); const r = await act(saveCategoryAction(null, cat)); if (r.ok) setCat(""); }}>
          <Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder={t("New category")} aria-label={t("New category")} className="max-w-xs" />
          <Button type="submit" variant="secondary"><Plus /> {t("Add")}</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title={t("Services and price list")} description="Prices are effective-dated. A new price never changes cases that already exist." action={<Button size="sm" onClick={() => setSvcDialog({ name: "", category_id: d.categories[0]?.id ?? "", price: "", effective_from: d.today })}><Plus /> {t("Add service")}</Button>} />
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="text-xs text-muted"><tr><th className="px-3 py-2 text-left font-medium">{t("Service")}</th><th className="px-3 py-2 text-left font-medium">{t("Category")}</th><th className="px-3 py-2 text-right font-medium">{t("Current price")}</th><th className="px-3 py-2 text-left font-medium">{t("Since")}</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {a.services.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">{t("No services yet. Add the work you offer and its price.")}</td></tr>}
              {a.services.map((s) => (
                <tr key={s.id} className={cn("border-t border-line", !s.is_active && "opacity-50")}>
                  <td className="px-3 py-2.5 font-medium">{t(s.name)}</td>
                  <td className="px-3 py-2.5 text-ink-2">{t(s.category)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{s.price ? fmt.money(s.price, d.lab.currency) : <span className="text-warn">{t("No price")}</span>}</td>
                  <td className="px-3 py-2.5 text-ink-2">{fmt.day(s.price_from)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPriceDialog({ id: s.id, name: s.name, price: "", effective_from: d.today, history: s.history })}>{t("Change price")}</Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t("Edit {0}", { 0: s.name })} onClick={() => setSvcDialog({ id: s.id, name: s.name, category_id: s.category_id, price: "", effective_from: d.today })}><Pencil /></Button>
                      <Switch checked={s.is_active} onCheckedChange={(v) => act(toggleServiceAction(s.id, v), { quiet: true })} aria-label={t("{0} active", { 0: s.name })} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {svcDialog && (
        <Dialog open onOpenChange={(o) => !o && setSvcDialog(null)} title={svcDialog.id ? t("Edit service") : t("Add service")}
          footer={<><Button variant="ghost" onClick={() => setSvcDialog(null)}>{t("Cancel")}</Button><Button onClick={async () => { const r = await act(saveServiceAction(svcDialog.id ?? null, svcDialog, svcDialog.id ? undefined : { price: svcDialog.price, effective_from: svcDialog.effective_from })); if (r.ok) setSvcDialog(null); }}>{t("Save service")}</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="sv-n" className="sm:col-span-2"><Input id="sv-n" value={svcDialog.name} onChange={(e) => setSvcDialog({ ...svcDialog, name: e.target.value })} autoFocus /></Field>
            <Field label="Category" htmlFor="sv-c" className="sm:col-span-2">
              <Select id="sv-c" value={svcDialog.category_id} onChange={(e) => setSvcDialog({ ...svcDialog, category_id: e.target.value })}>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
            {!svcDialog.id && <>
              <Field label={t("Price per unit ({0})", { 0: d.lab.currency })} htmlFor="sv-p" hint="Optional. Leave empty to set it later."><Input id="sv-p" inputMode="decimal" value={svcDialog.price} onChange={(e) => setSvcDialog({ ...svcDialog, price: e.target.value })} /></Field>
              <Field label="Effective from" htmlFor="sv-e"><Input id="sv-e" type="date" value={svcDialog.effective_from} onChange={(e) => setSvcDialog({ ...svcDialog, effective_from: e.target.value })} /></Field>
            </>}
          </div>
        </Dialog>
      )}
      {priceDialog && (
        <Dialog open onOpenChange={(o) => !o && setPriceDialog(null)} size="sm" title={t("Price for {0}", { 0: priceDialog.name })}
          description="The new price applies to cases received on or after the effective date."
          footer={<><Button variant="ghost" onClick={() => setPriceDialog(null)}>{t("Cancel")}</Button><Button onClick={async () => { const r = await act(addServicePriceAction(priceDialog.id, priceDialog.price, priceDialog.effective_from)); if (r.ok) setPriceDialog(null); }}>{t("Save price")}</Button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("New price ({0})", { 0: d.lab.currency })} htmlFor="np-p"><Input id="np-p" inputMode="decimal" value={priceDialog.price} onChange={(e) => setPriceDialog({ ...priceDialog, price: e.target.value })} autoFocus /></Field>
            <Field label="Effective from" htmlFor="np-e"><Input id="np-e" type="date" value={priceDialog.effective_from} onChange={(e) => setPriceDialog({ ...priceDialog, effective_from: e.target.value })} /></Field>
          </div>
          {priceDialog.history.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs text-muted">{t("Price history")}</p>
              <ul className="text-[13px]">{priceDialog.history.map((h) => <li key={h.effective_from} className="flex justify-between py-0.5"><span>{fmt.day(h.effective_from)}</span><span className="tabular">{fmt.money(h.price, d.lab.currency)}</span></li>)}</ul>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

function MaterialsLabor({ d }: { d: Data }) {
  const { fmt, t } = useI18n();
  const act = useAct();
  const a = d.admin!;
  const [m, setM] = React.useState<null | { id?: string; name: string; unit: string; default_unit_cost: string }>(null);
  const [rate, setRate] = React.useState({ technician_id: "", rate: "", effective_from: d.today });
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t("Material catalog")} description="Default unit costs pre-fill new cost entries. Each case keeps the cost recorded at the time." action={<Button size="sm" onClick={() => setM({ name: "", unit: "", default_unit_cost: "" })}><Plus /> {t("Add material")}</Button>} />
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="text-xs text-muted"><tr><th className="px-3 py-2 text-left font-medium">{t("Material")}</th><th className="px-3 py-2 text-left font-medium">{t("Unit")}</th><th className="px-3 py-2 text-right font-medium">{t("Default unit cost")}</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {a.materials.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">{t("The catalog is empty. Materials can also be entered directly on a case.")}</td></tr>}
              {a.materials.map((x) => (
                <tr key={x.id} className={cn("border-t border-line", !x.is_active && "opacity-50")}>
                  <td className="px-3 py-2.5 font-medium">{x.name}</td>
                  <td className="px-3 py-2.5 text-ink-2">{x.unit}</td>
                  <td className="px-3 py-2.5 text-right tabular">{x.default_unit_cost ? fmt.money(x.default_unit_cost, d.lab.currency) : <span className="text-muted">{t("Not set")}</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={t("Edit {0}", { 0: x.name })} onClick={() => setM({ id: x.id, name: x.name, unit: x.unit, default_unit_cost: x.default_unit_cost ?? "" })}><Pencil /></Button>
                      <Switch checked={x.is_active} onCheckedChange={(v) => act(toggleMaterialAction(x.id, v), { quiet: true })} aria-label={t("{0} active", { 0: x.name })} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title={t("Hourly labor cost")} description="Your cost per hour of technician time (wages and employer costs), not a billing rate. DENTRACK has no default; until you set one, record labor as a manual amount." />
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[480px] text-[13px]">
            <thead className="text-xs text-muted"><tr><th className="px-3 py-2 text-left font-medium">{t("Applies to")}</th><th className="px-3 py-2 text-right font-medium">{t("Rate per hour")}</th><th className="px-3 py-2 text-left font-medium">{t("Effective from")}</th></tr></thead>
            <tbody>
              {a.rates.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-muted">{t("No labor rates configured.")}</td></tr>}
              {a.rates.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-2.5">{r.technician ?? <span className="font-medium">{t("Laboratory default")}</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular">{fmt.money(r.hourly_rate, d.lab.currency)}</td>
                  <td className="px-3 py-2.5 text-ink-2">{fmt.day(r.effective_from)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="grid gap-3 border-t border-line p-5 sm:grid-cols-[1fr_140px_160px_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await act(addLaborRateAction(rate.technician_id, rate.rate, rate.effective_from)); if (r.ok) setRate({ ...rate, rate: "" }); }}>
          <Field label="Applies to" htmlFor="lr-t">
            <Select id="lr-t" value={rate.technician_id} onChange={(e) => setRate({ ...rate, technician_id: e.target.value })}>
              <option value="">{t("Laboratory default")}</option>
              {a.technicians.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
            </Select>
          </Field>
          <Field label={t("Rate ({0}/h)", { 0: d.lab.currency })} htmlFor="lr-r"><Input id="lr-r" inputMode="decimal" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} /></Field>
          <Field label="Effective from" htmlFor="lr-e"><Input id="lr-e" type="date" value={rate.effective_from} onChange={(e) => setRate({ ...rate, effective_from: e.target.value })} /></Field>
          <Button type="submit" variant="secondary"><Plus /> {t("Add rate")}</Button>
        </form>
      </Card>
      {m && (
        <Dialog open onOpenChange={(o) => !o && setM(null)} title={m.id ? t("Edit material") : t("Add material")}
          footer={<><Button variant="ghost" onClick={() => setM(null)}>{t("Cancel")}</Button><Button onClick={async () => { const r = await act(saveMaterialAction(m.id ?? null, m)); if (r.ok) setM(null); }}>{t("Save material")}</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="mm-n" className="sm:col-span-2"><Input id="mm-n" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} autoFocus /></Field>
            <Field label="Unit" htmlFor="mm-u" hint="The unit you measure use in: g, ml, disc, piece…"><Input id="mm-u" value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value })} /></Field>
            <Field label={t("Default cost per unit ({0})", { 0: d.lab.currency })} htmlFor="mm-c" hint="Purchase price ÷ units per package. Up to 4 decimals."><Input id="mm-c" inputMode="decimal" value={m.default_unit_cost} onChange={(e) => setM({ ...m, default_unit_cost: e.target.value })} /></Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

const NOTIF_TYPES: Array<[string, string, string]> = [
  ["due_soon", "Due soon", "Cases due within the 'due soon' window"],
  ["overdue", "Overdue", "Active cases past their due date"],
  ["assignment", "New assignments", "When a case is assigned to you"],
  ["status_change", "Production changes", "When someone else moves your case to another stage"],
  ["case_completed", "Case completed", "Administrators: when a case is completed and its tray needs releasing"],
  ["tray_reassigned", "Tray moves", "When your case is moved to another tray"],
];

function Notifications({ d }: { d: Data }) {
  const { t } = useI18n();
  const act = useAct();
  const [prefs, setPrefs] = React.useState<Record<string, boolean>>(() => Object.fromEntries(NOTIF_TYPES.map(([k]) => [k, d.prefs[k] ?? true])));
  return (
    <Card className="divide-y divide-line">
      {NOTIF_TYPES.map(([k, l, desc]) => (
        <label key={k} className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5">
          <span><span className="block text-[14px] font-medium">{t(l)}</span><span className="block text-[13px] text-muted">{t(desc)}</span></span>
          <Switch checked={prefs[k]} onCheckedChange={(v) => { const next = { ...prefs, [k]: v }; setPrefs(next); act(saveNotificationPrefsAction(next), { quiet: true }); }} aria-label={t(l)} />
        </label>
      ))}
    </Card>
  );
}
