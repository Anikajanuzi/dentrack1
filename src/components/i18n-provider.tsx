"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, sqNumber, type Lang } from "@/lib/i18n/config";
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
 * The interface language lives in browser state, so switching re-renders every client component
 * at once, without waiting for the server. The server's value (from the dt-lang cookie) seeds it
 * and is followed whenever a server render brings a different one (refresh, sign-in, new tab).
 */
export function I18nProvider({ lang: serverLang, children }: { lang: Lang; children: React.ReactNode }) {
  const [lang, setLang] = React.useState<Lang>(serverLang);
  const [lastServerLang, setLastServerLang] = React.useState<Lang>(serverLang);
  if (serverLang !== lastServerLang) {
    setLastServerLang(serverLang);
    setLang(serverLang);
  }
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
