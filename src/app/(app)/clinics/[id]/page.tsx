import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getClinic } from "@/lib/data/directory";
import { ClinicDetail } from "@/components/directory/clinic-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Clinic") };
}

export default async function ClinicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClinicDetail d={await getClinic(id)} />;
}
