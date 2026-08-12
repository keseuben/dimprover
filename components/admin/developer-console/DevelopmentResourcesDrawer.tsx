"use client";

import { Archive, Check, ClipboardCopy, Download, Eye, FileArchive, FileImage, FileText, LoaderCircle, Search, UploadCloud, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { DevelopmentResource, ResourceHealth } from "./types";
import styles from "./DeveloperConsole.module.css";

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function formatBytes(value: number) {
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function iconFor(item: DevelopmentResource) {
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(item.extension)) return <FileImage size={17} />;
  if (item.extension === "zip") return <FileArchive size={17} />;
  return <FileText size={17} />;
}

export default function DevelopmentResourcesDrawer({ open, onClose, resources, health, onReload }: {
  open: boolean;
  onClose: () => void;
  resources: DevelopmentResource[];
  health: ResourceHealth | null;
  onReload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const [moduleCode, setModuleCode] = useState("benjadmin");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [version, setVersion] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "critical">("normal");
  const [required, setRequired] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("hu-HU");
    return resources.filter((item) => !q || `${item.title} ${item.originalName} ${item.module} ${item.tags.join(" ")} ${item.description}`.toLocaleLowerCase("hu-HU").includes(q));
  }, [query, resources]);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy("upload"); setMessage("");
    try {
      const form = new FormData();
      form.set("module", moduleCode);
      form.set("title", title);
      form.set("description", description);
      form.set("tags", tags);
      form.set("version", version);
      form.set("priority", priority);
      form.set("requiredBeforeDevelopment", String(required));
      form.set("source", "BENJADMIN_CONSOLE_UPLOAD");
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/dev/console/resources", { method: "POST", headers: adminHeaders(), body: form });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A feltöltés sikertelen.");
      setMessage(`${files.length} segédanyag feltöltve.`);
      setTitle(""); setDescription(""); setTags(""); setVersion("");
      await onReload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "A feltöltés sikertelen."); }
    finally { setBusy(""); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function patch(item: DevelopmentResource, body: Record<string, unknown>) {
    setBusy(item.id); setMessage("");
    try {
      const response = await fetch("/api/dev/console/resources", { method: "PATCH", headers: adminHeaders(true), body: JSON.stringify({ id: item.id, ...body }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A módosítás sikertelen.");
      await onReload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "A módosítás sikertelen."); }
    finally { setBusy(""); }
  }

  async function copyHandoff(item: DevelopmentResource) {
    const text = `BENJADMIN Fejlesztési Tár segédanyag\nCím: ${item.title}\nFájl: ${item.originalName}\nModul: ${item.module}\nVerzió: ${item.version || "—"}\nID: ${item.id}\nSHA-256: ${item.sha256}\nKötelező fejlesztés előtt: ${item.requiredBeforeDevelopment ? "igen" : "nem"}\n\nChatGPT: ezt a segédanyagot használd a fejlesztés alapjaként. Ha nincs közvetlen hozzáférésed a BENJADMIN Fejlesztési Tárhoz, kérd, hogy a fájlt csatoljam a csevegőbe.`;
    await navigator.clipboard.writeText(text);
    setCopied(item.id); window.setTimeout(() => setCopied((value) => value === item.id ? "" : value), 1600);
  }

  async function openResource(item: DevelopmentResource, inline: boolean) {
    const previewWindow = inline ? window.open("", "_blank") : null;
    if (inline && !previewWindow) {
      setMessage("A böngésző blokkolta az előnézeti ablakot. Engedélyezd a felugró ablakot ehhez az oldalhoz.");
      return;
    }
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = `BENJADMIN · ${item.title}`;
      previewWindow.document.body.textContent = "Segédanyag betöltése…";
    }
    setBusy(`open:${item.id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/dev/console/resources/${encodeURIComponent(item.id)}${inline ? "?inline=1" : ""}`, {
        headers: adminHeaders(),
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "A segédanyag nem nyitható meg.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (inline && previewWindow) {
        previewWindow.location.href = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = item.originalName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
      }
    } catch (error) {
      previewWindow?.close();
      setMessage(error instanceof Error ? error.message : "A segédanyag nem nyitható meg.");
    } finally {
      setBusy("");
    }
  }

  if (!open) return null;
  return (
    <div className={styles.drawerLayer} role="presentation">
      <button type="button" className={styles.drawerBackdrop} aria-label="Fejlesztési Tár bezárása" onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerExtraWide}`} aria-label="Fejlesztési Tár">
        <header className={styles.drawerHeader}><div><span>FEJLESZTÉSI TÁR</span><strong>PDF · kép · logó · ZIP · kód · segédanyag</strong></div><button type="button" onClick={onClose} aria-label="Bezárás"><X size={18} /></button></header>
        <div className={styles.drawerBody}>
          <section className={styles.resourceHealth}>
            <div><span>Aktív</span><strong>{health?.resources ?? resources.length}</strong></div>
            <div><span>Kötelező</span><strong>{health?.requiredBeforeDevelopment ?? resources.filter((item) => item.requiredBeforeDevelopment).length}</strong></div>
            <div><span>Modul</span><strong>{health?.modules ?? 0}</strong></div>
            <div><span>Tárhely</span><strong>{formatBytes(health?.totalBytes ?? 0)}</strong></div>
            <div><span>Backend</span><strong>{health?.backend || "DEV_LOCAL_STAGING"}</strong></div>
            <div><span>Drive</span><strong>{health?.driveTarget || "PENDING"}</strong></div>
          </section>
          <section className={styles.resourceUploadPanel}>
            <div className={styles.resourceFormGrid}>
              <label><span>Modul</span><input value={moduleCode} onChange={(event) => setModuleCode(event.target.value)} placeholder="benjadmin" /></label>
              <label><span>Cím</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Segédanyag címe" /></label>
              <label><span>Verzió</span><input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="V1 / 2026-08-12" /></label>
              <label><span>Prioritás</span><select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">Normál</option><option value="important">Fontos</option><option value="critical">Kritikus</option></select></label>
              <label className={styles.resourceWideField}><span>Leírás</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="Mit kell ebből figyelembe venni?" /></label>
              <label className={styles.resourceWideField}><span>Címkék</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="ui, drive, logo, kötelező" /></label>
            </div>
            <label className={styles.requiredSwitch}><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Kötelezően olvasandó fejlesztés előtt</label>
            <button type="button" className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }} onClick={() => inputRef.current?.click()}>
              {busy === "upload" ? <LoaderCircle size={24} className={styles.spin} /> : <UploadCloud size={24} />}<strong>Húzd ide a fájlokat vagy kattints a kiválasztáshoz</strong><span>Max. 20 fájl · 50 MB/fájl · a ZIP nem kerül automatikusan futtatásra vagy kibontásra.</span>
            </button>
            <input ref={inputRef} type="file" multiple hidden onChange={(event) => void upload(Array.from(event.target.files || []))} />
          </section>
          <div className={styles.resourceToolbar}><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés segédanyagban…" /></label><span>{visible.length} elem</span></div>
          {message ? <div className={styles.drawerNotice}>{message}</div> : null}
          <div className={styles.resourceList}>
            {visible.map((item) => {
              const inline = ["pdf", "png", "jpg", "jpeg", "webp", "txt", "md", "json", "csv"].includes(item.extension);
              return (
                <article key={item.id} className={`${item.requiredBeforeDevelopment ? styles.resourceRequired : ""} ${item.priority === "critical" ? styles.resourceCritical : ""}`}>
                  <div className={styles.resourceIcon}>{iconFor(item)}</div>
                  <div className={styles.resourceMain}><div><strong>{item.title}</strong>{item.requiredBeforeDevelopment ? <b>KÖTELEZŐ</b> : null}{item.priority !== "normal" ? <b>{item.priority === "critical" ? "KRITIKUS" : "FONTOS"}</b> : null}</div><span>{item.originalName} · {formatBytes(item.sizeBytes)} · {item.module}{item.version ? ` · ${item.version}` : ""}</span>{item.description ? <p>{item.description}</p> : null}<small>SHA-256 {item.sha256.slice(0, 20)}… · {item.tags.join(" · ") || "nincs címke"}</small></div>
                  <div className={styles.resourceActions}>
                    {inline ? <button type="button" onClick={() => void openResource(item, true)} disabled={busy === `open:${item.id}`} title="Előnézet"><Eye size={15} /></button> : null}
                    <button type="button" onClick={() => void openResource(item, false)} disabled={busy === `open:${item.id}`} title="Letöltés"><Download size={15} /></button>
                    <button type="button" onClick={() => void copyHandoff(item)} title="ChatGPT átadó másolása">{copied === item.id ? <Check size={15} /> : <ClipboardCopy size={15} />}</button>
                    <button type="button" onClick={() => void patch(item, { requiredBeforeDevelopment: !item.requiredBeforeDevelopment })} disabled={busy === item.id} title="Kötelező jelölés váltása"><FileText size={15} /></button>
                    <button type="button" onClick={() => { if (window.confirm("A segédanyag archiválódjon? A fájl nem törlődik destruktívan.")) void patch(item, { archived: true }); }} disabled={busy === item.id} title="Archiválás"><Archive size={15} /></button>
                  </div>
                </article>
              );
            })}
            {!visible.length ? <div className={styles.railEmpty}>Nincs megjeleníthető segédanyag.</div> : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
