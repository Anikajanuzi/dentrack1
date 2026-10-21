// Every screen is per-user and reads live database state.
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ensureProfile } from "@/lib/auth/profile";
import { asUser } from "@/lib/db";
import { OnboardingWizard } from "./onboarding-wizard";
import { BrandMark } from "@/components/shell/brand";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitch, ThemeSwitch } from "@/components/shell/switches";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Set up your laboratory") };
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?error=session");
  // Creating a laboratory needs the profile row (see ensureProfile).
  await ensureProfile(user);
  const sp = await searchParams;
  const t = await getT();
  const labs = await asUser(user.id, (tx) => tx<{ is_demo: boolean }[]>`select l.is_demo from laboratory_memberships m join laboratories l on l.id = m.laboratory_id where m.user_id = ${user.id} and m.is_active`);
  if (labs.length > 0 && !sp.add) redirect("/dashboard");
  return (
    <div className="relative flex min-h-dvh justify-center px-4 pb-16 pt-20 sm:items-center sm:px-5">
      <div className="absolute left-4 top-5 flex items-center gap-2 sm:left-5">
        <BrandMark className="size-8" />
        <span className="font-display text-[15px] font-bold tracking-[0.08em]">DENTRACK</span>
      </div>
      <div className="absolute right-4 top-5 flex items-center gap-2 sm:right-5"><ThemeSwitch /><LanguageSwitch /></div>
      <div className="w-full max-w-2xl">
        <OnboardingWizard hasDemo={labs.some((l) => l.is_demo)} canCancel={labs.length > 0} />
        {!sp.add && (
          <p className="mt-6 text-center text-[12px] text-muted">
            {t("Joining a colleague's laboratory? Ask them to invite {email}; you'll be added automatically.", { email: user.email })}
          </p>
        )}
      </div>
    </div>
  );
}
