import { Suspense } from "react";
import OrganizationInvitationClient from "@/components/license/OrganizationInvitationClient";

export default function OrganizationInvitationPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50 text-sm font-bold text-slate-600">Meghívás betöltése…</main>}><OrganizationInvitationClient/></Suspense>;
}
