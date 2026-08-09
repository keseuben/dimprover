"use client";

import { Check, Clipboard, KeyRound, Loader2, Pencil, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingEditorAccess, MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type PairingResponse = {
  ok?: boolean;
  error?: string;
  role?: MeetingViewRole;
  editorAccessToken?: string;
  editorAccess?: MeetingEditorAccess;
  pairing?: {
    code: string;
    formattedCode: string;
    expiresAt: string;
    expiresInSeconds: number;
    recipientName: string;
    recipientEmail: string;
  };
};

type Props = {
  meetingId: string;
  accessToken: string;
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  actorName: string;
  onClose: () => void;
  onWorkspaceRefresh: () => Promise<void> | void;
  onEditorActivated: (token: string, editorName: string) => void;
  onEditorLeft: () => void;
  setStatus: (message: string) => void;
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MeetingEditorAccessModal({
  meetingId,
  accessToken,
  workspace,
  role,
  actorName,
  onClose,
  onWorkspaceRefresh,
  onEditorActivated,
  onEditorLeft,
  setStatus,
}: Props) {
  const [recipientName, setRecipientName] = useState(workspace.editorAccess.editorName || "");
  const [recipientEmail, setRecipientEmail] = useState(workspace.editorAccess.editorEmail || "");
  const [editorName, setEditorName] = useState(role === "editor" ? workspace.editorAccess.editorName : "");
  const [editorEmail, setEditorEmail] = useState(role === "editor" ? workspace.editorAccess.editorEmail : "");
  const [code, setCode] = useState("");
  const [generated, setGenerated] = useState<PairingResponse["pairing"] | null>(null);
  const [working, setWorking] = useState(false);
  const active = workspace.editorAccess.status === "active" && Boolean(workspace.editorAccess.editorName);
  const pending = workspace.editorAccess.status === "pending";
  const codeDigits = useMemo(() => code.replace(/\D/g, "").slice(0, 6), [code]);

  async function call(operation: "create" | "consume" | "revoke" | "leave", extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/meeting-assistant/editor-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId, accessToken, operation, actorName, ...extra }),
    });
    const data = await readJsonResponse<PairingResponse>(response, "A szerkesztői jogosultság kezelése sikertelen.");
    if (!response.ok || !data.ok) throw new Error(data.error || "A szerkesztői jogosultság kezelése sikertelen.");
    return data;
  }

  async function createCode() {
    setWorking(true);
    try {
      const data = await call("create", { recipientName, recipientEmail });
      setGenerated(data.pairing || null);
      setStatus("A szerkesztői párosítókód elkészült. A kód 10 percig és egyszer használható.");
      await onWorkspaceRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A párosítókód létrehozása sikertelen.");
    } finally {
      setWorking(false);
    }
  }

  async function consumeCode() {
    if (codeDigits.length !== 6) {
      setStatus("A szerkesztői kód 6 számjegyű.");
      return;
    }
    if (!editorName.trim()) {
      setStatus("Add meg a jegyzőkönyv-szerkesztő nevét.");
      return;
    }
    setWorking(true);
    try {
      const data = await call("consume", { code: codeDigits, editorName, editorEmail });
      if (!data.editorAccessToken) throw new Error("A szerkesztői token nem érkezett meg.");
      onEditorActivated(data.editorAccessToken, editorName.trim());
      setStatus("A jegyzőkönyv-szerkesztői mód aktív.");
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A szerkesztői mód aktiválása sikertelen.");
    } finally {
      setWorking(false);
    }
  }

  async function revokeOrLeave() {
    setWorking(true);
    try {
      await call(role === "organizer" ? "revoke" : "leave");
      if (role === "editor") onEditorLeft();
      await onWorkspaceRefresh();
      setStatus(role === "organizer" ? "A szerkesztési jog visszavonva." : "A szerkesztői mód elhagyva.");
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A jogosultság visszavonása sikertelen.");
    } finally {
      setWorking(false);
    }
  }

  async function copyCode() {
    if (!generated?.formattedCode) return;
    try {
      await navigator.clipboard.writeText(generated.formattedCode);
      setStatus("A szerkesztői kód a vágólapra másolva.");
    } catch {
      setStatus("A kód nem másolható automatikusan. Jelöld ki és másold ki kézzel.");
    }
  }

  return (
    <div className="fixed inset-0 z-[16000] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm">
      <section className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <header className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800"><Pencil size={21} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-slate-950">Jegyzőkönyv-szerkesztés átadása</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">A szerkesztő csak a megosztott értekezleti tartalmat módosíthatja. A lezárás, közzététel és archiválás a szervezőnél marad.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500"><X size={16} /></button>
        </header>

        {active && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-emerald-900"><UserRoundCheck size={18} /> Aktív jegyzőkönyv-szerkesztő</div>
            <div className="mt-2 text-sm font-black text-slate-900">{workspace.editorAccess.editorName}</div>
            {workspace.editorAccess.editorEmail && <div className="text-[11px] text-slate-600">{workspace.editorAccess.editorEmail}</div>}
            <div className="mt-2 text-[10px] text-slate-600">Aktiválva: {formatDate(workspace.editorAccess.activatedAt)} · Lejárat: {formatDate(workspace.editorAccess.accessExpiresAt)}</div>
            {role !== "participant" && <button type="button" onClick={() => void revokeOrLeave()} disabled={working} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">
              {working ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              {role === "organizer" ? "Szerkesztési jog visszavonása" : "Szerkesztői mód elhagyása"}
            </button>}
          </div>
        )}

        {role === "organizer" && !active && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-teal-950"><KeyRound size={17} /> Egyszer használatos kód létrehozása</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-black text-slate-700">Átvevő neve<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} className="mt-1 w-full rounded-lg border border-teal-200 bg-white px-3 py-2.5 text-[11px] font-semibold" placeholder="Pl. Nagy László" /></label>
              <label className="text-[10px] font-black text-slate-700">Céges e-mail – opcionális<input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-teal-200 bg-white px-3 py-2.5 text-[11px] font-semibold" placeholder="nev@ceg.hu" /></label>
            </div>
            <button type="button" onClick={() => void createCode()} disabled={working} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[11px] font-black text-white disabled:opacity-50">
              {working ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Szerkesztői kód létrehozása
            </button>

            {(generated || pending) && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-center">
                <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Szerkesztői párosítókód</div>
                {generated ? (
                  <>
                    <div className="mt-2 font-mono text-3xl font-black tracking-[0.18em] text-teal-800">{generated.formattedCode}</div>
                    <div className="mt-2 text-[10px] font-semibold text-slate-500">Érvényes: {formatDate(generated.expiresAt)} · egyszer használható</div>
                    <button type="button" onClick={() => void copyCode()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[10px] font-black text-teal-800"><Clipboard size={13} /> Kód másolása</button>
                  </>
                ) : (
                  <div className="mt-2 text-[11px] font-semibold text-slate-600">Korábban létrehozott kód vár aktiválásra. Új kód készítésével a régi kód felülíródik.</div>
                )}
              </div>
            )}
          </div>
        )}

        {role === "participant" && !active && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-indigo-950"><Pencil size={17} /> Szerkesztői mód aktiválása</div>
            <label className="mt-3 block text-[10px] font-black text-slate-700">Név<input value={editorName} onChange={(event) => setEditorName(event.target.value)} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-[11px] font-semibold" placeholder="Saját név" /></label>
            <label className="mt-2 block text-[10px] font-black text-slate-700">E-mail – ha a szervező megadta<input type="email" value={editorEmail} onChange={(event) => setEditorEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-[11px] font-semibold" placeholder="nev@ceg.hu" /></label>
            <label className="mt-2 block text-[10px] font-black text-slate-700">6 számjegyű kód<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter") void consumeCode(); }} inputMode="numeric" autoComplete="one-time-code" className="mt-1 w-full rounded-lg border border-indigo-300 bg-white px-3 py-3 text-center font-mono text-2xl font-black tracking-[0.22em] text-indigo-950" placeholder="000000" /></label>
            <button type="button" onClick={() => void consumeCode()} disabled={working || codeDigits.length !== 6} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-[11px] font-black text-white disabled:opacity-40">
              {working ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Szerkesztői mód aktiválása
            </button>
          </div>
        )}

        {role === "editor" && !active && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[11px] font-semibold text-amber-900">A szerkesztői jogosultság lejárt vagy visszavonták. A panel résztvevői módra fog visszaállni.</div>
        )}
      </section>
    </div>
  );
}
