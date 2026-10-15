import type { Metadata } from "next";
import { FolderPlus } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { getNewCaseOptions } from "@/lib/data/cases";
import { PageHeader } from "@/components/shell/page-header";
import { CaseForm } from "@/components/cases/case-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("New case") };
}

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ tray?: string }> }) {
  const [o, sp] = await Promise.all([getNewCaseOptions(), searchParams]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={<FolderPlus />} title="New case" description="Register incoming work. You can place it in a tray now or later from the tray board." />
      <CaseForm o={o} presetTray={sp.tray} />
    </div>
  );
}
