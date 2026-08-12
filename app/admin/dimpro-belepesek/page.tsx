"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";

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

type Filter = "all" | "blocked" | "successful";

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("hu-HU");
}

function resultLabel(result: string) {
  const labels: Record<string, string> = {
    blocked: "Tiltott próbálkozás",
    otp_sent: "Kód elküldve",
    otp_verified: "Sikeres belépés",
    invalid_code: "Hibás / lejárt kód",
    provider_error: "Szolgáltatási hiba",
    allowed: "Engedélyezett",
  };
  return labels[result] || result;
}

function resultTone(result: string): "ok" | "info" | "danger" | "warning" | "default" {
  if (result === "otp_verified") return "ok";
  if (result === "otp_sent" || result === "allowed") return "info";
  if (result === "blocked") return "danger";
  if (result === "invalid_code" || result === "provider_error") return "warning";
  return "default";
}

function actionLabel(action: Entry["action"]) {
  const labels: Record<Entry["action"], string> = {
    request_otp: "Kódkérés (request OTP)",
    verify_otp: "Kódellenőrzés (verify OTP)",
    session_block: "Munkamenet blokkolás (session block)",
  };
  return labels[action];
}

export default function DimproLoginAttemptsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, blocked: 0, successful: 0, uniqueBlockedEmails: 0, uniqueBlockedIps: 0 });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadEntries = useCallback(async (key: string) => {
    const cleanKey = key.trim();
    if (!cleanKey) {
      setMessage("Nincs aktív admin kulcs. Előbb jelentkezz be a BENJADMIN felületre.");
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
      setMessage("Belépési audit frissítve.");
      setPage(1);
    } catch {
      setMessage("Hálózati vagy szerverhiba történt.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedKey = localStorage.getItem("dimproLicenseAdminKey") || "";
    setAdminKey(storedKey);
    if (storedKey) void loadEntries(storedKey);
  }, [loadEntries]);

  const visibleEntries = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === "blocked" && entry.result !== "blocked") return false;
      if (filter === "successful" && entry.result !== "otp_verified") return false;
      if (!cleanQuery) return true;
      return [entry.email, entry.ipAddress, entry.userAgent, entry.host, entry.result, entry.message || "", entry.action]
        .some((value) => value.toLowerCase().includes(cleanQuery));
    });
  }, [entries, filter, query]);

  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedEntries = visibleEntries.slice((safePage - 1) * pageSize, safePage * pageSize);

  function updateFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updatePageSize(value: number) {
    setPageSize(value);
    setPage(1);
  }

  return (
    <BenjadminDataWorkspace
      eyebrow="BENJADMIN · AUDIT"
      title="DIMPRO belépési audit"
      description="E-mail-kódkérések, kódellenőrzések, tiltások és hozzáférési események. A részletes eseménytábla közvetlenül a szűrősáv alatt kezdődik."
      actions={(
        <button type="button" className="benjadmin-data-primary-action" onClick={() => void loadEntries(adminKey)} disabled={loading}>
          <RefreshCw size={16} className={loading ? "is-spinning" : ""} />
          {loading ? "Frissítés…" : "Frissítés"}
        </button>
      )}
      metrics={(
        <>
          <BenjadminMetric label="Összes esemény" value={summary.total} />
          <BenjadminMetric label="Tiltott" value={summary.blocked} tone={summary.blocked ? "danger" : "default"} />
          <BenjadminMetric label="Sikeres belépés" value={summary.successful} tone="ok" />
          <BenjadminMetric label="Tiltott e-mail" value={summary.uniqueBlockedEmails} tone={summary.uniqueBlockedEmails ? "warning" : "default"} />
          <BenjadminMetric label="Tiltott IP" value={summary.uniqueBlockedIps} tone={summary.uniqueBlockedIps ? "warning" : "default"} />
        </>
      )}
      toolbar={(
        <>
          <div className="benjadmin-data-filter-group" aria-label="Audit szűrők">
            <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => updateFilter("all")}>Mind</button>
            <button type="button" className={filter === "blocked" ? "is-active" : ""} onClick={() => updateFilter("blocked")}>Tiltott</button>
            <button type="button" className={filter === "successful" ? "is-active" : ""} onClick={() => updateFilter("successful")}>Sikeres</button>
          </div>
          <label className="benjadmin-data-search">
            <Search size={16} />
            <input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Keresés e-mail, IP, domain, eszköz vagy eredmény alapján" />
          </label>
          <div className="benjadmin-data-allowed" title={allowedEmails.join(", ") || "Nincs betöltött engedélyezési lista."}>
            <ShieldCheck size={15} />
            <span>Engedélyezett e-mail: <b>{allowedEmails.length}</b></span>
          </div>
        </>
      )}
      footer={(
        <>
          <span className="benjadmin-data-message">{message || "Valós idejű admin auditadatok."}</span>
          <BenjadminPagination page={safePage} pageSize={pageSize} total={visibleEntries.length} onPageChange={setPage} onPageSizeChange={updatePageSize} />
        </>
      )}
    >
      <div className="benjadmin-data-table-scroll">
        <table className="benjadmin-data-table" data-testid="benjadmin-audit-table">
          <thead>
            <tr>
              <th>Időpont</th>
              <th>E-mail</th>
              <th>Eredmény</th>
              <th>Művelet</th>
              <th>IP-cím</th>
              <th>Domain</th>
              <th>Böngésző / eszköz</th>
              <th>Részlet</th>
            </tr>
          </thead>
          <tbody>
            {pagedEntries.length === 0 ? (
              <tr><td colSpan={8} className="benjadmin-data-empty">Nincs megjeleníthető belépési esemény.</td></tr>
            ) : pagedEntries.map((entry, index) => (
              <tr key={`${entry.timestamp}-${entry.email}-${index}`}>
                <td className="is-nowrap">{formatDateTime(entry.timestamp)}</td>
                <td><strong>{entry.email}</strong></td>
                <td><BenjadminStatusPill tone={resultTone(entry.result)}>{resultLabel(entry.result)}</BenjadminStatusPill></td>
                <td>{actionLabel(entry.action)}</td>
                <td className="is-mono">{entry.ipAddress}</td>
                <td>{entry.host || "—"}</td>
                <td className="is-wide">{entry.userAgent || "—"}</td>
                <td className="is-wide">{entry.message || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BenjadminDataWorkspace>
  );
}
