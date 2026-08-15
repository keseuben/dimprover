"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Eye, FileImage, FileText, History, Loader2, Paperclip, RefreshCcw, ShieldCheck, Trash2, X } from "lucide-react"

type AttachmentKind = "PHOTO" | "PLAN" | "DOCUMENT"
type AttachmentRelation = "EVIDENCE" | "ATTACHMENT"

type IssueAttachment = {
  id: string
  projectId: string
  issueId: string
  attachmentKind: AttachmentKind
  fieldAttachmentId: string
  relationType: AttachmentRelation
  driveDocumentId: string
  driveVersionId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sha256: string | null
  metadata: Record<string, unknown>
  version: number
  createdBy: string
  createdByName: string
  updatedBy: string
  updatedByName: string
  createdAt: string
  updatedAt: string
}

type IssueAuditEvent = {
  id: string
  actorUserId: string
  eventType: string
  summary: string
  metadata: Record<string, unknown>
  createdAt: string
}

type PreviewState = {
  url: string
  kind: "PDF" | "IMAGE"
  fileName: string
  mimeType: string
} | null

type Props = {
  projectId: string
  issueId: string
  issueSerial: string
  attachmentCount: number
  photoAttachmentCount: number
  planAttachmentCount: number
  canWrite: boolean
  canReadDocuments: boolean
  memberNames?: Record<string, string>
  onChanged?: () => void | Promise<void>
}

function formatBytes(value: number) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(bytes >= 10 * 1024 ** 2 ? 0 : 1)} MB`
}

function displayDateTime(value: string) {
  return value ? new Date(value).toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" }) : "-"
}

function kindLabel(kind: AttachmentKind) {
  if (kind === "PHOTO") return "Fotó"
  if (kind === "PLAN") return "Terv"
  return "Dokumentum"
}

function auditLabel(eventType: string) {
  const labels: Record<string, string> = {
    PROJECT_ISSUE_ATTACHMENT_LINKED: "Melléklet kapcsolva",
    PROJECT_ISSUE_ATTACHMENT_UPDATED: "Melléklet frissítve",
    PROJECT_ISSUE_ATTACHMENT_UNLINKED: "Melléklet leválasztva",
    PROJECT_ISSUE_UPDATED: "Hibajegy frissítve",
    PROJECT_ISSUE_CREATED: "Hibajegy létrehozva",
    PROJECT_ISSUE_CREATED_FROM_COMPARE_FINDING: "Compare alapján létrehozva",
  }
  return labels[eventType] || eventType.replaceAll("_", " ")
}

function metadataText(attachment: IssueAttachment) {
  const meta = attachment.metadata || {}
  const candidates = [
    meta.note,
    meta.category,
    meta.planName,
    meta.photoSerial,
    meta.pageNumber ? `${meta.pageNumber}. oldal` : null,
    meta.fieldLocalSerial,
  ]
  return candidates.map((value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "").filter(Boolean).slice(0, 3).join(" · ")
}

function iconForKind(kind: AttachmentKind) {
  if (kind === "PHOTO") return <FileImage size={17} />
  if (kind === "PLAN") return <FileText size={17} />
  return <Paperclip size={17} />
}

export default function IssueAttachmentWorkspace({
  projectId,
  issueId,
  issueSerial,
  attachmentCount,
  photoAttachmentCount,
  planAttachmentCount,
  canWrite,
  canReadDocuments,
  memberNames = {},
  onChanged,
}: Props) {
  const [attachments, setAttachments] = useState<IssueAttachment[]>([])
  const [auditEvents, setAuditEvents] = useState<IssueAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [actionId, setActionId] = useState("")
  const [preview, setPreview] = useState<PreviewState>(null)

  const load = useCallback(async () => {
    if (!projectId || !issueId) return
    setLoading(true)
    setError("")
    try {
      const base = `/api/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`
      const [attachmentResponse, auditResponse] = await Promise.all([
        fetch(`${base}/attachments`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`${base}/audit?limit=80`, { credentials: "same-origin", cache: "no-store" }),
      ])
      const attachmentPayload = await attachmentResponse.json() as { ok?: boolean; error?: string; attachments?: IssueAttachment[] }
      const auditPayload = await auditResponse.json() as { ok?: boolean; error?: string; auditEvents?: IssueAuditEvent[] }
      if (!attachmentResponse.ok || !attachmentPayload.ok) throw new Error(attachmentPayload.error || "A HJ mellékletei nem tölthetők be.")
      if (!auditResponse.ok || !auditPayload.ok) throw new Error(auditPayload.error || "A HJ auditnaplója nem tölthető be.")
      setAttachments(attachmentPayload.attachments || [])
      setAuditEvents(auditPayload.auditEvents || [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A HJ mellékletmunkatér betöltése sikertelen.")
    } finally {
      setLoading(false)
    }
  }, [issueId, projectId])

  useEffect(() => { void load() }, [load])

  const grouped = useMemo(() => ({
    PHOTO: attachments.filter((item) => item.attachmentKind === "PHOTO"),
    PLAN: attachments.filter((item) => item.attachmentKind === "PLAN"),
    DOCUMENT: attachments.filter((item) => item.attachmentKind === "DOCUMENT"),
  }), [attachments])

  async function openPreview(attachment: IssueAttachment) {
    if (!canReadDocuments || actionId) return
    setActionId(attachment.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(attachment.driveDocumentId)}/preview`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: attachment.driveVersionId }),
      })
      const payload = await response.json() as { ok?: boolean; error?: string; preview?: PreviewState }
      if (!response.ok || !payload.ok || !payload.preview) throw new Error(payload.error || "Az előnézet nem nyitható meg.")
      setPreview(payload.preview)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az előnézet nem nyitható meg.")
    } finally {
      setActionId("")
    }
  }

  async function downloadAttachment(attachment: IssueAttachment) {
    if (!canReadDocuments || actionId) return
    setActionId(attachment.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(attachment.driveDocumentId)}/download`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: attachment.driveVersionId }),
      })
      const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string } }
      const url = payload.download?.url || ""
      if (!response.ok || !payload.ok || !url) throw new Error(payload.error || "A letöltési hivatkozás nem készíthető el.")
      window.open(url, "_blank", "noopener,noreferrer")
      setMessage(`${attachment.fileName} · biztonságos Drive letöltés megnyitva.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A dokumentum nem tölthető le.")
    } finally {
      setActionId("")
    }
  }

  async function unlinkAttachment(attachment: IssueAttachment) {
    if (!canWrite || actionId) return
    const accepted = window.confirm(`Leválasztod a(z) „${attachment.fileName}” mellékletet a ${issueSerial} hibajegyről?\n\nA DIMPRO Drive dokumentum nem törlődik.`)
    if (!accepted) return
    setActionId(attachment.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/attachments/${encodeURIComponent(attachment.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: attachment.version }),
      })
      const payload = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A melléklet leválasztása sikertelen.")
      setMessage(`${attachment.fileName} leválasztva. A Drive dokumentum megmaradt.`)
      await load()
      await onChanged?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A melléklet leválasztása sikertelen.")
      await load()
      await onChanged?.()
    } finally {
      setActionId("")
    }
  }

  function renderGroup(title: string, kind: AttachmentKind, items: IssueAttachment[]) {
    return <section className="border border-slate-200 bg-white" data-issue-attachment-group={kind}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-700">{iconForKind(kind)} {title}</div>
        <span className="border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">{items.length}</span>
      </div>
      {items.length === 0 ? <div className="px-3 py-4 text-xs font-semibold text-slate-400">Nincs aktív {kindLabel(kind).toLocaleLowerCase("hu-HU")} melléklet.</div> : <div className="divide-y divide-slate-100">
        {items.map((attachment) => {
          const busy = actionId === attachment.id
          const meta = metadataText(attachment)
          return <article key={attachment.id} className="grid gap-2 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto]" data-issue-attachment={attachment.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="truncate text-sm text-slate-900" title={attachment.fileName}>{attachment.fileName}</strong>
                <span className="border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700">{attachment.relationType}</span>
                <span className="text-[10px] font-black text-slate-400">v{attachment.version}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">
                <span>{attachment.mimeType || "ismeretlen típus"}</span>
                <span>{formatBytes(attachment.sizeBytes)}</span>
                <span>Drive: {attachment.driveDocumentId.slice(-10)}</span>
                <span>Verzió: {attachment.driveVersionId.slice(-10)}</span>
              </div>
              {meta ? <div className="mt-1 truncate text-[10px] font-semibold text-slate-600" title={meta}>{meta}</div> : null}
              <div className="mt-1 text-[9px] font-semibold text-slate-400">Kapcsolva: {displayDateTime(attachment.createdAt)} · {attachment.createdByName || attachment.createdBy || "DIMPRO"}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
              <button type="button" disabled={!canReadDocuments || busy} onClick={() => void openPreview(attachment)} className="inline-flex h-8 items-center gap-1.5 border border-cyan-200 bg-cyan-50 px-2.5 text-[10px] font-black uppercase text-cyan-800 disabled:opacity-40" title="Biztonságos Drive előnézet"><Eye size={13} /> Előnézet</button>
              <button type="button" disabled={!canReadDocuments || busy} onClick={() => void downloadAttachment(attachment)} className="inline-flex h-8 items-center gap-1.5 border border-slate-300 bg-white px-2.5 text-[10px] font-black uppercase text-slate-700 disabled:opacity-40" title="Drive letöltés"><Download size={13} /> Letöltés</button>
              {canWrite ? <button type="button" disabled={busy} onClick={() => void unlinkAttachment(attachment)} className="inline-flex h-8 items-center gap-1.5 border border-rose-200 bg-rose-50 px-2.5 text-[10px] font-black uppercase text-rose-700 disabled:opacity-40" title="Leválasztás a HJ-ról; Drive dokumentum nem törlődik"><Trash2 size={13} /> Leválasztás</button> : null}
              {busy ? <Loader2 size={14} className="animate-spin text-cyan-700" /> : null}
            </div>
          </article>
        })}
      </div>}
    </section>
  }

  return <div className="space-y-3" data-issue-attachment-workspace="0.5.0">
    <div className="border border-emerald-200 bg-emerald-50/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700"><ShieldCheck size={14} /> Központi HJ mellékletek · DIMPRO Drive</div>
          <div className="mt-2 flex flex-wrap gap-2"><span className="border border-emerald-200 bg-white px-2 py-1 text-[10px] font-black">Összes: {attachmentCount || 0}</span><span className="border border-slate-200 bg-white px-2 py-1 text-[10px] font-black">Fotó: {photoAttachmentCount || 0}</span><span className="border border-slate-200 bg-white px-2 py-1 text-[10px] font-black">Terv: {planAttachmentCount || 0}</span></div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-8 items-center gap-1.5 border border-emerald-300 bg-white px-2.5 text-[10px] font-black uppercase text-emerald-800 disabled:opacity-50"><RefreshCcw size={13} className={loading ? "animate-spin" : ""} /> Frissítés</button>
      </div>
      <p className="mt-2 text-[10px] font-semibold leading-4 text-emerald-800/80">Az előnézet és letöltés a Drive jogosultsági és vírusvédelmi szabályain keresztül fut. Leválasztáskor a Drive dokumentum nem törlődik.</p>
    </div>

    {error ? <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{error}</div> : null}
    {message ? <div className="border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800">{message}</div> : null}

    {loading ? <div className="flex min-h-28 items-center justify-center gap-2 border border-slate-200 bg-white text-xs font-bold text-slate-500"><Loader2 size={16} className="animate-spin" /> Mellékletek és audit betöltése…</div> : <div className="grid gap-3 xl:grid-cols-3">
      {renderGroup("Fotók", "PHOTO", grouped.PHOTO)}
      {renderGroup("Tervek", "PLAN", grouped.PLAN)}
      {renderGroup("Dokumentumok", "DOCUMENT", grouped.DOCUMENT)}
    </div>}

    <section className="border border-slate-200 bg-white" data-issue-audit-history="0.5.0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-700"><History size={15} /> HJ eseménytörténet</div><span className="text-[10px] font-black text-slate-400">{auditEvents.length} esemény</span></div>
      {auditEvents.length === 0 ? <div className="px-3 py-4 text-xs font-semibold text-slate-400">Nincs megjeleníthető HJ audit esemény.</div> : <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
        {auditEvents.map((event) => <div key={event.id} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]" data-issue-audit-event={event.eventType}>
          <div className="text-[10px] font-semibold text-slate-400"><div>{displayDateTime(event.createdAt)}</div><div className="mt-0.5 truncate" title={event.actorUserId}>{memberNames[event.actorUserId] || event.actorUserId || "DIMPRO"}</div></div>
          <div><div className="text-[10px] font-black uppercase tracking-[0.05em] text-cyan-800">{auditLabel(event.eventType)}</div><div className="mt-0.5 text-xs font-semibold text-slate-600">{event.summary}</div></div>
        </div>)}
      </div>}
    </section>

    {!canReadDocuments ? <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">A mellékletlista látható, de Drive előnézethez és letöltéshez `document.read` jogosultság szükséges.</div> : null}

    {preview ? <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-label={`${preview.fileName} előnézet`}>
      <div className="flex h-[min(88vh,900px)] w-[min(94vw,1280px)] flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{preview.fileName}</div><div className="text-[10px] font-semibold text-slate-500">{preview.kind} · {preview.mimeType}</div></div><button type="button" onClick={() => setPreview(null)} className="grid h-9 w-9 place-items-center border border-slate-300 bg-white text-slate-700" aria-label="Előnézet bezárása"><X size={17} /></button></div>
        <iframe src={preview.url} title={`${preview.fileName} Drive előnézet`} className="min-h-0 flex-1 bg-slate-100" />
      </div>
    </div> : null}
  </div>
}
