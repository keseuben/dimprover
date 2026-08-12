"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";

type Entry = {
  timestamp: string;
  email: string;
  allowed: boolean;
  action: string;
};

type Filter = "all" | "allowed" | "denied";

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("hu-HU");
}

function isToday(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export default function BenjadminAdminAccessLog() {
  const [adminKey, setAdminKey] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("Admin belépési napló betöltése…");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function loadEntries(keyOverride = adminKey) {
    const cleanKey = keyOverride.trim();
    if (!cleanKey) {
      setMessage("Licencadmin belépés szükséges.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/admin-access-log", {
        headers: { "x-dimpro-license-admin-key": cleanKey },
        cache: "no-store",
      });
      const data = await response.json() as { ok?: boolean; error?: string; entries?: Entry[] };
      if (!response.ok || !data.ok) {
        setEntries([]);
        setMessage(data.error ?? "Nem sikerült betölteni az admin belépési naplót.");
        return;
      }
      setEntries(data.entries ?? []);
      setMessage("Admin belépési napló betöltve.");
      setPage(1);
    } catch {
      setMessage("Hálózati vagy szerverhiba történt.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedKey = localStorage.getItem("dimproLicenseAdminKey")?.trim() ?? "";
    if (storedKey) {
      setAdminKey(storedKey);
      void loadEntries(storedKey);
    } else {
      setMessage("Licencadmin belépés szükséges.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleEntries = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === "allowed" && !entry.allowed) return false;
      if (filter === "denied" && entry.allowed) return false;
      if (!clean) return true;
      return [entry.email, entry.action, entry.allowed ? "engedélyezett" : "tiltott"].some((value) => value.toLowerCase().includes(clean));
    });
  }, [entries, filter, query]);

  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedEntries = visibleEntries.slice((safePage - 1) * pageSize, safePage * pageSize);
  const allowedCount = entries.filter((entry) => entry.allowed).length;
  const deniedCount = entries.filter((entry) => !entry.allowed).length;
  const todayCount = entries.filter((entry) => isToday(entry.timestamp)).length;
  const latest = [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  if (!adminKey && !loading) {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>Licencadmin belépés szükséges</h1>
          <p>Az admin belépési napló csak aktív BENJADMIN admin munkamenettel érhető el.</p>
          <Link href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása</Link>
        </section>
      </main>
    );
  }

  return (
    <BenjadminDataWorkspace
      eyebrow="BENJADMIN · BIZTONSÁGI NAPLÓ"
      title="Admin belépési próbálkozások"
      description="Az admin felülethez belépési kódot kérő e-mail címek és az engedélyezési eredmény kereshető, szűrhető biztonsági naplója."
      actions={(
        <>
          <Link href="/admin/dimpro-belepesek" className="benjadmin-data-secondary-action">DIMPRO belépési audit</Link>
          <button type="button" className="benjadmin-data-primary-action" onClick={() => void loadEntries()} disabled={loading}>{loading ? <RefreshCw className="is-spinning" size={16} /> : <RefreshCw size={16} />} Frissítés</button>
        </>
      )}
      metrics={(
        <>
          <BenjadminMetric label="Összes próbálkozás" value={entries.length} />
          <BenjadminMetric label="Engedélyezett" value={allowedCount} tone="ok" />
          <BenjadminMetric label="Tiltott" value={deniedCount} tone={deniedCount ? "danger" : "default"} />
          <BenjadminMetric label="Mai esemény" value={todayCount} />
          <BenjadminMetric label="Legutóbbi" value={latest ? formatDateTime(latest.timestamp) : "—"} />
        </>
      )}
      toolbar={(
        <>
          <div className="benjadmin-data-filter-group" aria-label="Admin belépési eredmény szűrő">
            {(["all", "allowed", "denied"] as Filter[]).map((value) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => { setFilter(value); setPage(1); }}>{value === "all" ? "Mind" : value === "allowed" ? "Engedélyezett" : "Tiltott"}</button>)}
          </div>
          <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés e-mail vagy művelet alapján" /></label>
        </>
      )}
      footer={(
        <>
          <span className="benjadmin-data-message">{message}</span>
          <BenjadminPagination page={safePage} pageSize={pageSize} total={visibleEntries.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </>
      )}
    >
      <div className="benjadmin-data-table-scroll">
        <table className="benjadmin-data-table" data-testid="benjadmin-admin-access-table">
          <thead><tr><th>Időpont</th><th>E-mail cím</th><th>Eredmény</th><th>Művelet</th></tr></thead>
          <tbody>
            {pagedEntries.length ? pagedEntries.map((entry, index) => <tr key={`${entry.timestamp}-${entry.email}-${index}`}><td className="is-nowrap">{formatDateTime(entry.timestamp)}</td><td><strong>{entry.email}</strong></td><td><BenjadminStatusPill tone={entry.allowed ? "ok" : "danger"}>{entry.allowed ? "Engedélyezett" : "Tiltott próbálkozás"}</BenjadminStatusPill></td><td className="is-wide">{entry.action}</td></tr>) : <tr><td colSpan={4} className="benjadmin-data-empty">Még nincs megjeleníthető admin belépési próbálkozás.</td></tr>}
          </tbody>
        </table>
      </div>
    </BenjadminDataWorkspace>
  );
}
