import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { Suspense } from "react";
import { listClinics } from "@/lib/data/directory";
import { PageHeader } from "@/components/shell/page-header";
import { DirectoryView } from "@/components/directory/directory-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Clinics & patients") };
}

export default async function ClinicsPage() {
  const data = await listClinics();
  return (
    <>
      <PageHeader icon={<Building2 />} title="Clinics & patients" description="The dental clinics that send you work and the patients behind each case." />
      <Suspense><DirectoryView data={data} /></Suspense>
    </>
  );
}
