import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { sq } from "date-fns/locale/sq";
import { enGB } from "date-fns/locale/en-GB";
import { intlLocale, SQ_MONTHS_SHORT, type Lang } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/translate";

const dfLocale = (lang: Lang) => (lang === "sq" ? sq : enGB);

/** Dates from the DB arrive as 'YYYY-MM-DD' (calendar dates, no timezone). */
export const parseDay = (d: string) => parseISO(d.length === 10 ? `${d}T00:00:00` : d);

export function fmtDay(d: string | null | undefined, pattern = "d MMM yyyy", lang: Lang = "en") {
  if (!d) return "—";
  return format(parseDay(d), pattern, { locale: dfLocale(lang) });
}

export function fmtDateTime(ts: string | Date | null | undefined, timeZone?: string, lang: Lang = "en") {
  if (!ts) return "—";
  const date = typeof ts === "string" ? new Date(ts) : ts;
  if (lang === "sq") {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone,
    }).formatToParts(date).map((x) => [x.type, x.value]));
    return `${p.day} ${SQ_MONTHS_SHORT[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute}`;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone,
  }).format(date);
}

export function relative(ts: string | Date, lang: Lang = "en") {
  return formatDistanceToNowStrict(typeof ts === "string" ? new Date(ts) : ts, { addSuffix: true, locale: dfLocale(lang) });
}

/** Whole calendar days from `today` to `due` (negative = overdue). Both are lab-local calendar dates. */
export const daysUntil = (due: string, today: string) => differenceInCalendarDays(parseDay(due), parseDay(today));

export type Urgency = "overdue" | "due_soon" | "ok" | "done";

export function urgencyOf(due: string | null, today: string, dueSoonDays: number, lifecycle?: string | null): Urgency | null {
  if (!due) return null;
  if (lifecycle && lifecycle !== "active") return "done";
  const d = daysUntil(due, today);
  if (d < 0) return "overdue";
  if (d <= dueSoonDays) return "due_soon";
  return "ok";
}

export function dueLabel(due: string, today: string, lang: Lang = "en") {
  const d = daysUntil(due, today);
  if (d === 0) return translate(lang, "Due today");
  if (d === 1) return translate(lang, "Due tomorrow");
  if (d === -1) return translate(lang, "1 day overdue");
  if (d < 0) return translate(lang, "{n} days overdue", { n: -d });
  return translate(lang, "Due in {n} days", { n: d });
}

export const numberLocale = intlLocale;
