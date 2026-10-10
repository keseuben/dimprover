"use client";

import { useState, type ChangeEvent } from "react";
import { Camera, Trash2, UploadCloud, X } from "lucide-react";
import styles from "./ProfilePhotoControl.module.css";

type Props = {
  displayName: string;
  compact?: boolean;
};

export default function ProfilePhotoControl({ displayName, compact = false }: Props) {
  const [revision, setRevision] = useState(0);
  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initial = displayName.trim().charAt(0).toLocaleUpperCase("hu-HU") || "D";
  const imageSrc = `/api/dimpro-auth/profile/photo?revision=${revision}`;

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setSelected(file);
    setError(file && (file.size > 4 * 1024 * 1024 || !["image/jpeg","image/png","image/webp"].includes(file.type))
      ? "Csak JPG, PNG vagy WebP kép adható meg, legfeljebb 4 MB méretben."
      : "");
  }
  async function applyChange(remove: boolean) {
    if (busy || (!remove && !selected)) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      if (selected) form.append("file", selected);
      const response = await fetch("/api/dimpro-auth/profile/photo", {
        method: remove ? "DELETE" : "POST",
        credentials: "same-origin",
        body: remove ? undefined : form,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A profilfotó nem menthető.");
      setRevision((value) => value + 1);
      setAvailable(!remove);
      setSelected(null);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A profilfotó módosítása nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className={styles.avatarButton} onClick={() => { setOpen(true); setError(""); }}
      aria-label="Saját profilfotó beállítása" title="Profilfotó feltöltése vagy cseréje">
      <span className={styles.avatar} data-compact={compact ? "true" : "false"}>
        {available
          // eslint-disable-next-line @next/next/no-img-element -- Authenticated no-store profile image is not suitable for Next Image optimizer.
          ? <img src={imageSrc} alt="" onError={() => setAvailable(false)} />
          : initial}
      </span>
      <Camera size={11} className={styles.cameraIcon}/>
    </button>
    {open && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Profilfotó kezelése">
      <div className={styles.dialog}>
        <header><div><small>DIMPRO KÖZPONTI PROFIL</small><strong>Profilfotó kezelése</strong></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Bezárás"><X size={17}/></button></header>
        <p>Azonos profilkép tartozik a DIMPRO felhasználói fiókhoz. Az eredeti nagy fényképet a rendszer nem őrzi meg; a kép 256×256 pixeles WebP-változata kerül a központi AUTH-tárba.</p>
        <label className={styles.choose}>Kép kiválasztása (JPG, PNG vagy WebP, legfeljebb 4 MB)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={busy}/>
        </label>
        {selected && <span className={styles.filename}>Kiválasztva: {selected.name}</span>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        <footer>
          <button type="button" disabled={busy} onClick={() => void applyChange(true)}><Trash2 size={15}/> Kép törlése</button>
          <button type="button" disabled={busy} onClick={() => setOpen(false)}>Mégsem</button>
          <button type="button" className={styles.primary} disabled={busy || !selected || Boolean(error)} onClick={() => void applyChange(false)}><UploadCloud size={15}/> {busy ? "Feldolgozás…" : "Mentés"}</button>
        </footer>
      </div>
    </div>}
  </>;
}
