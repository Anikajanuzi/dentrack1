"use client";


import { useI18n } from "@/components/i18n-provider";import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as RD } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive, BarChart3, Building2, ClipboardList, Grid3x3, LayoutDashboard, Loader2, Plus, Receipt, Search, Settings, User, Users, Wrench,
} from "lucide-react";
import { globalSearchAction, type SearchResults } from "@/lib/actions/shell";
import { trayCode } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";

const item =
  "flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted";
const group = "px-2 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted";

export function CommandPalette({ open, onOpenChange, isAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; isAdmin: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchResults>({});
  const [loading, setLoading] = React.useState(false);
  const reqId = React.useRef(0);

  React.useEffect(() => {
    if (!open) { setQ(""); setResults({}); }
  }, [open]);

  React.useEffect(() => {
    const term = q.trim();
    if (!term) { setResults({}); setLoading(false); return; }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await globalSearchAction(term);
        if (id === reqId.current) setResults(r);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const pages = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/trays", label: "Tray board", icon: Grid3x3 },
    { href: "/cases", label: "Cases", icon: ClipboardList },
    { href: "/clinics", label: "Clinics & patients", icon: Building2 },
    { href: "/team", label: "Technicians", icon: Users },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ...(isAdmin ? [{ href: "/finance", label: "Finance", icon: Receipt }] : []),
    { href: "/archive", label: "Archive", icon: Archive },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  const hasResults = Object.values(results).some((v) => v && v.length > 0);

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
            </RD.Overlay>
            <RD.Content asChild forceMount>
              <motion.div
                className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
                initial={{ opacity: 0, scale: 0.97, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
              >
                <RD.Title className="sr-only">{t("Search DENTRACK")}</RD.Title>
                <RD.Description className="sr-only">{t("Search cases, trays, patients, clinics and services, or jump to a page.")}</RD.Description>
                <Command shouldFilter={false} loop label="Global search">
                  <div className="flex items-center gap-3 border-b border-line px-4">
                    {loading ? <Loader2 className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
                    <Command.Input
                      value={q}
                      onValueChange={setQ}
                      placeholder={t("Search cases, tray numbers, patients, clinics…")}
                      className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
                    />
                  </div>
                  <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto pb-2">
                    {q.trim() && !loading && !hasResults && (
                      <Command.Empty className="px-4 py-10 text-center text-[13px] text-muted">{t("No results for “{0}”.", { 0: q })}</Command.Empty>
                    )}
                    {!q.trim() && (
                      <>
                        <Command.Group heading={t("Actions")} className={group}>
                          <Command.Item className={item} onSelect={() => go("/cases/new")}><Plus /> {t("New case")}</Command.Item>
                          <Command.Item className={item} onSelect={() => go("/trays?status=available")}><Grid3x3 /> {t("Find an available tray")}</Command.Item>
                        </Command.Group>
                        <Command.Group heading={t("Go to")} className={group}>
                          {pages.map((p) => (
                            <Command.Item key={p.href} className={item} onSelect={() => go(p.href)}><p.icon /> {t(p.label)}</Command.Item>
                          ))}
                        </Command.Group>
                      </>
                    )}
                    {!!results.trays?.length && (
                      <Command.Group heading={t("Trays")} className={group}>
                        {results.trays.map((tr) => (
                          <Command.Item key={tr.id} value={`tray-${tr.id}`} className={item} onSelect={() => go(`/trays?tray=${tr.id}`)}>
                            <Grid3x3 /> <span className="font-medium text-ink">{t("Tray")} {trayCode(tr.number)}</span>
                            <span className="ml-auto"><StatusBadge status={!tr.is_active ? "inactive" : tr.case_reference ? "occupied" : "available"} /></span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {!!results.cases?.length && (
                      <Command.Group heading={t("Cases")} className={group}>
                        {results.cases.map((c) => (
                          <Command.Item key={c.id} value={`case-${c.id}`} className={item} onSelect={() => go(`/cases/${c.id}`)}>
                            <ClipboardList /> <span className="font-medium text-ink">{c.reference}</span>
                            {c.patient && <span className="text-muted">{c.patient}</span>}
                            <span className="ml-auto"><StatusBadge status={c.archived ? "archived" : c.lifecycle} /></span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {!!results.patients?.length && (
                      <Command.Group heading={t("Patients")} className={group}>
                        {results.patients.map((p) => (
                          <Command.Item key={p.id} value={`patient-${p.id}`} className={item} onSelect={() => go(`/patients/${p.id}`)}>
                            <User /> <span className="font-medium text-ink">{p.reference}</span>
                            {p.full_name && <span className="text-muted">{p.full_name}</span>}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {!!results.clinics?.length && (
                      <Command.Group heading={t("Clinics")} className={group}>
                        {results.clinics.map((c) => (
                          <Command.Item key={c.id} value={`clinic-${c.id}`} className={item} onSelect={() => go(`/clinics/${c.id}`)}>
                            <Building2 /> {c.name}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {!!results.services?.length && (
                      <Command.Group heading={t("Services")} className={group}>
                        {results.services.map((s) => (
                          <Command.Item key={s.id} value={`service-${s.id}`} className={item} onSelect={() => go(`/cases?service=${s.id}`)}>
                            <Wrench /> {t(s.name)}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                  </Command.List>
                  <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
                    <span>{t("↑↓ to move")}</span><span>{t("Enter to open")}</span><span>{t("Esc to close")}</span>
                  </div>
                </Command>
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  );
}
