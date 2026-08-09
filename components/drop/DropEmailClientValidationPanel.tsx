"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MailCheck,
  MonitorSmartphone,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type ValidationClient = { id: string; label: string };
type ValidationFile = { id: string; name: string; sizeBytes: number; isImage: boolean };
type ValidationPreview = {
  subject: string;
  browserHtml: string;
  files: ValidationFile[];
  previewCount: number;
  previewBytes: number;
  client: ValidationClient;
};
type ReviewStatus = "pending" | "passed" | "failed";
type ValidationRecord = {
  id: string;
  createdAt: string;
  recipientEmail: string;
  clientId: string;
  clientLabel: string;
  notes: string;
  sent: boolean;
  messageId?: string;
  sendError?: string;
  previewCount: number;
  previewBytes: number;
  reviewStatus: ReviewStatus;
  reviewedAt?: string;
  reviewNotes?: string;
};
type ValidationSafety = {
  adminOnly: boolean;
  explicitRecipientRequired: boolean;
  confirmationPhrase: string;
  sameRecipientCooldownSeconds: number;
  maximumDailyTestEmails: number;
  usesProductionTemplate: boolean;
  usesCidInlineAttachments: boolean;
  originalFilesAttached: boolean;
  realPackageAccessGranted: boolean;
  publicEndpoint: boolean;
};
type ValidationPayload = {
  ok: boolean;
  version: string;
  clients: ValidationClient[];
  preview: ValidationPreview;
  history: ValidationRecord[];
  safety: ValidationSafety;
  error?: string;
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100";

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} ${units[index]}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}

export default function DropEmailClientValidationPanel({ adminKey }: { adminKey: string }) {
  const [clients, setClients] = useState<ValidationClient[]>([]);
  const [selectedClient, setSelectedClient] = useState("gmail_web");
  const [preview, setPreview] = useState<ValidationPreview | null>(null);
  const [history, setHistory] = useState<ValidationRecord[]>([]);
  const [safety, setSafety] = useState<ValidationSafety | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("A kompatibilitási tesztközpont betöltése…");
  const headers = useMemo(() => ({
    "content-type": "application/json",
    "x-dimpro-license-admin-key": adminKey,
  }), [adminKey]);

  const load = useCallback(async (clientId: string) => {
    if (!adminKey) return;
    setBusy((current) => current || "load");
    try {
      const response = await fetch(`/api/drop/admin/email-validation?client=${encodeURIComponent(clientId)}`, {
        headers: { "x-dimpro-license-admin-key": adminKey },
        cache: "no-store",
      });
      const payload = await response.json() as ValidationPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Az e-mail kliensvalidáció nem tölthető be.");
      setClients(Array.isArray(payload.clients) ? payload.clients : []);
      setPreview(payload.preview);
      setHistory(Array.isArray(payload.history) ? payload.history : []);
      setSafety(payload.safety);
      setMessage("A tesztlevél előnézete elkészült. Küldés csak kézi címzettel és TESZT megerősítéssel történik.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A kompatibilitási tesztközpont nem tölthető be.");
    } finally {
      setBusy("");
    }
  }, [adminKey]);

  useEffect(() => {
    void load(selectedClient);
  }, [load, selectedClient]);

  function changeClient(clientId: string) {
    setSelectedClient(clientId);
  }

  async function sendTest() {
    if (busy) return;
    setBusy("send");
    setMessage("");
    try {
      const response = await fetch("/api/drop/admin/email-validation", {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipientEmail,
          clientId: selectedClient,
          notes,
          confirmation,
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; message?: string; record?: ValidationRecord };
      if (!response.ok || !payload.ok || !payload.record) throw new Error(payload.error || "A tesztlevél nem küldhető el.");
      setRecipientEmail("");
      setNotes("");
      setConfirmation("");
      setMessage(payload.message || "A kliensvalidációs tesztlevél elküldve.");
      await load(selectedClient);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A tesztküldés sikertelen.");
    } finally {
      setBusy("");
    }
  }

  async function review(record: ValidationRecord, reviewStatus: ReviewStatus) {
    if (busy) return;
    setBusy(`review:${record.id}`);
    try {
      const response = await fetch("/api/drop/admin/email-validation", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          id: record.id,
          reviewStatus,
          reviewNotes: reviewNotes[record.id] || "",
        }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; record?: ValidationRecord };
      if (!response.ok || !payload.ok || !payload.record) throw new Error(payload.error || "Az értékelés nem menthető.");
      setHistory((current) => current.map((item) => item.id === record.id ? payload.record as ValidationRecord : item));
      setMessage(reviewStatus === "passed" ? "A levelezőkliens megjelenítése megfelelőként rögzítve." : reviewStatus === "failed" ? "A megjelenítési hiba rögzítve." : "A teszt visszaállítva ellenőrzésre váró állapotra.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az értékelés mentése sikertelen.");
    } finally {
      setBusy("");
    }
  }

  const canSend = recipientEmail.trim().includes("@") && confirmation.trim().toUpperCase() === "TESZT" && !busy;

  return <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-violet-200 bg-white shadow-sm">
    <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-cyan-50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-800"><MailCheck size={23}/></span>
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-violet-700">DROP 1.2.11 · belső admineszköz</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">E-mail kliensvalidáció</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">A tényleges címzetti Drop-sablon, három CID-képelőnézet és két fájlkártya ellenőrzése Gmailben, Thunderbirdben, Outlookban és mobil levelezőkben.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load(selectedClient)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-black text-violet-900 disabled:opacity-50">
          {busy === "load" ? <LoaderCircle size={16} className="animate-spin"/> : <RefreshCw size={16}/>} Előnézet frissítése
        </button>
      </div>
    </div>

    <div className="p-5 sm:p-6">
      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold leading-6 text-violet-950">{message}</div>

      <div className="mt-5 grid gap-6 2xl:grid-cols-[minmax(320px,0.72fr)_minmax(560px,1.28fr)]">
        <div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex items-start gap-3"><ShieldCheck size={21} className="mt-0.5 shrink-0 text-emerald-700"/><div><h3 className="text-base font-black text-slate-950">Biztonságos tesztküldés</h3><p className="mt-1 text-sm leading-6 text-slate-600">Nincs előre kitöltött címzett és automatikus küldés. A tárgy minden esetben tesztként jelölt.</p></div></div>
            <div className="mt-4 grid gap-4">
              <label><span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">Vizsgált levelezőprogram</span><select value={selectedClient} onChange={(event) => changeClient(event.target.value)} className={inputClass}>{clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select></label>
              <label><span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">Tesztcímzett</span><input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value.slice(0, 254))} className={inputClass} placeholder="nev@example.hu" autoComplete="off"/></label>
              <label><span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">Teszt megjegyzése</span><textarea value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 500))} className={`${inputClass} min-h-24 resize-y`} placeholder="pl. Android Gmail sötét módban"/></label>
              <label><span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">Megerősítés: TESZT</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value.slice(0, 20))} className={inputClass} placeholder="TESZT" autoComplete="off"/></label>
            </div>
            <button type="button" onClick={() => void sendTest()} disabled={!canSend} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">
              {busy === "send" ? <LoaderCircle size={17} className="animate-spin"/> : <Send size={17}/>} Tesztlevél küldése
            </button>
            {safety ? <div className="mt-4 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2"><span>Azonos cím: {safety.sameRecipientCooldownSeconds} mp várakozás</span><span>Napi limit: {safety.maximumDailyTestEmails} teszt</span><span>Production sablon: igen</span><span>Eredeti fájl csatolása: nem</span></div> : null}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3"><MonitorSmartphone size={20} className="text-cyan-700"/><div><h3 className="text-sm font-black text-slate-950">Előnézeti tartalom</h3><p className="mt-1 text-xs text-slate-600">{preview ? `${preview.previewCount} inline kép · ${formatBytes(preview.previewBytes)} · ${preview.files.length} fájlkártya` : "Betöltés…"}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2">{preview?.files.map((file) => <span key={file.id} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${file.isImage ? "bg-cyan-50 text-cyan-800" : "bg-slate-100 text-slate-700"}`}>{file.name}</span>)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-white px-4 py-3"><div><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Böngészős ellenőrző előnézet</p><p className="mt-1 text-sm font-bold text-slate-900">{preview?.subject || "Levél betöltése…"}</p></div><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-800">{preview?.client.label || "–"}</span></div>
          {preview?.browserHtml ? <iframe title="DIMPRO Drop e-mail előnézet" srcDoc={preview.browserHtml} sandbox="" className="h-[760px] w-full border-0 bg-white"/> : <div className="grid h-[520px] place-items-center text-sm font-bold text-slate-500">Előnézet készítése…</div>}
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-violet-700">Validációs napló</p><h3 className="mt-1 text-lg font-black text-slate-950">Tesztküldések és eredmények</h3></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700">{history.length} rekord</span></div>
        <div className="mt-4 grid gap-3">{history.length ? history.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">{record.clientLabel}</strong><ReviewBadge status={record.reviewStatus}/>{record.sent ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800">Elküldve</span> : <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase text-rose-800">Küldési hiba</span>}</div><p className="mt-1 text-xs font-bold text-slate-600">{record.recipientEmail} · {formatDate(record.createdAt)}</p>{record.notes ? <p className="mt-2 text-xs leading-5 text-slate-600">{record.notes}</p> : null}{record.sendError ? <p className="mt-2 text-xs font-bold text-rose-700">{record.sendError}</p> : null}{record.reviewNotes ? <p className="mt-2 text-xs font-bold text-violet-800">Értékelés: {record.reviewNotes}</p> : null}</div><div className="text-xs font-bold text-slate-500">{record.previewCount} kép · {formatBytes(record.previewBytes)}</div></div>
          <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto]"><input value={reviewNotes[record.id] ?? record.reviewNotes ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [record.id]: event.target.value.slice(0, 500) }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-violet-400" placeholder="Megjelenítési megjegyzés"/><button type="button" onClick={() => void review(record, "passed")} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><CheckCircle2 size={14}/> Megfelelt</button><button type="button" onClick={() => void review(record, "failed")} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800"><XCircle size={14}/> Hibás</button><button type="button" onClick={() => void review(record, "pending")} disabled={Boolean(busy)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"><Clock3 size={14}/> Függőben</button></div>
        </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm font-bold text-slate-500">Még nincs tényleges tesztküldés. A böngészős előnézet küldés nélkül is használható.</div>}</div>
      </section>
    </div>
  </section>;
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  if (status === "passed") return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800">Megfelelt</span>;
  if (status === "failed") return <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase text-rose-800">Hibás</span>;
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">Ellenőrzésre vár</span>;
}
