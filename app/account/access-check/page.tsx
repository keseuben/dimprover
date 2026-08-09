"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccessPayload = {
  ok: boolean;
  mode: string;
  productCode: string;
  hasSession: boolean;
  authUserId?: string;
  emailMasked: string;
  accountUser: {
    id: string;
    fullName: string | null;
    emailMasked: string;
    authLinked: boolean;
    linkedByEmailFallback: boolean;
    authLinkUpdated: boolean;
  } | null;
  access: {
    product_code: string;
    role: string;
    status: string;
    valid_until: string | null;
  } | null;
  allowed: boolean;
  message: string;
};

function BoolPill({ value }: { value: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${value ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
      {value ? "igen" : "nem"}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="max-w-[64%] truncate text-right text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}

export default function AccountAccessCheckPage() {
  const [payload, setPayload] = useState<AccessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dimpro-account/session-product-access", { cache: "no-store" });
      const data = (await response.json()) as AccessPayload;
      setPayload(data);
    } catch {
      setError("Nem sikerült lekérni a product access API választ.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="min-h-screen bg-[#f6fbf8] px-6 py-8 text-slate-950">
      <section className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white bg-white/80 px-6 py-5 shadow-[0_22px_80px_rgba(15,23,42,0.08)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-teal-700">DIMPRO Account</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">ARUTER access ellenőrzés</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ez a belépett felhasználó sessionje alapján mutatja az ARUTER product access állapotot. Planning módban csak diagnosztika, nem zár ki.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={refresh} className="rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-white">
              Frissítés
            </button>
            <Link href="/account/modules" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-700">
              Modulok
            </Link>
          </div>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[2rem] border border-white bg-white/84 p-6 shadow-[0_22px_80px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-black tracking-[-0.03em]">Összefoglaló</h2>
            <div className="mt-4">
              <Row label="Betöltés" value={loading ? "folyamatban" : "kész"} />
              <Row label="API hiba" value={error ?? "-"} />
              <Row label="Product" value={payload?.productCode ?? "-"} />
              <Row label="Mode" value={payload?.mode ?? "-"} />
              <Row label="Session" value={<BoolPill value={Boolean(payload?.hasSession)} />} />
              <Row label="Allowed" value={<BoolPill value={Boolean(payload?.allowed)} />} />
              <Row label="Email" value={payload?.emailMasked ?? "-"} />
              <Row label="DIMPRO user" value={payload?.accountUser?.fullName ?? payload?.accountUser?.emailMasked ?? "-"} />
              <Row label="Role" value={payload?.access?.role ?? "-"} />
              <Row label="Status" value={payload?.access?.status ?? "-"} />
            </div>
          </article>

          <article className="rounded-[2rem] border border-white bg-slate-950 p-6 text-white shadow-[0_22px_80px_rgba(15,23,42,0.16)]">
            <h2 className="text-xl font-black tracking-[-0.03em]">JSON válasz</h2>
            <pre className="mt-4 max-h-[560px] overflow-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-5 text-emerald-100">
              {JSON.stringify(payload ?? { loading, error }, null, 2)}
            </pre>
          </article>
        </div>
      </section>
    </main>
  );
}
