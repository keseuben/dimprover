import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSessionByToken, hasAuthPermission } from "@/app/lib/dimpro-auth/repository";
import { DIMPRO_AUTH_SESSION_COOKIE } from "@/app/lib/dimpro-auth/security";

export const dynamic = "force-dynamic";

export default async function DimproAuthAppsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(DIMPRO_AUTH_SESSION_COOKIE)?.value?.trim() || "";
  const session = token ? await getAuthSessionByToken(token, true).catch(() => null) : null;
  if (!session) redirect("/login");

  const headerStore = await headers();
  const host = (headerStore.get("host") || "").toLowerCase();
  const isDev = host === "auth.dev.dimpro.hu" || host.endsWith(".dev.dimpro.hu");
  const driveAllowed = await hasAuthPermission({
    userId: session.user.id,
    permissionCode: "drive.access",
    productCode: "DRIVE",
  }).catch(() => false);
  const driveUrl = isDev ? "https://drive.dev.dimpro.hu/drive" : "https://drive.dimpro.hu/drive";

  return (
    <main className="min-h-screen bg-[#f4faf8] px-6 py-10 text-slate-950">
      <section className="mx-auto max-w-5xl">
        <header className="rounded-[2rem] border border-teal-100 bg-white p-7 shadow-[0_22px_80px_rgba(15,118,110,0.10)]">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">DIMPRO MÉRNÖKI KULCS</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">Alkalmazásközpont</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Bejelentkezve: <strong>{session.user.displayName || session.user.email}</strong>. Csak az engedélyezett alkalmazások jelennek meg.
          </p>
        </header>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          {driveAllowed ? (
            <Link href={driveUrl} className="rounded-[2rem] border border-teal-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-lg">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">DRIVE</div>
              <h2 className="mt-2 text-2xl font-black">DIMPRO Drive</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Projekt- és dokumentumkezelési fájltér. Megnyitáskor rövid életű, egyszer használatos belépési kódcsere indul.</p>
              <div className="mt-5 text-sm font-black text-teal-700">Megnyitás →</div>
            </Link>
          ) : (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 opacity-70">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">DRIVE</div>
              <h2 className="mt-2 text-2xl font-black">DIMPRO Drive</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Ehhez a fiókhoz jelenleg nincs aktív Drive-hozzáférés.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
