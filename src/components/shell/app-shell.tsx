"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Dialog as RD } from "radix-ui";
import { toast } from "@/lib/toast";
import {
  Archive, BarChart3, Bell, Building2, Check, ChevronsLeft, ChevronsRight, ClipboardList, FlaskConical,
  LayoutDashboard, LogOut, Menu as MenuIcon, Receipt, Search, Settings, Users, X, Grid3x3, CheckCheck,
} from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { TooltipProvider, Tooltip } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "./command-palette";
import { LanguageSwitch, ThemeSwitch } from "./switches";
import { BrandMark } from "./brand";
import { useI18n } from "@/components/i18n-provider";
import { signOut } from "@/app/(auth)/actions";
import { markNotificationsReadAction, savePreferencesAction, switchLabAction } from "@/lib/actions/shell";
import type { NotificationRow } from "@/lib/data/shell";
import { cn, initials } from "@/lib/utils";

export interface ShellProps {
  user: { fullName: string; email: string; theme: "light" | "dark" | "system"; reducedMotion: boolean };
  lab: { id: string; name: string; is_demo: boolean };
  labs: { id: string; name: string; is_demo: boolean; role: string }[];
  role: "admin" | "technician";
  notifications: { items: NotificationRow[]; unread: number };
  children: React.ReactNode;
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trays", label: "Tray board", icon: Grid3x3 },
  { href: "/cases", label: "Cases", icon: ClipboardList },
  { href: "/clinics", label: "Clinics & patients", icon: Building2 },
  { href: "/team", label: "Technicians", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/finance", label: "Finance", icon: Receipt, admin: true },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Applies the user's saved theme preference (light / dark / system) on load. */
function useSavedTheme(saved: ShellProps["user"]["theme"]) {
  React.useEffect(() => {
    try { localStorage.setItem("dt-theme", saved); } catch {}
    const apply = () => {
      const dark = saved === "dark" || (saved === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (saved !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [saved]);
}

export function AppShell({ user, lab, labs, role, notifications, children }: ShellProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  useSavedTheme(user.theme);

  React.useEffect(() => {
    try { setCollapsed(localStorage.getItem("dt-sidebar") === "collapsed"); } catch {}
  }, []);
  React.useEffect(() => {
    document.documentElement.dataset.motion = user.reducedMotion ? "reduced" : "";
    try { localStorage.setItem("dt-motion", user.reducedMotion ? "reduced" : ""); } catch {}
  }, [user.reducedMotion]);
  React.useEffect(() => setMobileOpen(false), [pathname]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("dt-sidebar", c ? "expanded" : "collapsed"); } catch {}
      return !c;
    });
  };
  const saveTheme = (th: "light" | "dark") => { savePreferencesAction({ theme: th }); };
  const nav = NAV.filter((n) => !n.admin || role === "admin");

  return (
    <MotionConfig reducedMotion={user.reducedMotion ? "always" : "user"}>
      <TooltipProvider>
        <div className="flex min-h-dvh">
          {/* Desktop sidebar */}
          <motion.aside
            initial={false}
            animate={{ width: collapsed ? 76 : 252 }}
            transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
            className="sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden bg-gradient-to-b from-[#0d1a2b] via-navy to-deep text-slate-300 lg:flex"
          >
            <SidebarContent nav={nav} pathname={pathname} collapsed={collapsed} lab={lab} />
            <div className="relative border-t border-white/8 p-3">
              <button
                onClick={toggleCollapsed}
                className="flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[13px] text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
              >
                {collapsed ? <ChevronsRight className="size-4 shrink-0" /> : <ChevronsLeft className="size-4 shrink-0" />}
                {!collapsed && <span>{t("Collapse")}</span>}
              </button>
            </div>
          </motion.aside>

          {/* Mobile drawer */}
          <RD.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <AnimatePresence>
              {mobileOpen && (
                <RD.Portal forceMount>
                  <RD.Overlay asChild forceMount>
                    <motion.div className="fixed inset-0 z-50 bg-navy/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                  </RD.Overlay>
                  <RD.Content asChild forceMount>
                    <motion.aside
                      className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-gradient-to-b from-[#0d1a2b] via-navy to-deep text-slate-300 lg:hidden"
                      initial={{ x: -290 }}
                      animate={{ x: 0 }}
                      exit={{ x: -290 }}
                      transition={{ duration: 0.26, ease: [0.25, 1, 0.5, 1] }}
                    >
                      <RD.Title className="sr-only">{t("Navigation")}</RD.Title>
                      <RD.Description className="sr-only">{t("Main navigation")}</RD.Description>
                      <RD.Close className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label={t("Close navigation")}>
                        <X className="size-4" />
                      </RD.Close>
                      <SidebarContent nav={nav} pathname={pathname} collapsed={false} lab={lab} mobile />
                      <div className="flex gap-2 border-t border-white/8 p-4">
                        <ThemeSwitch tone="onDark" onChange={saveTheme} />
                        <LanguageSwitch tone="onDark" />
                      </div>
                    </motion.aside>
                  </RD.Content>
                </RD.Portal>
              )}
            </AnimatePresence>
          </RD.Root>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line/70 bg-bg/70 px-3 backdrop-blur-xl sm:px-6">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("Open navigation")}>
                <MenuIcon />
              </Button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="group flex h-10 w-full max-w-md items-center gap-2.5 rounded-full border border-line bg-surface/80 px-4 text-[13px] text-muted shadow-soft transition-[border-color,box-shadow] hover:border-teal/40 hover:shadow-lift"
                aria-label={t("Search (Ctrl+K)")}
              >
                <Search className="size-4 transition-colors group-hover:text-primary" />
                <span className="flex-1 truncate text-left">{t("Search cases, trays, patients…")}</span>
                <span className="hidden items-center gap-0.5 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
              </button>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                {lab.is_demo && (
                  <span className="mr-1 hidden rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn xl:inline">{t("Demo data")}</span>
                )}
                <div className="hidden items-center gap-2 md:flex">
                  <ThemeSwitch onChange={saveTheme} />
                  <LanguageSwitch />
                </div>
                <NotificationBell initial={notifications} />
                <UserMenu user={user} lab={lab} labs={labs} role={role} />
              </div>
            </header>
            {lab.is_demo && (
              <div className="border-b border-warn/20 bg-warn-soft px-4 py-1.5 text-center text-xs text-ink xl:hidden">
                {t("Demo workspace — all clinics, patients and figures are fictional.")}
              </div>
            )}
            <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-7 sm:px-6 lg:px-10">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
              >
                {children}
              </motion.div>
            </main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} isAdmin={role === "admin"} />
      </TooltipProvider>
    </MotionConfig>
  );
}

function SidebarContent({
  nav, pathname, collapsed, lab, mobile,
}: { nav: typeof NAV; pathname: string; collapsed: boolean; lab: ShellProps["lab"]; mobile?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {/* Decorative arch line-art, echoing the work that sits in the trays */}
      <svg aria-hidden className="pointer-events-none absolute -bottom-10 -right-16 w-[300px] text-teal/[0.12]" viewBox="0 0 200 160" fill="none">
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${20 + i * 14} 150 C${20 + i * 14} ${60 + i * 8} ${70 + i * 4} ${18 + i * 12} 100 ${18 + i * 12} C${130 - i * 4} ${18 + i * 12} ${180 - i * 14} ${60 + i * 8} ${180 - i * 14} 150`} stroke="currentColor" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="relative flex h-16 items-center px-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 text-white" aria-label={t("DENTRACK home")}>
          <BrandMark className="size-9 shrink-0" />
          {!collapsed && <span className="font-display text-[17px] font-bold tracking-[0.12em]">DENTRACK</span>}
        </Link>
      </div>
      {!collapsed && (
        <div className="relative mx-3 mb-4 overflow-hidden rounded-2xl bg-white/[0.06] px-3.5 py-3 ring-1 ring-white/[0.06]">
          <p className="truncate text-[13px] font-semibold text-white">{lab.name}</p>
          <p className="text-xs text-slate-400">{t(lab.is_demo ? "Demo workspace" : "Laboratory")}</p>
          <ShadeStrip className="mt-2.5" />
        </div>
      )}
      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3" aria-label={t("Main")}>
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const link = (
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors",
                collapsed && "justify-center px-0",
                active ? "text-white" : "text-slate-400 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId={mobile ? "nav-active-m" : "nav-active"}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal/25 to-teal/5 ring-1 ring-teal/30"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className={cn("relative size-[18px] shrink-0", active && "text-teal")} />
              {!collapsed && <span className="relative truncate">{t(item.label)}</span>}
            </Link>
          );
          return (
            <div key={item.href}>
              {collapsed ? <Tooltip content={t(item.label)} side="right">{link}</Tooltip> : link}
            </div>
          );
        })}
      </nav>
    </>
  );
}

/** A tiny porcelain shade guide (A1 → D3): the lab's colour vocabulary, used as an ornament. */
export function ShadeStrip({ className }: { className?: string }) {
  const shades = ["--shade-a1", "--shade-b2", "--shade-a2", "--shade-a3", "--shade-c2", "--shade-d3"];
  return (
    <div className={cn("flex gap-1", className)} aria-hidden>
      {shades.map((s) => (
        <span key={s} className="h-1.5 flex-1 rounded-full" style={{ background: `var(${s})` }} />
      ))}
    </div>
  );
}

function NotificationBell({ initial }: { initial: ShellProps["notifications"] }) {
  const router = useRouter();
  const { t, fmt } = useI18n();
  const [items, setItems] = React.useState(initial.items);
  const [unread, setUnread] = React.useState(initial.unread);
  React.useEffect(() => { setItems(initial.items); setUnread(initial.unread); }, [initial]);

  async function markAll() {
    setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
    const r = await markNotificationsReadAction(null);
    if (!r.ok) toast.error(r.error);
  }
  async function open(n: NotificationRow) {
    if (!n.read_at) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markNotificationsReadAction([n.id]);
    }
    if (n.link) router.push(n.link);
  }

  const toneDot: Record<string, string> = {
    overdue: "bg-danger", due_soon: "bg-warn", assignment: "bg-primary", status_change: "bg-info",
    case_completed: "bg-ok", tray_reassigned: "bg-primary", system: "bg-neutral",
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? t("Notifications, {n} unread", { n: unread }) : t("Notifications")} className="relative rounded-full">
          <Bell />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                key={unread}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 24 }}
                className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-bg tabular"
              >
                {unread > 99 ? "99+" : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </MenuTrigger>
      <MenuContent className="w-[min(380px,calc(100vw-1.5rem))] rounded-2xl p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-display text-[15px] font-semibold">{t("Notifications")}</p>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAll}><CheckCheck /> {t("Mark all read")}</Button>
            )}
            <Link href="/settings?tab=notifications" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t("Notification preferences")}>
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-1">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted">{t("You're all caught up.")}</p>
          ) : (
            items.map((n, i) => (
              <motion.div key={n.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.025 }}>
                <MenuItem onSelect={() => open(n)} className="items-start gap-3 py-2.5">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", toneDot[n.type] ?? "bg-neutral", n.read_at && "opacity-30")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13px]", n.read_at ? "text-ink-2" : "font-semibold text-ink")}>{t(n.title)}</span>
                    {n.body && <span className="block text-xs text-muted">{t(n.body)}</span>}
                    <span className="mt-0.5 block text-[11px] text-muted">{fmt.relative(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className="sr-only">{t("Unread")}</span>}
                </MenuItem>
              </motion.div>
            ))
          )}
        </div>
      </MenuContent>
    </Menu>
  );
}

function UserMenu({ user, lab, labs, role }: { user: ShellProps["user"]; lab: ShellProps["lab"]; labs: ShellProps["labs"]; role: string }) {
  const router = useRouter();
  const { t } = useI18n();
  async function switchTo(id: string) {
    const r = await switchLabAction(id);
    if (r.ok) { router.push("/dashboard"); router.refresh(); } else toast.error(r.error);
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="ml-1 flex items-center gap-2 rounded-full p-1 pr-1 transition-colors hover:bg-surface-2 md:pr-3" aria-label={t("Account menu")}>
          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-teal to-deep text-[11px] font-bold text-white">{initials(user.fullName)}</span>
          <span className="hidden text-left md:block">
            <span className="block max-w-36 truncate text-[13px] font-semibold leading-tight text-ink">{user.fullName}</span>
            <span className="block text-[11px] leading-tight text-muted">{t(role === "admin" ? "Administrator" : "Technician")}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent className="w-64 rounded-2xl">
        <MenuLabel>
          <span className="block truncate font-medium text-ink">{user.fullName}</span>
          <span className="block truncate">{user.email}</span>
        </MenuLabel>
        <MenuSeparator />
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 md:hidden">
          <ThemeSwitch onChange={(th) => savePreferencesAction({ theme: th })} />
          <LanguageSwitch />
        </div>
        {labs.length > 1 && (
          <>
            <MenuLabel>{t("Laboratories")}</MenuLabel>
            {labs.map((l) => (
              <MenuItem key={l.id} onSelect={() => l.id !== lab.id && switchTo(l.id)}>
                <FlaskConical />
                <span className="truncate">{l.name}</span>
                {l.is_demo && <span className="text-[11px] text-warn">{t("Demo")}</span>}
                {l.id === lab.id && <Check className="ml-auto !text-primary" />}
              </MenuItem>
            ))}
            <MenuSeparator />
          </>
        )}
        <MenuItem onSelect={() => router.push("/settings")}><Settings /> {t("Settings")}</MenuItem>
        <MenuItem onSelect={() => router.push("/onboarding?add=1")}><FlaskConical /> {t("Add or try a laboratory")}</MenuItem>
        <MenuSeparator />
        <MenuItem destructive onSelect={() => signOut()}><LogOut /> {t("Sign out")}</MenuItem>
      </MenuContent>
    </Menu>
  );
}
