import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { getSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsView } from "@/components/settings/settings-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Settings") };
}

export default async function SettingsPage() {
  const d = await getSettings();
  return (
    <>
      <PageHeader icon={<Settings />} title="Settings" description="Your preferences and how the laboratory works. Everything here is saved to the database." />
      <Suspense><SettingsView d={d} /></Suspense>
    </>
  );
}
