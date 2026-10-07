"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, BriefcaseBusiness, Loader2, MailPlus, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import type { DriveUserIdentitiesPayload, DriveUserIdentity, DriveUserIdentityType } from "./driveIdentityTypes";
import styles from "./DriveIdentityDialog.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onChanged?: (identities: DriveUserIdentity[]) => void;
};

export default function DriveIdentityDialog({ open, onClose, onChanged }: Props) {
  const [identities, setIdentities] = useState<DriveUserIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [identityType, setIdentityType] = useState<DriveUserIdentityType>("WORK");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const onChangedRef = useRef(onChanged);

  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

  const primary = useMemo(() => identities.find((item) => item.isPrimary) || null, [identities]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dimpro-auth/identities", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as DriveUserIdentitiesPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "Az e-mail-identitások nem tölthetők be.");
      const next = payload.identities || [];
      setIdentities(next);
      setDisplayName((current) => current || next.find((item) => item.isPrimary)?.displayName || "");
      onChangedRef.current?.(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az e-mail-identitások nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => { void load(); }, [load]);

  async function addIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("add");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dimpro-auth/identities", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ identityType, email: email.trim(), displayName: displayName.trim(), organizationName: identityType === "WORK" ? organizationName.trim() : "" }),
      });
      const payload = await response.json().catch(() => ({})) as DriveUserIdentitiesPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "Az e-mail-cím hozzáadása nem sikerült.");
      setNotice(payload.message || "A hitelesítő kódot elküldtük.");
      setEmail("");
      setOrganizationName("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az e-mail-cím hozzáadása nem sikerült.");
    } finally {
      setBusy("");
    }
  }

  async function verifyIdentity(identity: DriveUserIdentity) {
    const code = (codes[identity.id] || "").trim();
    if (!/^\d{6}$/.test(code)) {
      setError("A hitelesítő kód 6 számjegyből áll.");
      return;
    }
    setBusy(`verify:${identity.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dimpro-auth/identities/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ identityId: identity.id, code }),
      });
      const payload = await response.json().catch(() => ({})) as DriveUserIdentitiesPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "A hitelesítés nem sikerült.");
      setNotice(payload.message || "Az e-mail-cím hitelesítve.");
      setCodes((current) => ({ ...current, [identity.id]: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A hitelesítés nem sikerült.");
    } finally {
      setBusy("");
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="E-mail-címek és munkahelyi identitások">
      <section className={styles.panel}>
        <header className={styles.header}>
          <div className={styles.headingIcon}><ShieldCheck size={20} /></div>
          <div className={styles.headingText}><small>DIMPRO-fiók</small><strong>E-mail-címek és munkahelyek</strong><span>Egy fiókhoz több hitelesített személyes vagy munkahelyi e-mail kapcsolható.</span></div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Bezárás"><X size={17} /></button>
        </header>

        <div className={styles.body}>
          <section className={styles.listSection}>
            <div className={styles.sectionHeading}><div><strong>Kapcsolt identitások</strong><span>{identities.filter((item) => item.status === "VERIFIED").length} hitelesített</span></div><button type="button" onClick={() => void load()} disabled={loading || busy !== ""}><RefreshCw size={13} className={loading ? styles.spin : ""} /> Frissítés</button></div>
            {loading && !identities.length ? <div className={styles.empty}><Loader2 size={18} className={styles.spin} /> Betöltés…</div> : null}
            <div className={styles.identityList}>
              {identities.map((identity) => (
                <article key={identity.id} className={`${styles.identityCard} ${identity.isPrimary ? styles.primaryCard : ""}`}>
                  <div className={styles.identityIcon}>{identity.identityType === "WORK" ? <BriefcaseBusiness size={17} /> : <UserRound size={17} />}</div>
                  <div className={styles.identityMain}>
                    <div className={styles.identityTitle}><strong>{identity.displayName || identity.email}</strong><div>{identity.isPrimary ? <span className={styles.primaryBadge}>Elsődleges</span> : null}{identity.status === "VERIFIED" ? <span className={styles.verifiedBadge}><BadgeCheck size={11} /> Hitelesített</span> : <span className={styles.pendingBadge}>Hitelesítésre vár</span>}</div></div>
                    <span>{identity.email}</span>
                    <small>{identity.identityType === "WORK" ? identity.organizationName || "Munkahelyi identitás" : "Személyes identitás"}</small>
                    {identity.status === "PENDING" ? <div className={styles.verifyRow}><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6 jegyű kód" value={codes[identity.id] || ""} onChange={(event) => setCodes((current) => ({ ...current, [identity.id]: event.target.value.replace(/\D/g, "").slice(0, 6) }))} /><button type="button" disabled={busy !== ""} onClick={() => void verifyIdentity(identity)}>{busy === `verify:${identity.id}` ? <Loader2 size={13} className={styles.spin} /> : <BadgeCheck size={13} />} Hitelesítés</button></div> : null}
                  </div>
                </article>
              ))}
              {!loading && !identities.length ? <div className={styles.empty}>Még nincs kapcsolt identitás.</div> : null}
            </div>
          </section>

          <form className={styles.formSection} onSubmit={addIdentity}>
            <div className={styles.sectionHeading}><div><strong>Új e-mail / munkahely hozzáadása</strong><span>Az új címre hitelesítő kódot küldünk.</span></div><MailPlus size={17} /></div>
            <div className={styles.formGrid}>
              <label>Típus<select value={identityType} onChange={(event) => setIdentityType(event.target.value as DriveUserIdentityType)}><option value="WORK">Munkahelyi</option><option value="PERSONAL">Személyes</option></select></label>
              <label>Név<input required minLength={2} maxLength={160} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={primary?.displayName || "Teljes név"} /></label>
              <label className={styles.wide}>E-mail-cím<input required type="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nev@ceg.hu" /></label>
              {identityType === "WORK" ? <label className={styles.wide}>Cég / szervezet<input required minLength={2} maxLength={160} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Cég / szervezet neve" /></label> : null}
            </div>
            <p className={styles.explainer}>Az e-mail-cím nem kap külön DIMPRO-fiókot vagy külön tárhelyet. A projektjogosultság továbbra is a központi felhasználódhoz tartozik; a kiválasztott identitás a projektben használt név/e-mail/szervezeti kontextus.</p>
            <button type="submit" className={styles.primaryButton} disabled={busy !== ""}>{busy === "add" ? <Loader2 size={14} className={styles.spin} /> : <MailPlus size={14} />} Hitelesítő kód küldése</button>
          </form>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
        {notice ? <div className={styles.notice}>{notice}</div> : null}
        <footer className={styles.footer}><span>A Saját Drive jogosultság a központi DIMPRO-fiókhoz tartozik.</span><button type="button" onClick={onClose}>Kész</button></footer>
      </section>
    </div>
  );
}
