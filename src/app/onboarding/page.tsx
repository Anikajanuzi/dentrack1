// Every screen is per-user and reads live database state.
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { OnboardingForm } from "./onboarding-form";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitch, ThemeSwitch } from "@/components/shell/switches";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Set up your laboratory") };
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const t = await getT();
  const labs = await asUser(user.id, (tx) => tx<{ is_demo: boolean }[]>`select l.is_demo from laboratory_memberships m join laboratories l on l.id = m.laboratory_id where m.user_id = ${user.id} and m.is_active`);
  if (labs.length > 0 && !sp.add) redirect("/dashboard");
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="absolute right-5 top-5 flex items-center gap-2"><ThemeSwitch /><LanguageSwitch /></div>
      <div className="w-full max-w-xl">
        <h1 className="type-display">{t("Set up your laboratory")}</h1>
        <p className="mb-8 mt-1.5 text-[14px] text-muted">
          {t("You can change everything later in Settings. If a colleague invited you, ask them to resend the invitation to {email}.", { email: user.email })}
        </p>
        <OnboardingForm hasDemo={labs.some((l) => l.is_demo)} canCancel={labs.length > 0} />
      </div>
    </div>
  );
}
