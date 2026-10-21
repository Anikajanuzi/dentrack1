import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";
import { getT } from "@/lib/i18n/server";
import { T } from "@/components/t";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Create account") };
}

export default async function SignupPage() {
  return (
    <>
      <h2 className="type-display"><T k="Create your account" /></h2>
      <p className="mb-7 mt-1.5 text-[14px] text-muted">
        <T k="Invited by your laboratory? Use the email the invitation was sent to and you'll join automatically." />
      </p>
      <SignupForm />
      <p className="mt-8 text-center text-[13px] text-muted">
        <T k="Already have an account?" /> <Link href="/login" className="font-medium text-primary hover:underline"><T k="Sign in" /></Link>
      </p>
    </>
  );
}
