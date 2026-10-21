"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { isLang, LANG_COOKIE, sqNumber, type Lang } from "@/lib/i18n/config";
import { translate, translatePlural, type Vars } from "@/lib/i18n/translate";
import { dueLabel, fmtDateTime, fmtDay, relative } from "@/lib/dates";
import { formatMoney, formatPct, type Amount } from "@/lib/finance";
import { setClientLang } from "@/lib/i18n/client-lang";

function make(lang: Lang) {
  const t = (key: string | null | undefined, vars?: Vars) => translate(lang, key, vars);
  return {
    lang,
    t,
    tn: (n: number, one: string, other: string, vars?: Vars) => translatePlural(lang, n, one, other, vars),
    fmt: {
      day: (d: string | null | undefined, pattern?: string) => fmtDay(d, pattern, lang),
      dateTime: (ts: string | Date | null | undefined, tz?: string) => fmtDateTime(ts, tz, lang),
      relative: (ts: string | Date) => relative(ts, lang),
      due: (due: string, today: string) => dueLabel(due, today, lang),
      money: (v: Amount, currency?: string, opts: { compact?: boolean } = {}) => formatMoney(v, currency, { ...opts, lang }),
      pct: (v: string | null | undefined) => formatPct(v, lang),
      num: (n: number, max = 2) => (lang === "sq" ? sqNumber(n, { max }) : n.toLocaleString("en-IE", { maximumFractionDigits: max })),
    },
  };
}

export type I18n = ReturnType<typeof make>;
type Ctx = I18n & { setLang: (l: Lang) => void };
const Ctx = React.createContext<Ctx>({ ...make("en"), setLang: () => {} });

/**
 * Single source of truth for the interface language: the dt-lang cookie.
 *
 * - The server reads it to render the first paint (no flash, no hydration mismatch).
 * - In the browser, switching writes the cookie and the state together, so the whole interface
 *   changes at once.
 * - A language value coming from the server never overrides the cookie: if a server render
 *   disagrees (a response that left before the latest click, a page restored by Back/Forward,
 *   another tab), the cookie wins. That's what makes repeated switching in both directions reliable.
 */
function readLangCookie(): Lang | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]*)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return isLang(v) ? v : null;
}

export function I18nProvider({ lang: serverLang, children }: { lang: Lang; children: React.ReactNode }) {
  const [lang, setLang] = React.useState<Lang>(serverLang);
  const [lastServerLang, setLastServerLang] = React.useState<Lang>(serverLang);
  if (serverLang !== lastServerLang) {
    setLastServerLang(serverLang);
    const chosen = readLangCookie() ?? serverLang;
    if (chosen !== lang) setLang(chosen);
  }
  // Re-check the cookie after hydration and whenever the page comes back into view (Back/Forward
  // cache, another tab switched the language).
  React.useEffect(() => {
    const sync = () => {
      const c = readLangCookie();
      if (c) {
        setLang(c);
        document.documentElement.lang = c;
      }
    };
    sync();
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const value = React.useMemo(() => ({ ...make(lang), setLang }), [lang]);
  // Browser-only: lets toasts translate messages at the moment they are shown.
  if (typeof window !== "undefined") setClientLang(lang);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => React.useContext(Ctx);

/** Saves the choice for future visits (also read by the server on every request). */
function rememberLang(lang: Lang) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
}

export function useSetLanguage() {
  const router = useRouter();
  const { setLang } = React.useContext(Ctx);
  const [pending, start] = React.useTransition();
  return {
    pending,
    setLanguage: (lang: Lang) => {
      rememberLang(lang);
      document.documentElement.lang = lang;
      setClientLang(lang);
      setLang(lang); // the whole interface switches now
      // Server-rendered parts (page titles in the browser tab) follow in the background.
      start(() => router.refresh());
    },
  };
}
