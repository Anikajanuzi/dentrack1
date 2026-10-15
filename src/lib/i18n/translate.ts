import type { Lang } from "./config";
import { SQ, SQ_PATTERNS } from "./sq";

export type Vars = Record<string, string | number | null | undefined>;

/**
 * Translate an English UI string. English text is the key, so untranslated strings fall back to
 * readable English. Dynamic messages that come from the database (errors, activity history,
 * notifications) are matched against patterns.
 */
export function translate(lang: Lang, key: string | null | undefined, vars?: Vars): string {
  if (key === null || key === undefined) return "";
  let out = key;
  if (lang === "sq" && key) {
    const hit = SQ[key];
    if (hit !== undefined) out = hit;
    else {
      for (const [re, fn] of SQ_PATTERNS) {
        const m = key.match(re);
        if (m) { out = fn(m); break; }
      }
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));
  return out;
}

/** Pick the singular or plural English key, then translate. */
export function translatePlural(lang: Lang, n: number, one: string, other: string, vars?: Vars) {
  return translate(lang, n === 1 ? one : other, { n, ...vars });
}
