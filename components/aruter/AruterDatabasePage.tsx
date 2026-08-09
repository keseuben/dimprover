"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Database, ExternalLink, FileCode2, KeyRound, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { AruterBrand, AruterCard, AruterPageShell } from "./AruterShared";

type Readiness = {
  repositoryMode: string;
  hasSupabaseUrl: boolean;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
  canCreateClient: boolean;
  canReadPublicReservations: boolean;
  publicReservationCount: number | null;
  missing: string[];
  errors: string[];
};

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      {ok ? <CheckCircle2 className="mt-0.5 text-emerald-600" /> : <CircleAlert className="mt-0.5 text-amber-600" />}
      <div>
        <p className="font-black text-slate-900">{label}</p>
        <p className="text-sm font-semibold text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

export function AruterDatabasePage() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadReadiness() {
    setLoading(true);
    try {
      const response = await fetch("/api/aruter/database-health");
      const result = await response.json() as { ok: boolean; data?: Readiness };
      if (result.data) setReadiness(result.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReadiness();
  }, []);

  return (
    <AruterPageShell>
      <main className="min-h-screen bg-slate-50 p-5 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <AruterBrand compact />
            <div className="flex gap-3">
              <Link href="/aruter/ajanlatoldal" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black text-slate-700">Vissza az Árutérhez</Link>
              <button onClick={loadReadiness} className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 font-black text-white"><RefreshCw size={18} /> Újraellenőrzés</button>
            </div>
          </div>

          <section className="mb-6 rounded-[32px] bg-slate-950 p-8 text-white shadow-xl">
            <div className="flex flex-wrap items-center gap-5">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-teal-400/15 text-teal-300"><Database size={42} /></span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-300">DIMPRO Árutér</p>
                <h1 className="text-4xl font-black">Supabase adatbázis ellenőrzés</h1>
                <p className="mt-2 max-w-2xl font-semibold text-slate-300">Ez az oldal ellenőrzi, hogy az Árutér database módhoz szükséges környezeti változók és a Supabase public reservation tábla elérhető-e.</p>
              </div>
            </div>
          </section>

          {loading ? (
            <AruterCard className="p-8 text-center font-black text-slate-500">Ellenőrzés folyamatban...</AruterCard>
          ) : readiness ? (
            <>
              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <AruterCard className="p-5"><p className="text-sm font-bold text-slate-500">Repository mód</p><b className="text-3xl text-teal-700">{readiness.repositoryMode}</b></AruterCard>
                <AruterCard className="p-5"><p className="text-sm font-bold text-slate-500">Supabase kliens</p><b className={`text-3xl ${readiness.canCreateClient ? "text-emerald-700" : "text-amber-700"}`}>{readiness.canCreateClient ? "OK" : "Hiányos"}</b></AruterCard>
                <AruterCard className="p-5"><p className="text-sm font-bold text-slate-500">Public reservation tábla</p><b className={`text-3xl ${readiness.canReadPublicReservations ? "text-emerald-700" : "text-amber-700"}`}>{readiness.canReadPublicReservations ? "OK" : "Nincs"}</b></AruterCard>
                <AruterCard className="p-5"><p className="text-sm font-bold text-slate-500">Foglalások</p><b className="text-3xl text-teal-700">{readiness.publicReservationCount ?? "–"}</b></AruterCard>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <AruterCard className="p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><KeyRound className="text-teal-700" /> Környezeti változók</h2>
                  <div className="space-y-3">
                    <StatusLine ok={readiness.hasSupabaseUrl} label="NEXT_PUBLIC_SUPABASE_URL" detail={readiness.hasSupabaseUrl ? "Be van állítva." : "Hiányzik a Supabase projekt URL."} />
                    <StatusLine ok={readiness.hasAnonKey} label="NEXT_PUBLIC_SUPABASE_ANON_KEY" detail={readiness.hasAnonKey ? "Be van állítva." : "Hiányzik az anon/public kulcs."} />
                    <StatusLine ok={readiness.hasServiceRoleKey} label="SUPABASE_SERVICE_ROLE_KEY" detail={readiness.hasServiceRoleKey ? "Be van állítva szerveroldali műveletekhez." : "Hiányzik vagy placeholder érték."} />
                  </div>
                </AruterCard>

                <AruterCard className="p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><ServerCog className="text-teal-700" /> Adatbázis kapcsolat</h2>
                  <div className="space-y-3">
                    <StatusLine ok={readiness.canCreateClient} label="Supabase kliens létrehozás" detail={readiness.canCreateClient ? "A szerveroldali kliens létrejött." : "A kliens nem hozható létre a jelenlegi env alapján."} />
                    <StatusLine ok={readiness.canReadPublicReservations} label="aruter_public_reservations olvasás" detail={readiness.canReadPublicReservations ? "A tábla elérhető." : "A tábla még nem elérhető vagy a séma nincs lefuttatva."} />
                    <StatusLine ok={readiness.repositoryMode === "database"} label="ARUTER_REPOSITORY_MODE=database" detail={readiness.repositoryMode === "database" ? "Az app database módra van állítva." : "Az app jelenleg mock módban fut, ez biztonságos beállítás."} />
                  </div>
                </AruterCard>
              </div>

              {(readiness.missing.length > 0 || readiness.errors.length > 0) && (
                <AruterCard className="mt-5 border-amber-200 bg-amber-50 p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-xl font-black text-amber-800"><CircleAlert /> Teendők</h2>
                  {readiness.missing.length > 0 && <p className="font-semibold text-amber-800">Hiányzó env változók: {readiness.missing.join(", ")}</p>}
                  {readiness.errors.map((error) => <p key={error} className="mt-2 font-semibold text-amber-800">Supabase hiba: {error}</p>)}
                </AruterCard>
              )}

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <AruterCard className="p-5"><FileCode2 className="mb-3 text-teal-700" /><h3 className="text-xl font-black">1. SQL séma</h3><p className="mt-2 text-sm font-semibold text-slate-500">Futtasd az `app/lib/aruter/aruter-schema.sql` fájlt Supabase SQL Editorban.</p></AruterCard>
                <AruterCard className="p-5"><ShieldCheck className="mb-3 text-teal-700" /><h3 className="text-xl font-black">2. Env kulcsok</h3><p className="mt-2 text-sm font-semibold text-slate-500">Állítsd be a Supabase URL, anon és service role kulcsokat a szerveren.</p></AruterCard>
                <AruterCard className="p-5"><ExternalLink className="mb-3 text-teal-700" /><h3 className="text-xl font-black">3. Database mód</h3><p className="mt-2 text-sm font-semibold text-slate-500">Ha minden zöld, jöhet az `ARUTER_REPOSITORY_MODE=database` próba.</p></AruterCard>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </AruterPageShell>
  );
}
