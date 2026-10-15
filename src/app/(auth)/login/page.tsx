import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Sign in") };
}

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Request a new one.",
  profile: "Your account isn't fully set up. Sign in again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const t = await getT();
  return (
    <>
      <h2 className="type-display">{t("Sign in")}</h2>
      <p className="mb-7 mt-1.5 text-[14px] text-muted">{t("Welcome back to your laboratory.")}</p>
      <LoginForm next={sp.next} notice={sp.error ? NOTICES[sp.error] : undefined} />
      <p className="mt-8 text-center text-[13px] text-muted">
        {t("New laboratory?")}{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">{t("Create an account")}</Link>
      </p>
    </>
  );
}
