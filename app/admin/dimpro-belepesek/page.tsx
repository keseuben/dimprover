"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = {
  timestamp: string;
  email: string;
  allowed: boolean;
  action: "request_otp" | "verify_otp" | "session_block";
  result: string;
  ipAddress: string;
  userAgent: string;
  host: string;
  referer: string;
  message?: string;
};

type Summary = {
  total: number;
  blocked: number;
  successful: number;
  uniqueBlockedEmails: number;
  uniqueBlockedIps: number;
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("hu-HU");
}

function resultLabel(result: string) {
  const labels: Record<string, string> = {
    blocked: "Tiltott próbálkozás",
    otp_sent: "Kód elküldve",
    otp_verified: "Sikeres belépés",
    invalid_code: "Hibás vagy lejárt kód",
    provider_error: "Szolgáltatási hiba",
    allowed: "Engedélyezett",
  };
  return labels[result] || result;
}

function resultClass(result: string) {
  if (result === "otp_verified") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  if (result === "otp_sent" || result === "allowed") return "border-cyan-400/40 bg-cyan-400/10 text-cyan-100";
  if (result === "blocked") return "border-red-400/50 bg-red-400/10 text-red-200";
  return "border-amber-400/40 bg-amber-400/10 text-amber-100";
}

export default function DimproLoginAttemptsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, blocked: 0, successful: 0, uniqueBlockedEmails: 0, uniqueBlockedIps: 0 });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "blocked" | "successful">("all");
  const [query, setQuery] = useState("");

  async function loadEntries(key = adminKey) {
    const cleanKey = key.trim();
    if (!cleanKey) {
      setMessage("Add meg az admin kulcsot, vagy előbb lépj be a licencadmin dashboardon.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/dimpro-login-attempts", {
        headers: { "x-dimpro-license-admin-key": cleanKey },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage(data.error || "Nem sikerült betölteni a DIMPRO belépési naplót.");
        return;
      }
      setEntries(data.entries || []);
      setAllowedEmails(data.allowedEmails || []);
      setSummary(data.summary || { total: 0, blocked: 0, successful: 0, uniqueBlockedEmails: 0, uniqueBlockedIps: 0 });
      setMessage("DIMPRO belépési napló betöltve.");
    } catch {
      setMessage("Hálózati vagy szerverhiba történt.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedKey = localStorage.getItem("dimproLicenseAdminKey") || "";
    if (storedKey) {
      setAdminKey(storedKey);
      void loadEntries(storedKey);
    }
  }, []);

  const visibleEntries = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === "blocked" && entry.result !== "blocked") return false;
      if (filter === "successful" && entry.result !== "otp_verified") return false;
      if (!cleanQuery) return true;
      return [entry.email, entry.ipAddress, entry.userAgent, entry.host, entry.result, entry.message || ""]
        .some((value) => value.toLowerCase().includes(cleanQuery));
    });
  }, [entries, filter, query]);

  return (
    <main className="min-h-screen bg-[#050812] px-5 py-8 text-slate-100 lg:px-8">
      <section className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <header className="rounded-[24px] border border-teal-400/20 bg-slate-950/85 p-6 shadow-[0_0_80px_rgba(20,184,166,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-300/70">DIMPRO licencadmin</p>
          <div className="mt-3 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <h1 className="text-3xl font-black text-white md:text-4xl">DIMPRO belépési próbálkozások</h1>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
                Minden e-mail-kódkérés és kódellenőrzés naplózódik. A tiltott címek nem kapnak OTP-kódot, és nem férhetnek hozzá az app.dimpro.hu védett oldalaihoz.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/admin/belepesek" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10">Admin belépési napló</a>
              <a href="/admin" className="rounded-xl border border-teal-400/30 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-400/10">Vissza a licencadminhoz</a>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Összes esemény", summary.total],
            ["Tiltott próbálkozás", summary.blocked],
            ["Sikeres belépés", summary.successful],
            ["Tiltott e-mail cím", summary.uniqueBlockedEmails],
            ["Tiltott IP-cím", summary.uniqueBlockedIps],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-950/75 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-3 text-3xl font-black text-white">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[24px] border border-teal-400/20 bg-slate-950/75 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300/70">Jelenleg engedélyezett DIMPRO e-mail</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allowedEmails.length === 0 ? <span className="text-sm text-slate-400">Nincs betöltött engedélyezési lista.</span> : allowedEmails.map((email) => (
              <span key={email} className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-100">{email}</span>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
            <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Licencadmin kulcs" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-400" />
            <button type="button" onClick={() => void loadEntries()} disabled={loading} className="rounded-xl bg-teal-400 px-6 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Betöltés..." : "Napló frissítése"}</button>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-wrap gap-2">
              {(["all", "blocked", "successful"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl border px-4 py-2 text-sm font-bold ${filter === value ? "border-teal-300 bg-teal-300/15 text-teal-100" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
                  {value === "all" ? "Mind" : value === "blocked" ? "Csak tiltott" : "Csak sikeres"}
                </button>
              ))}
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés e-mail, IP, böngésző vagy eredmény alapján" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-400" />
          </div>
          {message ? <div className="mt-4 rounded-xl border border-teal-400/20 bg-teal-400/10 px-4 py-3 text-sm text-teal-100">{message}</div> : null}
        </section>

        <section className="overflow-x-auto rounded-[24px] border border-slate-800 bg-slate-950/70">
          <table className="min-w-[1250px] w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Időpont</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Eredmény</th>
                <th className="px-4 py-3">Művelet</th>
                <th className="px-4 py-3">IP-cím</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Böngésző / eszköz</th>
                <th className="px-4 py-3">Részlet</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nincs megjeleníthető belépési esemény.</td></tr>
              ) : visibleEntries.map((entry, index) => (
                <tr key={`${entry.timestamp}-${entry.email}-${index}`} className="border-t border-slate-800 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDateTime(entry.timestamp)}</td>
                  <td className="px-4 py-3 font-bold text-white">{entry.email}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${resultClass(entry.result)}`}>{resultLabel(entry.result)}</span></td>
                  <td className="px-4 py-3 text-slate-300">{entry.action}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{entry.ipAddress}</td>
                  <td className="px-4 py-3 text-slate-300">{entry.host}</td>
                  <td className="max-w-[330px] break-words px-4 py-3 text-xs leading-5 text-slate-400">{entry.userAgent}</td>
                  <td className="max-w-[300px] break-words px-4 py-3 text-xs leading-5 text-slate-400">{entry.message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}
