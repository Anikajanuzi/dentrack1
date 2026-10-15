import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getInvoice } from "@/lib/data/finance";
import { InvoiceDetail } from "@/components/finance/invoice-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Invoice") };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetail d={await getInvoice(id)} />;
}
