"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/app/lib/supabase/client";
import { dimproModules } from "@/app/lib/dimpro/modules";

type ProductAccess = {
  product_code: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "USER" | "GUEST";
  status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "EXPIRED";
  valid_until: string | null;
};

type ProductAccessResponse = {
  ok: boolean;
  mode: string;
  productCode: string;
  hasSession: boolean;
  emailMasked: string;
  accountUser: {
    id: string;
    fullName: string | null;
    emailMasked: string;
    authLinked: boolean;
    linkedByEmailFallback: boolean;
    authLinkUpdated: boolean;
  } | null;
  access: ProductAccess | null;
  allowed: boolean;
  message: string;
};

function getAruterStatus(accessState: ProductAccessResponse | null) {
  if (!accessState) return { label: "Ellenőrzés...", tone: "text-slate-500", badge: "bg-slate-100 text-slate-600" };
  if (!accessState.hasSession) return { label: "Nincs session", tone: "text-amber-700", badge: "bg-amber-100 text-amber-800" };
  if (!accessState.accountUser) return { label: "Nincs account rekord", tone: "text-amber-700", badge: "bg-amber-100 text-amber-800" };
  if (!accessState.access) return { label: "Nincs ARUTER access", tone: "text-red-700", badge: "bg-red-100 text-red-800" };
  if (accessState.allowed) return { label: `${accessState.access.status} / ${accessState.access.role}`, tone: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800" };
  return { label: `${accessState.access.status} / ${accessState.access.role}`, tone: "text-red-700", badge: "bg-red-100 text-red-800" };
}

function getModuleStatus(moduleCode: string, accessState: ProductAccessResponse | null) {
  if (moduleCode === "ARUTER") return getAruterStatus(accessState);
  if (moduleCode === "GAZDASEGED") return { label: "MVP elérhető", tone: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800" };
  if (moduleCode === "FELUJITASI_GYORSKALKULATOR" || moduleCode === "KOLTSEGADATBAZIS" || moduleCode === "INGATLANFELMERO") return { label: "MVP elérhető", tone: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800" };
  return { label: "Tervezés alatt", tone: "text-slate-500", badge: "bg-slate-100 text-slate-600" };
}

export function ModulesClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("Session ellenőrzése...");
  const [accessState, setAccessState] = useState<ProductAccessResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;

      if (error || !data.user) {
        setUser(null);
        setMessage("Nincs aktív Supabase session. A modulok teszt módban látszanak, de éles hozzáféréshez bejelentkezés szükséges.");
        return;
      }

      setUser(data.user);
      setMessage("Aktív DIMPRO session. A product access ellenőrzés planning módban fut.");
    }

    async function loadAccess() {
      try {
        const response = await fetch("/api/dimpro-account/session-product-access", { cache: "no-store" });
        const payload = (await response.json()) as ProductAccessResponse;
        if (!active) return;
        setAccessState(payload);
        if (payload.message) setMessage(payload.message);
      } catch {
        if (!active) return;
        setAccessState(null);
        setMessage("A product access API jelenleg nem érhető el. Planning módban ez nem zárja le a felületet.");
      }
    }

    loadUser();
    loadAccess();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setAccessState(null);
    router.push("/login");
    router.refresh();
  }

  const aruterStatus = getAruterStatus(accessState);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6fbf8] px-6 py-8 text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(34,197,94,0.16),transparent_30%),radial-gradient(circle_at_15%_88%,rgba(20,184,166,0.12),transparent_26%)]" />
      <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(15,118,110,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,118,110,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />

      <section className="relative mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white bg-white/78 px-5 py-4 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-lime-300 to-teal-400 text-2xl font-black text-white shadow-[0_0_30px_rgba(34,197,94,0.22)]">D</div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-700">DIMPRO Account</p>
              <h1 className="text-2xl font-black tracking-[-0.04em] text-slate-950">Modulválasztó munkatér</h1>
              <p className="mt-1 text-xs font-bold text-slate-500">Központi app cím: app.dimpro.hu</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <Link href="/login" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700">Login</Link>
            <button type="button" onClick={handleLogout} className="rounded-2xl bg-slate-950 px-4 py-3 text-white transition hover:bg-teal-800">Kijelentkezés</button>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
          <aside className="rounded-[2rem] border border-white bg-white/82 p-6 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-black uppercase tracking-[0.20em] text-teal-700">Session állapot</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-slate-950">{user ? "Bejelentkezve" : "Teszt nézet"}</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">{message}</p>

            <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-200 pb-3"><span className="font-semibold text-slate-500">Email</span><span className="max-w-[58%] truncate text-right font-black text-slate-950">{user?.email ?? accessState?.emailMasked ?? "-"}</span></div>
              <div className="flex justify-between gap-4 border-b border-slate-200 pb-3"><span className="font-semibold text-slate-500">DIMPRO user</span><span className="max-w-[58%] truncate text-right font-black text-slate-950">{accessState?.accountUser?.fullName ?? accessState?.accountUser?.emailMasked ?? "-"}</span></div>
              <div className="flex justify-between gap-4 border-b border-slate-200 pb-3"><span className="font-semibold text-slate-500">ARUTER access</span><span className={`max-w-[58%] truncate text-right font-black ${aruterStatus.tone}`}>{aruterStatus.label}</span></div>
              <div className="flex justify-between gap-4"><span className="font-semibold text-slate-500">Access mód</span><span className="font-black text-amber-700">planning</span></div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              Egységes szabály: dimpro.hu = marketing, app.dimpro.hu = belépéses app, modul.dimpro.hu = rövid átirányító cím.
            </div>
          </aside>

          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {dimproModules.map((module) => {
              const status = getModuleStatus(module.code, accessState);
              const isEnabled = module.enabledInSelector;

              return (
                <article key={module.code} className="flex min-h-[390px] flex-col rounded-[2rem] border border-white bg-white/84 p-5 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${module.accent} text-4xl font-black text-white shadow-[0_16px_38px_rgba(15,118,110,0.14)]`}>{module.icon}</div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${status.badge}`}>{status.label}</span>
                  </div>

                  <div className="mt-5 flex-1">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">{module.code}</p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">{module.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{module.description}</p>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-600">
                      <b>Marketing:</b> dimpro.hu{module.marketingPath}<br />
                      <b>App:</b> app.dimpro.hu{module.appPath}{module.shortHost ? <><br /><b>Rövid cím:</b> {module.shortHost}</> : null}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {isEnabled ? (
                      <Link href={module.appPath} className="flex w-full items-center justify-center rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700">Megnyitás</Link>
                    ) : (
                      <button type="button" className="flex w-full cursor-not-allowed items-center justify-center rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-500">Hozzáférés később</button>
                    )}

                    <Link href={module.marketingPath} className="flex w-full items-center justify-center rounded-2xl border border-teal-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-teal-700 transition hover:bg-emerald-50">Marketing oldal</Link>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </section>
    </main>
  );
}
