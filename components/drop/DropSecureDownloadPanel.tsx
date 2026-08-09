"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, ExternalLink, FileArchive, FileCheck2, FileText, Image as ImageIcon, LoaderCircle, Printer, ShieldCheck, Square } from "lucide-react";

type DownloadFile = {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string | null;
  readyAt: string | null;
  comments: string[];
  previewUrl: string | null;
  groupId: string | null;
  groupName: string | null;
  groupSortOrder: number;
};

type DownloadResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  download?: { url?: string; expiresAt?: string };
};

type TransferSummary = {
  senderName: string;
  subject: string;
  recipients: Array<{ name: string; email: string }>;
  showRecipients: boolean;
  senderMessage: string;
  packageNote: string;
  workflowType: string;
};

type Message = { type: "success" | "error" | "info"; text: string };
type ZipStage = "idle" | "selecting" | "preparing" | "streaming" | "completed" | "cancelled" | "error";

type DropWritableFileStream = {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort?: (reason?: unknown) => Promise<void>;
};

type DropFileHandle = {
  createWritable: () => Promise<DropWritableFileStream>;
};

type DropFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<DropFileHandle>;
};


type DownloadGroup = { key: string; name: string; sortOrder: number; files: DownloadFile[]; ungrouped: boolean };

function buildDownloadGroups(files: DownloadFile[]): DownloadGroup[] {
  const byKey = new Map<string, DownloadGroup>();
  for (const file of files) {
    const named = Boolean(file.groupId && file.groupName?.trim());
    const key = named ? `group:${file.groupId}` : "__ungrouped__";
    const current = byKey.get(key);
    if (current) { current.files.push(file); continue; }
    byKey.set(key, {
      key,
      name: named ? file.groupName!.trim() : "Csoport nélkül",
      sortOrder: named && Number.isFinite(file.groupSortOrder) ? file.groupSortOrder : Number.MAX_SAFE_INTEGER,
      files: [file],
      ungrouped: !named,
    });
  }
  return Array.from(byKey.values()).sort((left, right) => {
    if (left.ungrouped !== right.ungrouped) return left.ungrouped ? 1 : -1;
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.name.localeCompare(right.name, "hu-HU");
  });
}

function groupDomId(index: number) { return `drop-download-group-${index + 1}`; }

const LARGE_ZIP_BYTES = 250 * 1024 * 1024;

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount.toLocaleString("hu-HU", { maximumFractionDigits: exponent === 0 ? 0 : 1 })} ${units[exponent]}`;
}

function createZipRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function safeSuggestedZipName(subject: string, brandPrefix: boolean) {
  const safe = (subject || "Drop csomag")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Drop csomag";
  return `${brandPrefix ? "DIMPRO_" : ""}${safe}.zip`;
}

function contentDispositionFilename(value: string | null) {
  if (!value) return "";
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* fallback below */ }
  }
  return value.match(/filename="([^"]+)"/i)?.[1] || "";
}

function browserDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "DIMPRO_Drop_csomag.zip";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function DropSecureDownloadPanel({ rawToken, files, transfer }: { rawToken: string; files: DownloadFile[]; transfer?: TransferSummary | null }) {
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [zipStage, setZipStage] = useState<ZipStage>("idle");
  const [zipElapsed, setZipElapsed] = useState(0);
  const [zipBrandPrefix, setZipBrandPrefix] = useState(false);
  const [zipIncludePdf, setZipIncludePdf] = useState(false);
  const [zipIncludeTxt, setZipIncludeTxt] = useState(true);
  const [pdfImagesPerPage, setPdfImagesPerPage] = useState<1 | 2 | 4 | 6>(4);
  const [reportBusy, setReportBusy] = useState<"pdf" | "txt" | null>(null);
  const zipStartedAtRef = useRef(0);
  const zipAbortRef = useRef<AbortController | null>(null);
  const zipWritableRef = useRef<DropWritableFileStream | null>(null);
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.sizeBytes, 0), [files]);
  const downloadGroups = useMemo(() => buildDownloadGroups(files), [files]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const largeZip = totalBytes >= LARGE_ZIP_BYTES || files.length >= 100;
  const zipBusy = zipStage === "selecting" || zipStage === "preparing" || zipStage === "streaming";

  useEffect(() => {
    if (!zipBusy || zipStage === "selecting") return;
    const interval = window.setInterval(() => {
      setZipElapsed(Math.max(0, Math.floor((Date.now() - zipStartedAtRef.current) / 1000)));
    }, 500);
    return () => window.clearInterval(interval);
  }, [zipBusy, zipStage]);

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function navigateToGroup(key: string, index: number) {
    setCollapsedGroups((current) => { const next = new Set(current); next.delete(key); return next; });
    window.setTimeout(() => document.getElementById(groupDomId(index))?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  useEffect(() => () => {
    zipAbortRef.current?.abort();
    void zipWritableRef.current?.abort?.("A letöltőoldal bezárult.").catch(() => undefined);
  }, []);

  async function startDownload(file: DownloadFile) {
    if (activeFileId) return;
    setActiveFileId(file.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/drop/downloads/file/${encodeURIComponent(file.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token: rawToken }),
      });
      const payload = await response.json().catch(() => ({})) as DownloadResponse;
      if (!response.ok || !payload.ok || !payload.download?.url) {
        throw new Error(payload.error || "A biztonságos letöltési hivatkozás nem hozható létre.");
      }
      setMessage({ type: "success", text: `A(z) „${file.name}” letöltése elindult.` });
      const anchor = document.createElement("a");
      anchor.href = payload.download.url;
      anchor.rel = "noopener noreferrer";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "A fájl letöltése sikertelen.",
      });
    } finally {
      setActiveFileId(null);
    }
  }

  async function downloadPackageReport(kind: "pdf" | "txt") {
    if (reportBusy || zipBusy) return;
    setReportBusy(kind); setMessage(null);
    try {
      const response = await fetch(`/api/drop/downloads/package/${kind === "pdf" ? "report" : "text"}`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ token: rawToken, ...(kind === "pdf" ? { imagesPerPage: pdfImagesPerPage } : {}) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "A dokumentum nem készíthető el.");
      }
      const filename = contentDispositionFilename(response.headers.get("content-disposition")) || (kind === "pdf" ? "DIMPRO_DROP_csomagriport.pdf" : "DIMPRO_DROP_megjegyzesek.txt");
      browserDownloadBlob(await response.blob(), filename);
      setMessage({ type: "success", text: kind === "pdf" ? "A nyomtatóbarát PDF-riport letöltése elindult." : "A UTF-8 TXT megjegyzés-export letöltése elindult." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "A dokumentum letöltése sikertelen." });
    } finally { setReportBusy(null); }
  }

  async function cancelZipDownload() {
    zipAbortRef.current?.abort();
    zipAbortRef.current = null;
    await zipWritableRef.current?.abort?.("A felhasználó megszakította a ZIP-letöltést.").catch(() => undefined);
    zipWritableRef.current = null;
    setZipStage("cancelled");
    setMessage({ type: "info", text: "A ZIP-letöltést megszakította. A folyamat leállt; újraindítható, ha mégis szüksége van rá." });
  }

  async function startZipDownload() {
    if (zipBusy) return;
    setMessage(null);
    setZipElapsed(0);
    const picker = (window as DropFilePickerWindow).showSaveFilePicker;
    let fileHandle: DropFileHandle | null = null;
    const suggestedName = safeSuggestedZipName(transfer?.subject || "Drop csomag", zipBrandPrefix);

    if (picker) {
      setZipStage("selecting");
      try {
        fileHandle = await picker({
          suggestedName,
          types: [{ description: "ZIP-csomag", accept: { "application/zip": [".zip"] } }],
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setZipStage("idle");
          setMessage({ type: "info", text: "A mentést megszakította. A ZIP szerveroldali elkészítése nem indult el." });
          return;
        }
        setZipStage("error");
        setMessage({ type: "error", text: error instanceof Error ? error.message : "A mentési hely nem választható ki." });
        return;
      }
    }

    const requestId = createZipRequestId();
    const controller = new AbortController();
    zipAbortRef.current = controller;
    zipStartedAtRef.current = Date.now();
    setZipStage("preparing");
    setMessage({
      type: "info",
      text: largeZip
        ? "A nagy ZIP-csomag szerveroldali összeállítása elindult. A folyamat a Megszakítás gombbal leállítható."
        : "A ZIP-csomag összeállítása elindult. A folyamat a Megszakítás gombbal leállítható.",
    });

    try {
      const response = await fetch("/api/drop/downloads/package/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ token: rawToken, requestId, brandPrefix: zipBrandPrefix, includePdf: zipIncludePdf, includeTxt: zipIncludeTxt, pdfImagesPerPage }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "A ZIP-csomag nem készíthető el.");
      }

      const serverFilename = contentDispositionFilename(response.headers.get("content-disposition")) || suggestedName;
      setZipStage("streaming");
      setMessage({ type: "info", text: "A ZIP elkészült, a letöltési adatfolyam átvitele folyamatban van." });

      if (fileHandle && response.body) {
        const writable = await fileHandle.createWritable();
        zipWritableRef.current = writable;
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) throw new DOMException("A letöltés megszakítva.", "AbortError");
          if (value) await writable.write(value);
        }
        await writable.close();
        zipWritableRef.current = null;
      } else {
        const blob = await response.blob();
        if (controller.signal.aborted) throw new DOMException("A letöltés megszakítva.", "AbortError");
        browserDownloadBlob(blob, serverFilename);
      }

      setZipStage("completed");
      setMessage({ type: "success", text: "A ZIP-csomag letöltése befejeződött." });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        setZipStage("cancelled");
        setMessage({ type: "info", text: "A ZIP-letöltést megszakította. A folyamat leállt." });
      } else {
        setZipStage("error");
        setMessage({ type: "error", text: error instanceof Error ? error.message : "A ZIP-letöltés sikertelen." });
      }
      await zipWritableRef.current?.abort?.(error).catch(() => undefined);
      zipWritableRef.current = null;
    } finally {
      zipAbortRef.current = null;
    }
  }

  const zipStatusText = zipStage === "selecting"
    ? "Válassza ki a mentési helyet. A szerver még nem kezdte el a ZIP elkészítését."
    : zipStage === "preparing"
      ? `A ZIP előkészítése folyamatban, eltelt idő: ${zipElapsed} másodperc.`
      : zipStage === "streaming"
        ? `A ZIP adatfolyam átvitele folyamatban, eltelt idő: ${zipElapsed} másodperc.`
        : zipStage === "completed"
          ? "A ZIP letöltése befejeződött."
          : zipStage === "cancelled"
            ? "A ZIP letöltése megszakítva."
            : zipStage === "error"
              ? "A ZIP letöltése hibával leállt."
              : "";

  return (
    <section className="mt-6 rounded-3xl border border-cyan-200 bg-cyan-50/60 p-5 sm:p-6" aria-labelledby="drop-secure-download-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-800">
            <ShieldCheck size={20} aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-[0.16em]">Ellenőrzött letöltési kapu</p>
          </div>
          <h2 id="drop-secure-download-title" className="mt-2 text-xl font-black text-slate-950">Vírusellenőrzött fájlok</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Csak a teljes ClamAV-vizsgálaton átment, SHA-256 ellenőrzőösszeggel lezárt fájlok tölthetők le. Minden letöltési hivatkozás rövid ideig érvényes és auditálva van.
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-3 py-2 text-xs font-black text-lime-900">
          <CheckCircle2 size={16} aria-hidden="true" /> {files.length} tiszta fájl
        </div>
      </div>

      {transfer && transfer.workflowType === "send" ? (
        <div className="mt-5 rounded-2xl border border-cyan-200 bg-white p-4 sm:p-5">
          <p className="text-base text-slate-800"><strong className="text-slate-950">{transfer.senderName}</strong> fájlokat küldött Önnek.</p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="grid gap-1 sm:grid-cols-[110px_minmax(0,1fr)]"><dt className="font-black text-slate-600">Tárgy:</dt><dd className="font-semibold text-slate-900">{transfer.subject || "–"}</dd></div>
            {transfer.showRecipients ? <div className="grid gap-1 sm:grid-cols-[110px_minmax(0,1fr)]"><dt className="font-black text-slate-600">Címzettek:</dt><dd className="space-y-1 font-semibold text-slate-900">{transfer.recipients.length ? transfer.recipients.map((recipient) => <div key={`${recipient.email}-${recipient.name}`}>{recipient.name} <span className="font-medium text-slate-600">&lt;{recipient.email}&gt;</span></div>) : "–"}</dd></div> : null}
            <div className="grid gap-1 sm:grid-cols-[110px_minmax(0,1fr)]"><dt className="font-black text-slate-600">Üzenet:</dt><dd className="whitespace-pre-wrap font-semibold text-slate-900">{transfer.senderMessage || "–"}</dd></div>
            {transfer.packageNote ? <div className="grid gap-1 sm:grid-cols-[110px_minmax(0,1fr)]"><dt className="font-black text-slate-600">Megjegyzés:</dt><dd className="whitespace-pre-wrap font-semibold text-slate-900">{transfer.packageNote}</dd></div> : null}
          </dl>
        </div>
      ) : null}

      {downloadGroups.length ? <div className="mt-5 rounded-2xl border border-cyan-200 bg-white p-4 sm:p-5"><p className="text-[10px] font-black uppercase tracking-[.12em] text-cyan-800">Csoportok összesítője</p><p className="mt-1 text-xs leading-5 text-slate-600">A csoportokra kattintva közvetlenül a lenti tartalomhoz ugrik. Minden csoport alapértelmezetten nyitva van.</p><div className="mt-3 flex flex-wrap gap-2">{downloadGroups.map((group, index) => <button key={group.key} type="button" onClick={() => navigateToGroup(group.key, index)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-slate-900"><span>{group.name}</span><span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] text-cyan-950">{group.files.length} kép/fájl</span></button>)}</div></div> : null}

      {files.length ? <div className="mt-5 rounded-2xl border border-sky-200 bg-white p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-sky-800"><Printer size={18}/><p className="text-xs font-black uppercase tracking-[.14em]">Dokumentáció és továbbhasználás</p></div><h3 className="mt-1 text-base font-black text-slate-950">PDF csomagriport és TXT megjegyzés-export</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">A PDF a képeket és a hozzájuk tartozó megjegyzéseket nyomtatóbarát formában rendezi. Többképes elrendezésnél fekvő A4 készül. A riportképek külön optimalizálva kerülnek a PDF-be, így nem az eredeti többmegabájtos fotók növelik a dokumentum méretét.</p></div><div className="grid shrink-0 gap-2 sm:grid-cols-[180px_1fr_1fr]"><label><span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-sky-800">PDF elrendezés</span><select value={pdfImagesPerPage} onChange={(event) => setPdfImagesPerPage(Number(event.target.value) as 1 | 2 | 4 | 6)} disabled={Boolean(reportBusy) || zipBusy} className="h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-xs font-black text-slate-800"><option value={1}>Részletes · 1 kép / oldal</option><option value={2}>Kompakt · 2 kép / oldal</option><option value={4}>Áttekintő · 4 kép / oldal</option><option value={6}>Gyors · 6 kép / oldal</option></select></label><button type="button" onClick={() => void downloadPackageReport("pdf")} disabled={Boolean(reportBusy) || zipBusy} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 py-2.5 text-xs font-black text-white disabled:bg-slate-300">{reportBusy === "pdf" ? <LoaderCircle size={16} className="animate-spin"/> : <Printer size={16}/>} PDF-riport</button><button type="button" onClick={() => void downloadPackageReport("txt")} disabled={Boolean(reportBusy) || zipBusy} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-xs font-black text-sky-900 disabled:opacity-50">{reportBusy === "txt" ? <LoaderCircle size={16} className="animate-spin"/> : <FileText size={16}/>} TXT export</button></div></div></div> : null}

      {files.length > 1 ? (
        <div className="mt-5 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-cyan-50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-800"><FileArchive size={21} aria-hidden="true" /></span>
              <div>
                <h3 className="text-base font-black text-slate-950">Összes fájl letöltése egyben</h3>
                <p id="drop-zip-help" className="mt-1 text-sm leading-6 text-slate-600">A rendszer tartós másolat nélkül, közvetlen adatfolyamként készít ZIP-csomagot a {files.length} vírusellenőrzött fájlból. A PDF és TXT melléklet külön választható. Chrome/Edge asztali böngészőben előbb a mentési helyet választja ki, és csak ezután indul el a ZIP elkészítése.</p>
                <p className="mt-1 text-xs font-bold text-slate-500">Forrásméret: {formatBytes(totalBytes)} · {largeZip ? "nagy csomag, a feldolgozás több percet is igénybe vehet" : "a ZIP elkészítése néhány másodpercet igénybe vehet"}</p>
                {largeZip ? <p className="mt-2 inline-flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true"/> Nagy ZIP esetén tartsa nyitva ezt az oldalt. A Megszakítás gomb a folyamatot leállítja.</p> : null}
                {zipStatusText ? <p className="mt-2 text-xs font-black text-violet-900" role="status" aria-live="polite">{zipStatusText}</p> : null}
              </div>
            </div>
            <div className="shrink-0 lg:min-w-64">
              <div className="mb-2 rounded-xl border border-violet-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[.08em] text-violet-800">ZIP dokumentáció</p><label className="mt-2 flex items-start gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={zipIncludeTxt} onChange={(event) => setZipIncludeTxt(event.target.checked)} disabled={zipBusy} className="mt-0.5 accent-violet-700"/><span><strong className="text-slate-900">TXT megjegyzéslista</strong><span className="block font-medium text-slate-500">Alapból bekapcsolva, kis méretű.</span></span></label><label className="mt-2 flex items-start gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={zipIncludePdf} onChange={(event) => setZipIncludePdf(event.target.checked)} disabled={zipBusy} className="mt-0.5 accent-violet-700"/><span><strong className="text-slate-900">PDF csomagriport</strong><span className="block font-medium text-slate-500">Alapból kikapcsolva. Bekapcsolva a fenti {pdfImagesPerPage} kép/oldal elrendezést használja.</span></span></label></div>
              <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={zipBrandPrefix} onChange={(event) => setZipBrandPrefix(event.target.checked)} disabled={zipBusy} className="mt-0.5 accent-violet-700"/><span><strong className="block text-slate-900">DIMPRO_ előtag a ZIP nevéhez</strong><span className="mt-0.5 block font-medium text-slate-500">Opcionális. Az egyedi fájlneveket nem módosítja.</span></span></label>
              <button type="button" onClick={() => void startZipDownload()} disabled={Boolean(activeFileId) || zipBusy} aria-describedby="drop-zip-help" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:bg-slate-300">
                {zipBusy ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : <FileArchive size={18} aria-hidden="true" />}
                {zipStage === "selecting" ? "Mentési hely kiválasztása…" : zipStage === "preparing" ? `ZIP készül · ${zipElapsed} mp` : zipStage === "streaming" ? `Letöltés · ${zipElapsed} mp` : "Összes letöltése ZIP-ben"}
              </button>
              {zipBusy ? <button type="button" onClick={() => void cancelZipDownload()} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-800"><Square size={15}/> ZIP letöltés megszakítása</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      {files.length ? (
        <div className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-800">Képalbum és fájlok</p><h3 className="mt-1 text-lg font-black text-slate-950">Csoportosított csomagtartalom</h3><p className="mt-1 text-xs leading-5 text-slate-600">Minden csoport nyitva jelenik meg. A fejlécével később összecsukható, de egyetlen kép sincs alapból elrejtve.</p></div>
            <span className="shrink-0 rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-black text-cyan-900">{files.filter((file) => file.previewUrl).length} kép · {files.length} fájl</span>
          </div>
          <div className="mt-4 space-y-4">
            {downloadGroups.map((group, groupIndex) => {
              const collapsed = collapsedGroups.has(group.key);
              return <section key={group.key} id={groupDomId(groupIndex)} className="scroll-mt-5 overflow-hidden rounded-2xl border border-cyan-200 bg-[#f6fbfd] shadow-sm">
                <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={!collapsed} className="flex w-full items-center gap-3 border-b border-cyan-200 bg-[#e8f6fa] px-4 py-3 text-left text-slate-950">
                  <span className="min-w-0 flex-1 truncate text-sm font-black">{group.name}</span>
                  <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[10px] font-black text-cyan-950">{group.files.length} kép/fájl</span>
                  {collapsed ? <ChevronDown size={18} className="shrink-0 text-cyan-900"/> : <ChevronUp size={18} className="shrink-0 text-cyan-900"/>}
                </button>
                {!collapsed ? <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3 xl:grid-cols-4">
                  {group.files.map((file) => {
                    const loading = activeFileId === file.id;
                    return <article key={file.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      {file.previewUrl ? <a href={file.previewUrl} target="_blank" rel="noopener noreferrer" className="group relative block aspect-[4/3] overflow-hidden bg-slate-100" aria-label={`${file.name} megnyitása új lapon`}><img src={file.previewUrl} alt={file.name} loading="lazy" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.025]"/><span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-slate-950/75 text-white backdrop-blur"><ExternalLink size={14} aria-hidden="true"/></span></a> : <div className="grid aspect-[4/3] place-items-center bg-slate-100 text-slate-400"><div className="text-center"><FileCheck2 className="mx-auto" size={32} aria-hidden="true"/><p className="mt-2 px-2 text-[10px] font-black uppercase tracking-[.08em]">Fájl</p></div></div>}
                      <div className="flex flex-1 flex-col p-3 sm:p-4"><div className="flex items-start gap-2">{file.previewUrl ? <ImageIcon className="mt-0.5 shrink-0 text-cyan-700" size={16} aria-hidden="true"/> : <FileCheck2 className="mt-0.5 shrink-0 text-cyan-700" size={16} aria-hidden="true"/>}<strong className="min-w-0 break-words text-xs leading-5 text-slate-950" title={file.name}>{file.name}</strong></div><p className="mt-2 text-[10px] font-semibold text-slate-500">{formatBytes(file.sizeBytes)} · {file.mimeType || "application/octet-stream"}</p>{file.comments.length ? <div className="mt-2 space-y-1">{file.comments.slice(0,2).map((comment,index)=><p key={`${file.id}-comment-${index}`} className="rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-950">{comment}</p>)}</div> : null}<button type="button" onClick={() => startDownload(file)} disabled={Boolean(activeFileId) || zipBusy} className="mt-auto inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white transition hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60">{loading ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true"/> : <Download size={16} aria-hidden="true"/>}{loading ? "Készül…" : "Letöltés"}</button></div>
                    </article>;
                  })}
                </div> : null}
              </section>;
            })}
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Ebben a csomagban még nincs vírusellenőrzésen átment, letölthető fájl. A karanténban lévő fájlok automatikus vizsgálata folyamatban van.</div>
      )}

      {message ? (
        <div className={`mt-4 rounded-2xl border p-4 text-sm leading-6 ${message.type === "success" ? "border-lime-200 bg-lime-50 text-lime-950" : message.type === "error" ? "border-rose-200 bg-rose-50 text-rose-950" : "border-cyan-200 bg-cyan-50 text-cyan-950"}`} role="status" aria-live="polite">{message.text}</div>
      ) : null}
    </section>
  );
}
