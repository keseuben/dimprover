import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { DimproPublicLanding } from "@/components/aruter/DimproPublicLanding";
import Dashboard from "./dashboard/page";

export default async function Home() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  const normalizedHost = host.toLowerCase().replace(/:\d+$/, "");
  const isBenjadminHost = normalizedHost === "admin.dimpro.hu" || normalizedHost === "admin.dev.dimpro.hu" || normalizedHost === "admin.stag.dimpro.hu";

  if (isBenjadminHost) redirect("/admin");

  if (host === "dimpro.hu" || host === "www.dimpro.hu") {
    return (
      <>
        <DimproPublicLanding />
        <Link
          href="https://app.dimpro.hu/login"
          className="fixed left-1/2 top-4 z-[60] inline-flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-[#06231d] px-5 py-3 text-sm font-black text-white shadow-[0_18px_48px_rgba(6,35,29,0.30)] transition hover:-translate-x-1/2 hover:-translate-y-0.5 hover:bg-teal-800"
          aria-label="Belépés a DIMPRO app felületére"
        >
          <LogIn size={18} />
          Belépés
        </Link>
      </>
    );
  }

  return <Dashboard />;
}