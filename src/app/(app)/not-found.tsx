import Link from "next/link";
import { T } from "@/components/t";

export default async function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="type-title"><T k="Not found" /></h1>
      <p className="mt-1 text-[13px] text-muted"><T k="This record doesn't exist or you don't have access to it." /></p>
      <Link href="/dashboard" className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline"><T k="Back to the dashboard" /></Link>
    </div>
  );
}
