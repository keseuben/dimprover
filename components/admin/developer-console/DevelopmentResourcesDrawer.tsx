"use client";

import { Archive, ArrowRightLeft, Check, ClipboardCopy, Download, Eye, FileArchive, FileImage, FileText, Filter, LoaderCircle, Search, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DevelopmentResource, ResourceHealth } from "./types";
import styles from "./DeveloperConsole.module.css";

type Handoff = {
  id: string; chatSessionId: string; chatTitle: string; workerCode: string; mainProject: string; project: string; module: string; contextModule: string;
  taskId: string; taskTitle: string; startedAt: string; finishedAt: string; durationMinutes: number; status: "COMPLETED" | "PARTIAL" | "BLOCKED" | "FAILED";
  branch: string; worktree: string; startCommit: string; endCommit: string; testsSummary: string; buildRelease: string; productionAccess: "DENY"; tags: string[]; summary: string; sha256: string;
};

const DOC_LABELS: Record<DevelopmentResource["documentType"], string> = {
  specification: "Specifikáció", concept: "Koncepció", coding_guide: "Kódolási segédlet", reference: "Referencia", handoff: "Átadó", other: "Egyéb",
};

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}
function formatBytes(value: number) { if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`; if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`; return `${value} B`; }
function formatDate(value: string) { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; }
function duration(value: number) { const h = Math.floor(value / 60); const m = value % 60; return h ? `${h} ó ${m} p` : `${m} p`; }
function iconFor(item: DevelopmentResource) { if (["png", "jpg", "jpeg", "webp", "svg"].includes(item.extension)) return <FileImage size={17} />; if (item.extension === "zip") return <FileArchive size={17} />; return <FileText size={17} />; }

export default function DevelopmentResourcesDrawer({ open, onClose, resources, health, onReload }: {
  open: boolean; onClose: () => void; resources: DevelopmentResource[]; health: ResourceHealth | null; onReload: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"resources" | "handoffs">("resources");
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [requiredFilter, setRequiredFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<"project" | "module" | "worker" | "chat" | "date" | "status">("module");
  const [busy, setBusy] = useState(""); const [dragging, setDragging] = useState(false); const [message, setMessage] = useState(""); const [copied, setCopied] = useState("");
  const [moduleCode, setModuleCode] = useState("benjadmin"); const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [tags, setTags] = useState(""); const [version, setVersion] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "critical">("normal"); const [required, setRequired] = useState(true);
  const [documentType, setDocumentType] = useState<DevelopmentResource["documentType"]>("specification");
  const [handoffs, setHandoffs] = useState<Handoff[]>([]); const [handoffLoading, setHandoffLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const missingMetadata = useMemo(() => [!moduleCode.trim() ? "Modul" : "", !title.trim() ? "Cím" : "", !version.trim() ? "Verzió" : "", !description.trim() ? "Leírás" : "", !tags.trim() ? "Címkék" : "", !documentType ? "Dokumentumtípus" : ""].filter(Boolean), [moduleCode, title, version, description, tags, documentType]);
  const uploadReady = missingMetadata.length === 0 && busy !== "upload";

  useEffect(() => {
    if (!open || tab !== "handoffs") return;
    let cancelled = false; setHandoffLoading(true);
    fetch("/api/dev/console/handoffs", { headers: adminHeaders(), cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Az átadások nem tölthetők be."); if (!cancelled) setHandoffs(payload.handoffs || []); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Az átadások nem tölthetők be."); })
      .finally(() => { if (!cancelled) setHandoffLoading(false); });
    return () => { cancelled = true; };
  }, [open, tab]);

  const modules = useMemo(() => [...new Set(resources.map((item) => item.module))].sort(), [resources]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("hu-HU");
    return resources.filter((item) => (!q || `${item.title} ${item.originalName} ${item.module} ${item.tags.join(" ")} ${item.description} ${item.version}`.toLocaleLowerCase("hu-HU").includes(q))
      && (moduleFilter === "all" || item.module === moduleFilter) && (typeFilter === "all" || item.documentType === typeFilter)
      && (requiredFilter === "all" || (requiredFilter === "required" ? item.requiredBeforeDevelopment : !item.requiredBeforeDevelopment))
      && (priorityFilter === "all" || item.priority === priorityFilter));
  }, [query, resources, moduleFilter, typeFilter, requiredFilter, priorityFilter]);

  const visibleHandoffs = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("hu-HU");
    return handoffs.filter((item) => (!q || `${item.chatSessionId} ${item.chatTitle} ${item.workerCode} ${item.mainProject} ${item.project} ${item.module} ${item.contextModule} ${item.taskId} ${item.taskTitle} ${item.summary} ${item.tags.join(" ")}`.toLocaleLowerCase("hu-HU").includes(q))
      && (workerFilter === "all" || item.workerCode === workerFilter) && (statusFilter === "all" || item.status === statusFilter));
  }, [handoffs, query, workerFilter, statusFilter]);

  const groupedHandoffs = useMemo(() => {
    const map = new Map<string, Handoff[]>();
    for (const item of visibleHandoffs) {
      const key = groupBy === "project" ? `${item.mainProject} / ${item.project}` : groupBy === "module" ? `${item.module}${item.contextModule ? ` / ${item.contextModule}` : ""}` : groupBy === "worker" ? item.workerCode : groupBy === "chat" ? `${item.chatSessionId} · ${item.chatTitle}` : groupBy === "status" ? item.status : new Date(item.finishedAt).toLocaleDateString("hu-HU");
      map.set(key || "Nincs besorolás", [...(map.get(key || "Nincs besorolás") || []), item]);
    }
    return [...map.entries()];
  }, [visibleHandoffs, groupBy]);

  async function upload(files: File[]) {
    if (!files.length) return; if (!uploadReady) { setMessage(`Előbb töltsd ki: ${missingMetadata.join(", ")}.`); return; }
    setBusy("upload"); setMessage("");
    try {
      const form = new FormData(); form.set("module", moduleCode); form.set("title", title); form.set("description", description); form.set("tags", tags); form.set("version", version); form.set("priority", priority); form.set("documentType", documentType); form.set("requiredBeforeDevelopment", String(required)); form.set("source", "BENJADMIN_CONSOLE_UPLOAD"); files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/dev/console/resources", { method: "POST", headers: adminHeaders(), body: form }); const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A feltöltés sikertelen.");
      setMessage(`${files.length} segédanyag feltöltve.`); setTitle(""); setDescription(""); setTags(""); setVersion(""); await onReload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "A feltöltés sikertelen."); }
    finally { setBusy(""); if (inputRef.current) inputRef.current.value = ""; }
  }
  async function patch(item: DevelopmentResource, body: Record<string, unknown>) { setBusy(item.id); setMessage(""); try { const response = await fetch("/api/dev/console/resources", { method: "PATCH", headers: adminHeaders(true), body: JSON.stringify({ id: item.id, ...body }) }); const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null; if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A módosítás sikertelen."); await onReload(); } catch (error) { setMessage(error instanceof Error ? error.message : "A módosítás sikertelen."); } finally { setBusy(""); } }
  async function copyHandoff(item: DevelopmentResource) { const text = `BENJADMIN Fejlesztési Tár kötelező/segéd kontextus\nCím: ${item.title}\nFájl: ${item.originalName}\nModul: ${item.module}\nTípus: ${DOC_LABELS[item.documentType]}\nVerzió: ${item.version || "—"}\nID: ${item.id}\nSHA-256: ${item.sha256}\nKötelező olvasás: ${item.requiredBeforeDevelopment ? "igen" : "nem"}\n\nFORRÁSELSŐBBSÉG: a legfrissebb jóváhagyott modul-átadó .md az aktuális fejlesztési állapot elsődleges forrása. Ezt a segédanyagot mindig olvasd át specifikációs/háttérkontextusként. Eltérésnél SOURCE_CONFLICT / BENJADMIN DECISION REQUIRED.`; await navigator.clipboard.writeText(text); setCopied(item.id); window.setTimeout(() => setCopied((value) => value === item.id ? "" : value), 1600); }
  async function openResource(item: DevelopmentResource, inline: boolean) { const previewWindow = inline ? window.open("", "_blank") : null; if (inline && !previewWindow) { setMessage("A böngésző blokkolta az előnézeti ablakot."); return; } setBusy(`open:${item.id}`); try { const response = await fetch(`/api/dev/console/resources/${encodeURIComponent(item.id)}${inline ? "?inline=1" : ""}`, { headers: adminHeaders(), cache: "no-store" }); if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; throw new Error(payload?.error || "A segédanyag nem nyitható meg."); } const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob); if (inline && previewWindow) { previewWindow.location.href = objectUrl; window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000); } else { const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = item.originalName; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000); } } catch (error) { previewWindow?.close(); setMessage(error instanceof Error ? error.message : "A segédanyag nem nyitható meg."); } finally { setBusy(""); } }

  if (!open) return null;
  return <div className={styles.drawerLayer} role="presentation">
    <button type="button" className={styles.drawerBackdrop} aria-label="Fejlesztési Tár bezárása" onClick={onClose} />
    <aside className={`${styles.drawer} ${styles.drawerExtraWide}`} aria-label="Fejlesztési Tár">
      <header className={styles.drawerHeader}><div><span>FEJLESZTÉSI TÁR</span><strong>Segédanyagok · Átadások · fejlesztési kontextus</strong></div><button type="button" onClick={onClose} aria-label="Bezárás"><X size={18} /></button></header>
      <div className={styles.resourceTabs} aria-label="Fejlesztési Tár nézetváltó">
        <button type="button" data-active={tab === "resources"} aria-pressed={tab === "resources"} onClick={() => setTab("resources")}><FileText size={17} /><span>SEGÉDANYAGOK</span><b>{resources.length}</b></button>
        <button type="button" data-active={tab === "handoffs"} aria-pressed={tab === "handoffs"} onClick={() => setTab("handoffs")}><ArrowRightLeft size={17} /><span>ÁTADÁSOK</span><b>{handoffs.length}</b></button>
      </div>
      <div className={styles.drawerBody}>
        {tab === "resources" ? <>
          <section className={styles.resourceHealth}><div><span>Aktív</span><strong>{health?.resources ?? resources.length}</strong></div><div><span>Kötelező</span><strong>{health?.requiredBeforeDevelopment ?? resources.filter((item) => item.requiredBeforeDevelopment).length}</strong></div><div><span>Modul</span><strong>{health?.modules ?? 0}</strong></div><div><span>Tárhely</span><strong>{formatBytes(health?.totalBytes ?? 0)}</strong></div><div><span>Backend</span><strong>{health?.backend || "DEV_LOCAL_STAGING"}</strong></div><div><span>Drive</span><strong>{health?.driveTarget || "PENDING"}</strong></div></section>
          <section className={styles.resourceUploadPanel}>
            <div className={styles.resourceFormGrid}>
              <label><span>Modul *</span><input value={moduleCode} onChange={(e) => setModuleCode(e.target.value)} placeholder="benjadmin" /></label><label><span>Cím *</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Segédanyag címe" /></label><label><span>Verzió *</span><input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="V1 / 2026-08-22" /></label><label><span>Prioritás</span><select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="normal">Normál</option><option value="important">Fontos</option><option value="critical">Kritikus</option></select></label>
              <label><span>Dokumentumtípus *</span><select value={documentType} onChange={(e) => setDocumentType(e.target.value as DevelopmentResource["documentType"])}>{Object.entries(DOC_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className={styles.resourceWideField}><span>Címkék *</span><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="chatgrid, handoff, backend" /></label><label className={styles.resourceWideField}><span>Leírás *</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Mit kell ebből figyelembe venni?" /></label>
            </div>
            <label className={styles.requiredSwitch}><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Kötelezően olvasandó fejlesztés előtt</label>
            <button type="button" disabled={!uploadReady} className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""} ${!uploadReady ? styles.dropZoneDisabled : ""}`} onDragEnter={(e) => { e.preventDefault(); if (uploadReady) setDragging(true); }} onDragOver={(e) => { if (uploadReady) e.preventDefault(); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (uploadReady) void upload(Array.from(e.dataTransfer.files)); }} onClick={() => { if (uploadReady) inputRef.current?.click(); }}>
              {busy === "upload" ? <LoaderCircle size={24} className={styles.spin} /> : <UploadCloud size={24} />}<strong>{uploadReady ? "Húzd ide a fájlokat vagy kattints a kiválasztáshoz" : "Előbb töltsd ki a dokumentum adatait"}</strong><span>{uploadReady ? "Max. 20 fájl · 50 MB/fájl · ZIP nem fut automatikusan." : `Hiányzik: ${missingMetadata.join(" · ")}`}</span>
            </button><input ref={inputRef} type="file" multiple hidden disabled={!uploadReady} onChange={(e) => void upload(Array.from(e.target.files || []))} />
          </section>
          <div className={styles.resourceFilterBar}><label><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keresés fájlnévben, címben, leírásban, címkében…" /></label><select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="all">Minden modul</option>{modules.map((m) => <option key={m}>{m}</option>)}</select><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Minden típus</option>{Object.entries(DOC_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><select value={requiredFilter} onChange={(e) => setRequiredFilter(e.target.value)}><option value="all">Kötelező + opcionális</option><option value="required">Csak kötelező</option><option value="optional">Csak opcionális</option></select><select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option value="all">Minden prioritás</option><option value="normal">Normál</option><option value="important">Fontos</option><option value="critical">Kritikus</option></select><button type="button" onClick={() => { setQuery(""); setModuleFilter("all"); setTypeFilter("all"); setRequiredFilter("all"); setPriorityFilter("all"); }}><Filter size={14}/> Törlés</button></div>
          {message ? <div className={styles.drawerNotice}>{message}</div> : null}
          <div className={styles.resourceList}>{visible.map((item) => { const inline = ["pdf","png","jpg","jpeg","webp","txt","md","json","csv"].includes(item.extension); return <article key={item.id} className={`${item.requiredBeforeDevelopment ? styles.resourceRequired : ""} ${item.priority === "critical" ? styles.resourceCritical : ""}`}><div className={styles.resourceIcon}>{iconFor(item)}</div><div className={styles.resourceMain}><div><strong>{item.title}</strong><b>{DOC_LABELS[item.documentType]}</b>{item.requiredBeforeDevelopment ? <b>KÖTELEZŐ</b> : null}{item.priority !== "normal" ? <b>{item.priority === "critical" ? "KRITIKUS" : "FONTOS"}</b> : null}</div><span>{item.originalName} · {formatBytes(item.sizeBytes)} · {item.module}{item.version ? ` · ${item.version}` : ""}</span>{item.description ? <p>{item.description}</p> : null}<small>SHA-256 {item.sha256.slice(0,20)}… · {item.tags.join(" · ") || "nincs címke"}</small></div><div className={styles.resourceActions}>{inline ? <button type="button" onClick={() => void openResource(item,true)} title="Előnézet"><Eye size={16}/><span>Előnézet</span></button> : null}<button type="button" onClick={() => void openResource(item,false)} title="Letöltés"><Download size={16}/><span>Letöltés</span></button><button type="button" onClick={() => void copyHandoff(item)} title="Kontextus másolása">{copied === item.id ? <Check size={16}/> : <ClipboardCopy size={16}/>}<span>{copied === item.id ? "Másolva" : "Kontextus"}</span></button><button type="button" onClick={() => void patch(item,{ requiredBeforeDevelopment: !item.requiredBeforeDevelopment })} title="Kötelező jelölés"><FileText size={16}/><span>{item.requiredBeforeDevelopment ? "Kötelező" : "Opcionális"}</span></button><button type="button" onClick={() => { if (window.confirm("Archiválódjon?")) void patch(item,{ archived:true }); }} title="Archiválás"><Archive size={16}/><span>Archiválás</span></button></div></article>; })}{!visible.length ? <div className={styles.railEmpty}>Nincs megjeleníthető segédanyag.</div> : null}</div>
        </> : <>
          <div className={styles.resourceFilterBar}><label><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keresés csevegésben, workerben, modulban, taskban…" /></label><select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)}><option value="all">Minden worker</option>{["BENAI","OUTMINAI","ARMINAI","JAZMINAI"].map((w) => <option key={w}>{w}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Minden állapot</option>{["COMPLETED","PARTIAL","BLOCKED","FAILED"].map((s) => <option key={s}>{s}</option>)}</select><select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}><option value="module">Csoport: modul</option><option value="project">Csoport: projekt</option><option value="worker">Csoport: worker</option><option value="chat">Csoport: csevegés</option><option value="date">Csoport: dátum</option><option value="status">Csoport: állapot</option></select><button type="button" onClick={() => { setQuery(""); setWorkerFilter("all"); setStatusFilter("all"); }}><Filter size={14}/> Törlés</button></div>
          {message ? <div className={styles.drawerNotice}>{message}</div> : null}
          {handoffLoading ? <div className={styles.railEmpty}><LoaderCircle size={20} className={styles.spin}/> Átadások betöltése…</div> : <div className={styles.handoffGroups}>{groupedHandoffs.map(([group,items]) => <section key={group}><header><strong>{group}</strong><span>{items.length} átadó</span></header>{items.map((item) => <article key={item.id} className={styles.handoffCard} draggable data-handoff-id={item.id}><div className={styles.handoffCardTop}><div><strong>{item.chatSessionId} · {item.chatTitle}</strong><span>{item.workerCode} · {item.mainProject} / {item.project} / {item.module}{item.contextModule ? ` / ${item.contextModule}` : ""}</span></div><b data-status={item.status}>{item.status}</b></div><div className={styles.handoffFacts}><span>{formatDate(item.startedAt)} → {formatDate(item.finishedAt)}</span><strong>{duration(item.durationMinutes)}</strong><span>Task: {item.taskId}</span><span>{item.taskTitle}</span></div><p>{item.summary}</p><small>{item.testsSummary || "tesztadat nincs"} · PROD {item.productionAccess} · SHA {item.sha256.slice(0,16)}…</small></article>)}</section>)}</div>}
          {!handoffLoading && !visibleHandoffs.length ? <div className={styles.railEmpty}>Még nincs a szűrésnek megfelelő átadó.</div> : null}
        </>}
      </div>
    </aside>
  </div>;
}
