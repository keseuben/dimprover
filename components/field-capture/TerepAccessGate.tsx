"use client";

import { KeyRound, LoaderCircle, MapPinned, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatDropSendCode,
  isCompleteDropSendCode,
  normalizeDropSendCode,
} from "@/app/lib/drop/public/dropSendCodeFormat";
import FieldCaptureShell from "./FieldCaptureShell";

type IdentityPayload = {
  ok?: boolean;
  error?: string;
  user?: { fullName: string; email: string; publicCode: string; organizationName?: string | null };
  entitlement?: { id: string; canUseStandardSend?: boolean; canUseQuickImageSend?: boolean };
  projects?: Array<{ id: string; publicCode: string; name: string; canUploadToDrop?: boolean }>;
  sendSession?: { token: string; expiresAt: string; entitlementId: string };
};

const STORAGE_KEY = "dimpro.drop.sendCode.v1";

export default function TerepAccessGate() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [identity, setIdentity] = useState<IdentityPayload | null>(null);

  async function verify(raw = code) {
    const normalized = normalizeDropSendCode(raw);
    if (!isCompleteDropSendCode(normalized) || loading) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/dimpro-identity/send/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: normalized, website: "terep" }),
      });
      const payload = await response.json() as IdentityPayload;
      if (!response.ok || !payload.ok || !payload.user || !payload.entitlement || !payload.sendSession?.token) {
        throw new Error(payload.error || "A DIMPRO jogosultság ellenőrzése sikertelen.");
      }
      if (!payload.entitlement.canUseStandardSend && !payload.entitlement.canUseQuickImageSend) {
        throw new Error("Ehhez a licenchez nincs aktív DIMPRO Send jogosultság.");
      }
      window.localStorage.setItem(STORAGE_KEY, normalized);
      setIdentity(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Terep jogosultság ellenőrzése sikertelen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = normalizeDropSendCode(window.localStorage.getItem(STORAGE_KEY) || "");
    if (!isCompleteDropSendCode(saved)) return;
    setCode(saved);
    window.setTimeout(() => void verify(saved), 0);
    // A Drop PWA korábban megjegyzett Send-kódját csak az első mountkor próbáljuk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (identity?.user && identity.sendSession) {
    return (
      <FieldCaptureShell
        identity={{
          user: identity.user,
          entitlementId: identity.sendSession.entitlementId,
          sessionToken: identity.sendSession.token,
          sessionExpiresAt: identity.sendSession.expiresAt,
          projects: identity.projects || [],
        }}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#eef5f7] px-4 py-8 text-slate-900 sm:px-6">
      <section className="mx-auto max-w-xl rounded-[2rem] border border-cyan-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,.08)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-cyan-300"><MapPinned size={23}/></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">DIMPRO Drop · Terep</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Terepi Gyorsrögzítő</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Ugyanaz a DIMPRO Send-jogosultság nyitja meg, mint a Gyors KépSendet. Külön Terep-licenc jelenleg nem szükséges.</p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-900">
          <ShieldCheck size={16} className="mr-2 inline"/>Központi Identity Core ellenőrzés · a Terep külön workflow, de ugyanazon Drop/Send licenc alatt.
        </div>
        <label className="mt-5 block">
          <span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">DIMPRO Send-kód</span>
          <input value={formatDropSendCode(code)} onChange={(event) => setCode(normalizeDropSendCode(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") void verify(); }} autoComplete="one-time-code" spellCheck={false} className="h-16 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-xl font-bold uppercase tracking-[.15em] outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder="ABCD-123-456"/>
        </label>
        {message ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-900">{message}</p> : null}
        <button type="button" onClick={() => void verify()} disabled={loading || !isCompleteDropSendCode(code)} className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">
          {loading ? <LoaderCircle size={17} className="animate-spin"/> : <KeyRound size={17}/>}
          {loading ? "Jogosultság ellenőrzése…" : "Terep megnyitása"}
        </button>
        <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-slate-500"><UserRound size={14}/>Ha a Drop PWA már megjegyezte a Send-kódot, a Terep automatikusan megpróbál belépni vele.</p>
      </section>
    </main>
  );
}
