export type Lang = "en" | "sq";
export const LANGS: Lang[] = ["en", "sq"];
export const LANG_COOKIE = "dt-lang";
export const isLang = (v: unknown): v is Lang => v === "en" || v === "sq";
/** Locale used for numbers, money and dates. */
export const intlLocale = (lang: Lang) => (lang === "sq" ? "sq-AL" : "en-IE");

/**
 * Albanian number formatting that doesn't depend on the runtime's locale data.
 * (Many browser builds ship without `sq` data and would silently fall back to English,
 * which makes server and client render different text.) Albanian uses a non-breaking
 * space for thousands and a comma for decimals: 12 345,60
 */
export function sqNumber(n: number, opts: { min?: number; max?: number } = {}) {
  const s = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: opts.min ?? 0,
    maximumFractionDigits: opts.max ?? opts.min ?? 2,
  }).format(n);
  return s.replace(/,/g, " ").replace(".", ",");
}

const SQ_CURRENCY: Record<string, string> = { EUR: "€", ALL: "Lekë", USD: "$", GBP: "£", CHF: "CHF" };

export function sqMoney(n: number, currency: string, compact = false) {
  const sym = SQ_CURRENCY[currency] ?? currency;
  if (compact) {
    const a = Math.abs(n);
    const [div, unit] = a >= 1e9 ? [1e9, " mld"] : a >= 1e6 ? [1e6, " mln"] : a >= 1e3 ? [1e3, " mijë"] : [1, ""];
    return `${sqNumber(n / div, { max: 1 })}${unit} ${sym}`;
  }
  return `${sqNumber(n, { min: 2, max: 2 })} ${sym}`;
}

export const SQ_MONTHS_SHORT = ["jan", "shk", "mar", "pri", "maj", "qer", "korr", "gush", "sht", "tet", "nën", "dhj"];
