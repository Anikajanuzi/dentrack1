import Link from "next/link";
import { AuthShowcase } from "@/components/auth/auth-showcase";
import { BrandMark } from "@/components/shell/brand";
import { LanguageSwitch, ThemeSwitch } from "@/components/shell/switches";
import { ShadeStrip } from "@/components/shell/app-shell";
import { getT } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="dot-grid relative hidden overflow-hidden bg-gradient-to-br from-[#0b1727] via-navy to-deep text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-teal/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[30rem] rounded-full bg-[#3b5ea8]/25 blur-3xl" aria-hidden />
        <Link href="/login" className="relative flex items-center gap-3" aria-label="DENTRACK">
          <BrandMark className="size-10" />
          <span className="font-display text-xl font-bold tracking-[0.14em]">DENTRACK</span>
        </Link>
        <div className="relative max-w-xl">
          <h1 className="font-display text-[2.9rem] font-bold leading-[1.04] tracking-[-0.035em] xl:text-[3.5rem]">
            {t("Every case. Every tray. Perfectly tracked.")}
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-300">
            {t("The engraved number on each tray is all you need. Place a case, follow it through production, and know exactly what it cost to make.")}
          </p>
          <div className="mt-10 max-w-lg">
            <AuthShowcase />
          </div>
        </div>
        <div className="relative flex items-center gap-4">
          <ShadeStrip className="w-40" />
          <p className="text-xs text-slate-400">{t("Dental laboratory management")}</p>
        </div>
      </section>
      <section className="relative flex flex-col items-center justify-center px-5 py-16 sm:px-10">
        <div className="absolute right-5 top-5 flex items-center gap-2">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          <BrandMark className="size-10" />
          <span className="font-display text-xl font-bold tracking-[0.14em] text-ink">DENTRACK</span>
        </div>
        <div className="w-full max-w-[400px] rounded-3xl border border-line/80 bg-surface/80 p-7 shadow-lift backdrop-blur sm:p-9">{children}</div>
      </section>
    </div>
  );
}
