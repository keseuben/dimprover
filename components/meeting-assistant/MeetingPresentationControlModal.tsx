"use client";

import { CheckCircle2, Clipboard, KeyRound, Loader2, Mail, RadioTower, RotateCcw, Send, Unplug, X } from "lucide-react";
import { useState } from "react";
import type { MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type ResponseData = {
  ok?: boolean;
  error?: string;
  pairing?: { code: string; formattedCode: string; expiresAt: string; recipientName: string; recipientEmail: string };
  emailSent?: boolean;
  emailError?: string;
  presentationToken?: string;
  presentation?: MeetingWorkspace["presentation"];
  presentationControl?: MeetingWorkspace["presentationControl"];
};

export default function MeetingPresentationControlModal({
  meetingId,
  accessToken,
  presentationToken,
  workspace,
  role,
  actorName,
  onTokenChange,
  onRefresh,
  onClose,
  setStatus,
}: {
  meetingId: string;
  accessToken: string;
  presentationToken: string;
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  actorName: string;
  onTokenChange: (token: string, controllerName: string) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  setStatus: (message: string) => void;
}) {
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [controllerName, setControllerName] = useState(actorName === "Résztvevő" ? "" : actorName);
  const [controllerEmail, setControllerEmail] = useState("");
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState<ResponseData["pairing"] | null>(null);
  const [emailState, setEmailState] = useState({ sent: false, error: "" });
  const [working, setWorking] = useState<"" | "create" | "consume" | "reclaim" | "release">("");
  const canIssue = role === "organizer" || role === "editor";
  const activeController = workspace.presentation.enabled ? workspace.presentation.controllerName : "";
  const isPresentationController = Boolean(presentationToken) && workspace.presentationControl.status === "active";

  async function request(operation: "create" | "consume" | "reclaim" | "release", payload: Record<string, unknown> = {}) {
    setWorking(operation);
    try {
      const response = await fetch("/api/meeting-assistant/presentation-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, accessToken: operation === "release" && presentationToken ? presentationToken : accessToken, presentationToken, operation, actorName, ...payload }),
      });
      const data = await readJsonResponse<ResponseData>(response, "A közös nézet vezérlésének kezelése sikertelen.");
      if (!response.ok || !data.ok) throw new Error(data.error || "A közös nézet vezérlésének kezelése sikertelen.");
      if (operation === "create") {
        setPairing(data.pairing || null);
        setEmailState({ sent: Boolean(data.emailSent), error: data.emailError || "" });
        setStatus(data.emailSent ? "A vezérlőkód privát e-mailben elküldve." : data.emailError ? `A kód elkészült, de az e-mail nem ment el: ${data.emailError}` : "A vezérlőkód elkészült. Másold ki és küldd el privát csatornán.");
      }
      if (operation === "consume" && data.presentationToken) {
        onTokenChange(data.presentationToken, controllerName.trim());
        setStatus("A közös nézet vezérlése aktiválva. Az élő követés a te navigációdat mutatja.");
        onClose();
      }
      if (operation === "reclaim") {
        onTokenChange("", "");
        setStatus("A szervező azonnal visszavette a közös nézet vezérlését.");
        onClose();
      }
      if (operation === "release") {
        onTokenChange("", "");
        setStatus("A közös nézet vezérlése elengedve.");
        onClose();
      }
      await onRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A közös nézet vezérlésének kezelése sikertelen.");
    } finally {
      setWorking("");
    }
  }

  async function copyCode() {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.formattedCode);
      setStatus("A hatjegyű vezérlőkód a vágólapra másolva.");
    } catch {
      setStatus(`Vezérlőkód: ${pairing.formattedCode}`);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Közös nézet vezérlése">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center gap-4 border-b border-slate-200 p-5"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800"><RadioTower size={24} /></span><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-950">Közös nézet vezérlése</h2><p className="mt-1 text-sm text-slate-500">Az élő követés ugyanazt a nyilvános modult és témakört mutatja a résztvevőknek, amelyben az aktív vezérlő dolgozik.</p></div><button type="button" onClick={onClose} title="Bezárás" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><X size={20} /></button></header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${workspace.presentation.enabled ? "bg-emerald-500" : "bg-slate-400"}`} /><div><div className="font-black text-slate-900">{workspace.presentation.enabled ? `Aktív vezérlő: ${activeController || "Szervező"}` : "Az élő követés jelenleg nincs bekapcsolva"}</div><div className="mt-1 text-sm text-slate-600">Mód: {workspace.presentation.mode === "follow" ? "Élő követés" : workspace.presentation.mode === "document" ? "Élő dokumentum" : "Rögzített nézet"} · Frissítés: {workspace.presentation.updatedAt ? new Date(workspace.presentation.updatedAt).toLocaleTimeString("hu-HU") : "-"}</div></div></div></section>

          {canIssue && <section className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4"><h3 className="flex items-center gap-2 text-base font-black text-slate-950"><KeyRound size={18} className="text-cyan-700" /> Egyszer használatos vezérlőkód létrehozása</h3><p className="mt-2 text-sm leading-6 text-slate-600">A kód csak a közös nézet navigációját adja át. Jegyzőkönyv-szerkesztési vagy szervezői jogot nem ad.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Címzett neve" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /><input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="Címzett e-mail-címe – privát küldéshez" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /></div><button type="button" onClick={() => void request("create", { recipientName, recipientEmail })} disabled={working !== ""} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{working === "create" ? <Loader2 size={17} className="animate-spin" /> : recipientEmail.trim() ? <Mail size={17} /> : <KeyRound size={17} />} Kód létrehozása{recipientEmail.trim() ? " és privát elküldése" : ""}</button>{pairing && <div className="mt-4 rounded-2xl border border-cyan-200 bg-white p-4"><div className="text-xs font-black uppercase tracking-[0.13em] text-cyan-700">Egyszer használatos vezérlőkód</div><div className="mt-2 flex flex-wrap items-center gap-3"><span className="text-4xl font-black tracking-[0.18em] text-slate-950">{pairing.formattedCode}</span><button type="button" onClick={() => void copyCode()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black"><Clipboard size={14} /> Másolás</button></div><div className="mt-2 text-sm text-slate-500">Érvényes: {new Date(pairing.expiresAt).toLocaleString("hu-HU")}</div>{emailState.sent && <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-sm font-semibold text-emerald-800"><CheckCircle2 size={16} /> Privát e-mail elküldve: {pairing.recipientEmail}</div>}{emailState.error && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">A kód elkészült, de az e-mail küldése nem sikerült: {emailState.error}</div>}</div>}</section>}

          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4"><h3 className="flex items-center gap-2 text-base font-black text-slate-950"><KeyRound size={18} className="text-indigo-700" /> Vezérlőkód aktiválása</h3><div className="mt-4 grid gap-2 sm:grid-cols-2"><input value={controllerName} onChange={(event) => setControllerName(event.target.value)} placeholder="Saját neved *" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /><input value={controllerEmail} onChange={(event) => setControllerEmail(event.target.value)} placeholder="E-mail – ha a kód e-mailhez kötött" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" /></div><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 számjegyű kód" className="mt-2 w-full rounded-xl border border-indigo-200 bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.2em]" /><button type="button" onClick={() => void request("consume", { code, controllerName, controllerEmail })} disabled={working !== "" || code.length !== 6 || !controllerName.trim()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{working === "consume" ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Vezérlés aktiválása</button></section>

          <div className="grid gap-2 sm:grid-cols-2">{role === "organizer" && workspace.presentation.controllerRole !== "organizer" && workspace.presentation.enabled && <button type="button" onClick={() => void request("reclaim")} disabled={working !== ""} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">{working === "reclaim" ? <Loader2 size={17} className="animate-spin" /> : <RotateCcw size={17} />} Vezérlés azonnali visszavétele</button>}{(isPresentationController || ((role === "organizer" || role === "editor") && workspace.presentation.enabled)) && <button type="button" onClick={() => void request("release")} disabled={working !== ""} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">{working === "release" ? <Loader2 size={17} className="animate-spin" /> : <Unplug size={17} />} Vezérlés elengedése</button>}</div>
        </div>
      </div>
    </div>
  );
}
