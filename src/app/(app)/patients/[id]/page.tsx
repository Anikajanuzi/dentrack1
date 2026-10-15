import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getPatient } from "@/lib/data/directory";
import { PatientDetail } from "@/components/directory/patient-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Patient") };
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientDetail d={await getPatient(id)} />;
}
