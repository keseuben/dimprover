"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, KeyRound, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";

type CentralLicense = {
  id: string;
  publicCode: string;
  ownerType: string;
  ownerName: string;
  ownerEmail: string;
  productCode: string;
  planCode: string;
  status: string;
  expiresAt: string;
  maxUsers: number;
  maxDevices: number;
  modules: string[];
  sendEntitlements: { total: number; active: number; usedThisMonth: number; limitThisMonth: number };
  updatedAt: string;
};

type LocalAiLicense = {
  id: string;
  companyId: string;
  companyName: string;
  status: string;
  expiresAt: string;
  enabledModules: string[];
  aiEnabled: boolean;
  aiMonthlyBudgetHuf: number;
  aiMaxSingleRequestHuf: number;
  aiUsersTotal: number;
  aiUsersEnabled: number;
  aiRequestsThisMonth: number;
  aiCostHufThisMonth: number;
  aiBudgetPercent: number;
  lastAiUsedAt: string;
  updatedAt: string;
};

type Snapshot = {
  generatedAt: string;
  summary: {
    centralLicenses: number;
    activeCentralLicenses: number;
    centralOrganizations: number;
    centralUsers: number;
    activeSendEntitlements: number;
    aiEnabledLicenses: number;
    aiRequestsThisMonth: number;
    aiCostHufThisMonth: number;
  };
  centralLicenses: CentralLicense[];
  localAiLicenses: LocalAiLicense[];
};

type Props = { query: string };

const PAGE_SIZE = 8;

function formatDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function formatHuf(value: number) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(value || 0) + " Ft";
}

function tone(status: string) {
  const value = status.toLowerCase();
  if (["active", "trial", "ready", "online"].includes(value)) return "is-ok";
  if (["blocked", "expired", "revoked", "failed"].includes(value)) return "is-danger";
  return "is-muted";
}

export default function BenjadminEntitlementsPanel({ query }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<"central" | "ai">("central");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    inFlight.current = true;
    if (!silent) setBusy(true);
    try {
      const response = await fetch("/api/dev/engine/entitlements", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { entitlements?: Snapshot; error?: string } | null;
      if (!response.ok || !payload?.entitlements) throw new Error(payload?.error || "A jogosultsági állapot nem tölthető be.");
      setSnapshot(payload.entitlements);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A jogosultsági állapot nem érhető el.");
    } finally {
      inFlight.current = false;
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => setPage(1), [mode, query]);

  const normalized = query.trim().toLocaleLowerCase("hu-HU");
  const centralRows = useMemo(() => (snapshot?.centralLicenses || []).filter((item) =>
    !normalized || [
      item.publicCode, item.ownerName, item.ownerEmail, item.productCode, item.planCode,
      item.status, item.modules.join(" "),
    ].join(" ").toLocaleLowerCase("hu-HU").includes(normalized)
  ), [snapshot?.centralLicenses, normalized]);

  const aiRows = useMemo(() => (snapshot?.localAiLicenses || []).filter((item) =>
    !normalized || [
      item.companyName, item.companyId, item.status, item.enabledModules.join(" "),
    ].join(" ").toLocaleLowerCase("hu-HU").includes(normalized)
  ), [snapshot?.localAiLicenses, normalized]);

  const rows = mode === "central" ? centralRows : aiRows;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="operator-entitlement-panel">
      <div className="operator-entitlement-summary">
        <div><KeyRound size={16} /><span>Központi licenc</span><strong>{snapshot?.summary.centralLicenses ?? "—"}</strong></div>
        <div><ShieldCheck size={16} /><span>Aktív licenc</span><strong>{snapshot?.summary.activeCentralLicenses ?? "—"}</strong></div>
        <div><WalletCards size={16} /><span>Aktív Send</span><strong>{snapshot?.summary.activeSendEntitlements ?? "—"}</strong></div>
        <div><Bot size={16} /><span>AI licencek</span><strong>{snapshot?.summary.aiEnabledLicenses ?? "—"}</strong></div>
        <div><Bot size={16} /><span>AI kérés / hó</span><strong>{snapshot?.summary.aiRequestsThisMonth ?? "—"}</strong></div>
        <div><WalletCards size={16} /><span>AI költség / hó</span><strong>{snapshot ? formatHuf(snapshot.summary.aiCostHufThisMonth) : "—"}</strong></div>
      </div>

      <div className="operator-table-card is-full">
        <div className="operator-table-title">
          <div>
            <span>M4 · LICENC / AI ENTITLEMENT</span>
            <h2>{mode === "central" ? "Központi licencek és moduljogok" : "AI keretek és felhasználás"}</h2>
          </div>
          <div className="operator-entitlement-actions">
            <button type="button" className={mode === "central" ? "is-active" : ""} onClick={() => setMode("central")}>Licencek</button>
            <button type="button" className={mode === "ai" ? "is-active" : ""} onClick={() => setMode("ai")}>AI keret</button>
            <button type="button" onClick={() => void load(false)} disabled={busy} title="Frissítés"><RefreshCw size={14} className={busy ? "is-spinning" : ""} /></button>
            <Link href="/admin/licenckozpont"><KeyRound size={14} /> Licencközpont</Link>
          </div>
        </div>

        {error ? <div className="operator-alert is-danger">{error}</div> : null}

        <div className="operator-table-wrap">
          {mode === "central" ? (
            <table className="operator-data-table">
              <thead><tr><th>Tulajdonos</th><th>Licenc</th><th>Termék / csomag</th><th>Modulok</th><th>Send</th><th>Keret</th><th>Állapot</th><th>Lejárat</th></tr></thead>
              <tbody>
                {(pageRows as CentralLicense[]).map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.ownerName}</strong><small>{item.ownerEmail || item.ownerType}</small></td>
                    <td><code>{item.publicCode || item.id}</code></td>
                    <td><strong>{item.productCode || "DIMPRO"}</strong><small>{item.planCode || "—"}</small></td>
                    <td><small>{item.modules.join(", ") || "nincs modul"}</small></td>
                    <td><strong>{item.sendEntitlements.active}/{item.sendEntitlements.total}</strong><small>{item.sendEntitlements.usedThisMonth}/{item.sendEntitlements.limitThisMonth || "∞"} / hó</small></td>
                    <td><strong>{item.maxUsers} fő</strong><small>{item.maxDevices} eszköz</small></td>
                    <td><span className={"operator-status-badge " + tone(item.status)}>{item.status || "—"}</span></td>
                    <td>{formatDate(item.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="operator-data-table">
              <thead><tr><th>Szervezet</th><th>AI</th><th>AI felhasználó</th><th>Kérések / hó</th><th>Költség / keret</th><th>Keret %</th><th>Max. kérés</th><th>Lejárat</th></tr></thead>
              <tbody>
                {(pageRows as LocalAiLicense[]).map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.companyName}</strong><small>{item.companyId}</small></td>
                    <td><span className={"operator-status-badge " + (item.aiEnabled ? "is-ok" : "is-muted")}>{item.aiEnabled ? "ENGEDÉLYEZVE" : "KIKAPCSOLVA"}</span></td>
                    <td>{item.aiUsersEnabled}/{item.aiUsersTotal}</td>
                    <td>{item.aiRequestsThisMonth}</td>
                    <td><strong>{formatHuf(item.aiCostHufThisMonth)}</strong><small>{formatHuf(item.aiMonthlyBudgetHuf)}</small></td>
                    <td><span className={"operator-status-badge " + (item.aiBudgetPercent >= 100 ? "is-danger" : item.aiBudgetPercent >= 80 ? "is-warning" : "is-ok")}>{item.aiBudgetPercent.toFixed(1)}%</span></td>
                    <td>{formatHuf(item.aiMaxSingleRequestHuf)}</td>
                    <td>{formatDate(item.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="operator-pagination">
          <span>{rows.length} rekord · {safePage}/{pageCount}. oldal</span>
          <div>
            <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>Előző</button>
            <button type="button" onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage >= pageCount}>Következő</button>
          </div>
        </div>
      </div>
    </div>
  );
}
