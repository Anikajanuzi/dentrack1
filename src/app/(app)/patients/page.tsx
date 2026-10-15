import { redirect } from "next/navigation";
export default function PatientsIndex() {
  redirect("/clinics?tab=patients");
}
