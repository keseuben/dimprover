"use client";

import { useEffect, useState } from "react";

type Entry = {
  timestamp: string;
  email: string;
  allowed: boolean;
  action: string;
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("hu-HU");
}

export default function AdminBelepesekPage() {
  const [adminKey, setAdminKey] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadEntries(key = adminKey) {
    const cleanKey = key.trim();
    if (!cleanKey) {
      setMessage("Add meg az admin kulcsot, vagy nyisd meg előbb a licencadmin dashboardot.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/admin-access-log", {
        headers: { "x-dimpro-license-admin-key": cleanKey },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "Nem sikerült betölteni a belépési naplót.");
        return;
      }
      setEntries(data.entries ?? []);
      setMessage("Belépési napló betöltve.");
    } catch {
      setMessage("Hálózati vagy szerverhiba történt.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedKey = localStorage.getItem("dimproLicenseAdminKey") ?? "";
    if (storedKey) {
      setAdminKey(storedKey);
      void loadEntries(storedKey);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#050812] px-5 py-8 text-slate-100 lg:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-[24px] border border-cyan-400/20 bg-slate-950/80 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">DIMPRO licencadmin</p>
          <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-bold text-white">Admin belépési próbálkozások</h1>
              <p className="mt-2 text-sm text-slate-400">Itt láthatók az admin felületre belépési kódot kérő e-mail címek.</p>
            </div>
            <div className="flex flex-wrap gap-2"><a href="/admin/dimpro-belepesek" className="rounded-xl border border-teal-400/30 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-400/10">DIMPRO belépési napló</a><a href="/admin" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10">Vissza a licencadminhoz</a></div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Admin kulcs" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400" />
            <button type="button" onClick={() => loadEntries()} disabled={loading} className="rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 disabled:opacity-60">{loading ? "Betöltés..." : "Napló frissítése"}</button>
          </div>
          {message ? <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-slate-800 bg-slate-950/70">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-[0.18em] text-slate-400">
              <tr><th className="px-4 py-3">Időpont</th><th className="px-4 py-3">E-mail cím</th><th className="px-4 py-3">Eredmény</th><th className="px-4 py-3">Művelet</th></tr>
            </thead>
            <tbody>
              {entries.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-slate-400">Még nincs megjeleníthető próbálkozás.</td></tr> : entries.map((entry, index) => (
                <tr key={`${entry.timestamp}-${entry.email}-${index}`} className="border-t border-slate-800">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDateTime(entry.timestamp)}</td>
                  <td className="px-4 py-3 font-semibold text-white">{entry.email}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${entry.allowed ? "border-emerald-400/40 text-emerald-200" : "border-red-400/50 text-red-200"}`}>{entry.allowed ? "Engedélyezett" : "Tiltott próbálkozás"}</span></td>
                  <td className="px-4 py-3 text-slate-300">{entry.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
