"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { sqNumber, type Lang } from "@/lib/i18n/config";
import { translate, translatePlural, type Vars } from "@/lib/i18n/translate";
import { setLanguageAction } from "@/lib/i18n/actions";
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
const Ctx = React.createContext<I18n>(make("en"));

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = React.useMemo(() => make(lang), [lang]);
  // Browser-only: lets toasts translate messages at the moment they are shown.
  if (typeof window !== "undefined") setClientLang(lang);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => React.useContext(Ctx);

export function useSetLanguage() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return {
    pending,
    setLanguage: (lang: Lang) =>
      start(async () => {
        await setLanguageAction(lang);
        router.refresh();
      }),
  };
}
