"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Coins, LoaderCircle, ShieldCheck, X } from "lucide-react";

type Props = {
  adminKey: string;
  licenseId: string;
  membershipId: string;
  userName: string;
  currentModule?: { enabled: boolean; limits?: Record<string, unknown> } | null;
  licenseFeatureFlags?: Record<string, unknown>;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
};

type Draft = {
  enabled: boolean;
  monthlyBudgetHuf: number;
  maxRequestsPerDay: number;
  maxRequestsPerMonth: number;
  accessExpiresAt: string;
  allowedScopes: string[];
  allowedFeatures: string[];
};

const FEATURES = [
  ["daily_plan", "Mai feladatok rangsorolása"],
  ["next_step", "Következő lépés"],
  ["task_breakdown", "Feladat bontása"],
  ["waiting_email", "Visszakérdező levél"],
  ["meeting_agenda", "Értekezleti napirend"],
  ["weekly_summary", "Heti összefoglaló"],
  ["decision_support", "Döntési összefoglaló"],
  ["document_extract", "Dokumentum-adatkinyerés"],
] as const;

const SCOPES = [
  ["personal", "Személyes munkatér"],
  ["hage", "Szervezeti / HAGE munkatér"],
] as const;

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function localDateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function stringArray(value: unknown, allowed: readonly string[], fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const allow = new Set(allowed);
  return [...new Set(value.map(String).map((item) => item.trim().toLowerCase()).filter((item) => allow.has(item)))];
}

function makeDraft(currentModule: Props["currentModule"], licenseFeatureFlags: Record<string, unknown>): Draft {
  const limits = currentModule?.limits && typeof currentModule.limits === "object" ? currentModule.limits : {};
  const enabledFeatures = FEATURES.map(([key]) => key).filter((key) => licenseFeatureFlags[key] !== false);
  return {
    enabled: currentModule?.enabled !== false,
    monthlyBudgetHuf: positiveInteger(limits.monthlyBudgetHuf),
    maxRequestsPerDay: positiveInteger(limits.maxRequestsPerDay),
    maxRequestsPerMonth: positiveInteger(limits.maxRequestsPerMonth),
    accessExpiresAt: localDateTime(limits.accessExpiresAt),
    allowedScopes: stringArray(limits.allowedScopes, SCOPES.map(([key]) => key), SCOPES.map(([key]) => key)),
    allowedFeatures: stringArray(limits.allowedFeatures, enabledFeatures, enabledFeatures),
  };
}

export default function MembershipAiPolicyEditor(props: Props) {
  const licenseFeatureFlags = useMemo(() => props.licenseFeatureFlags || {}, [props.licenseFeatureFlags]);
  const [draft, setDraft] = useState<Draft>(() => makeDraft(props.currentModule, licenseFeatureFlags));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(makeDraft(props.currentModule, licenseFeatureFlags));
    setMessage("");
  }, [licenseFeatureFlags, props.currentModule, props.membershipId]);

  function toggleList(key: "allowedScopes" | "allowedFeatures", value: string) {
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
    }));
  }

  async function save() {
    if (busy) return;
    if (draft.enabled && draft.allowedScopes.length === 0) {
      setMessage("Legalább egy AI munkaterületet engedélyezni kell.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/dimpro-identity/admin/membership-ai-policy", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": props.adminKey },
        body: JSON.stringify({
          licenseId: props.licenseId,
          membershipId: props.membershipId,
          enabled: draft.enabled,
          monthlyBudgetHuf: draft.monthlyBudgetHuf,
          maxRequestsPerDay: draft.maxRequestsPerDay,
          maxRequestsPerMonth: draft.maxRequestsPerMonth,
          accessExpiresAt: draft.accessExpiresAt ? new Date(draft.accessExpiresAt).toISOString() : null,
          allowedScopes: draft.allowedScopes,
          allowedFeatures: draft.allowedFeatures,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A felhasználói AI-policy nem menthető.");
      setMessage("A névre szóló AI-jogosultság és keretek mentve.");
      await props.onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A felhasználói AI-policy mentése sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="benjadmin-member-ai-policy" data-testid="benjadmin-member-ai-policy">
      <header>
        <div><span>FELHASZNÁLÓI AI-POLICY</span><strong>{props.userName}</strong></div>
        <button type="button" onClick={props.onClose} aria-label="AI-policy bezárása"><X size={17} /></button>
      </header>

      <div className="benjadmin-member-ai-policy__body">
        <div className="benjadmin-member-ai-policy__notice">
          <ShieldCheck size={17} />
          <div><strong>Identity Core tagsági jogosultság</strong><span>A beállítás az `AI_ASSISTANT` tagsági modul `limits` mezőjébe kerül. A központi licenc keretét csak szűkítheti; tiltott licencfunkciót nem engedélyezhet vissza.</span></div>
        </div>

        <label className="benjadmin-member-ai-policy__master"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><Bot size={17} /><span><strong>Névre szóló AI-hozzáférés</strong><small>{draft.enabled ? "Engedélyezve" : "Kikapcsolva"}</small></span></label>

        <div className="benjadmin-member-ai-policy__grid">
          <label><span>Havi felhasználói AI-keret (Ft)</span><input type="number" min={0} step={100} value={draft.monthlyBudgetHuf} onChange={(event) => setDraft((current) => ({ ...current, monthlyBudgetHuf: positiveInteger(event.target.value) }))} /><small>0 = nincs külön felhasználói költséglimit</small></label>
          <label><span>Napi AI-kérések</span><input type="number" min={0} step={1} value={draft.maxRequestsPerDay} onChange={(event) => setDraft((current) => ({ ...current, maxRequestsPerDay: positiveInteger(event.target.value) }))} /><small>0 = nincs napi kérésszám-limit</small></label>
          <label><span>Havi AI-kérések</span><input type="number" min={0} step={1} value={draft.maxRequestsPerMonth} onChange={(event) => setDraft((current) => ({ ...current, maxRequestsPerMonth: positiveInteger(event.target.value) }))} /><small>0 = nincs havi kérésszám-limit</small></label>
          <label><span>AI-hozzáférés lejárata</span><input type="datetime-local" value={draft.accessExpiresAt} onChange={(event) => setDraft((current) => ({ ...current, accessExpiresAt: event.target.value }))} /><small>Üresen hagyva nincs külön tagsági AI-lejárat</small></label>
        </div>

        <section className="benjadmin-member-ai-policy__section">
          <header><strong>Munkaterek</strong><span>legalább egy szükséges</span></header>
          <div className="benjadmin-member-ai-policy__checks">{SCOPES.map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.allowedScopes.includes(key)} onChange={() => toggleList("allowedScopes", key)} />{label}</label>)}</div>
        </section>

        <section className="benjadmin-member-ai-policy__section">
          <header><strong>Engedélyezett AI-funkciók</strong><span>licencszintű tiltás elsőbbséget élvez</span></header>
          <div className="benjadmin-member-ai-policy__checks">{FEATURES.map(([key, label]) => {
            const licenseAllowed = licenseFeatureFlags[key] !== false;
            return <label key={key} className={!licenseAllowed ? "is-disabled" : ""}><input type="checkbox" disabled={!licenseAllowed} checked={licenseAllowed && draft.allowedFeatures.includes(key)} onChange={() => toggleList("allowedFeatures", key)} />{label}</label>;
          })}</div>
        </section>

        {message ? <p className="benjadmin-member-ai-policy__message">{message}</p> : null}
        <footer>
          <div><Coins size={16} /><span>A keretek csak valós használati költséggel együtt értelmezendők.</span></div>
          <button type="button" onClick={() => void save()} disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} AI-policy mentése</button>
        </footer>
      </div>
    </section>
  );
}
