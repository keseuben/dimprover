"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Building2, CheckCircle2,
  Clock3, CreditCard, Database, HardDrive, Info, Loader2,
  LockKeyhole, Mail, RefreshCcw, ShieldCheck, Users,
} from "lucide-react";
import type { DriveStorageQuota } from "./driveTypes";
import ProjectDriveLicensePanel from "./ProjectDriveLicensePanel";
import PersonalCommercialReadinessCard from "./PersonalCommercialReadinessCard";
import styles from "./DriveLicenseCenter.module.css";

type Grant = {
  roleCode: string;
  roleName: string;
  scope: "PROJECT" | "PERSONAL_OR_GLOBAL";
  externalProjectId: string | null;
  validFrom: string;
  validUntil: string | null;
  status: "ACTIVE" | "PENDING" | "EXPIRED" | "REVOKED";
};
type Project = { id: string; name: string; code: string | null; status: string; access: string };
type LicensePayload = {
  ok?: boolean;
  error?: string;
  user?: { email: string | null; displayName: string };
  personalDrive?: { enabled: boolean };
  projects?: Project[];
  grants?: Grant[];
  subscription?: {
    status: "UNLINKED";
    planCode: null;
    paidUntil: null;
    billingStatus: null;
    explanation: string;
  };
};
type StoragePayload = { ok?: boolean; error?: string; storage?: DriveStorageQuota };

const statusLabels: Record<Grant["status"], string> = {
  ACTIVE: "Aktív", PENDING: "Később indul", EXPIRED: "Lejárt", REVOKED: "Visszavont",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Nincs rögzített dátum";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Ismeretlen" : date.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "–";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024).toFixed(0)} KiB`;
}

export default function DriveLicenseCenter() {
  const [license, setLicense] = useState<LicensePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedScope, setSelectedScope] = useState("");
  const [storage, setStorage] = useState<DriveStorageQuota | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/drive/license", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({})) as LicensePayload;
      if (!response.ok || !data.ok) throw Error(data.error || "Nem tölthetők be a licencadatok.");
      setLicense(data);
      setSelectedScope(current => {
        // /drive/licenc?project=<id> opens the selected Project Drive license.
        const requestedProject = new URLSearchParams(window.location.search).get("project");
        if (requestedProject && data.projects?.some(project => project.id === requestedProject)) {
          return "project:" + requestedProject;
        }
        if (current === "personal" && data.personalDrive?.enabled) return current;
        if (data.projects?.some(project => `project:${project.id}` === current)) return current;
        return data.personalDrive?.enabled ? "personal" : data.projects?.[0] ? `project:${data.projects[0].id}` : "";
      });
    } catch (error) {
      setLicense(null);
      setLoadError(error instanceof Error ? error.message : "Az adatok lekérése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedScope || !license?.ok) {
      setStorage(null);
      setStorageError("");
      setStorageLoading(false);
      return;
    }
    const activeProject = selectedScope.startsWith("project:")
      ? license.projects?.find(project => `project:${project.id}` === selectedScope)
      : null;
    if (selectedScope !== "personal" && !activeProject) return;
    const controller = new AbortController();
    setStorage(null);
    setStorageError("");
    setStorageLoading(true);
    const url = selectedScope === "personal"
      ? "/api/drive/personal/storage"
      : `/api/projects/${encodeURIComponent(activeProject!.id)}/drive/storage`;
    void fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as StoragePayload;
        if (!response.ok || !data.ok || !data.storage) throw Error(data.error || "Nem érhető el a tárhelykeret.");
        if (!controller.signal.aborted) setStorage(data.storage);
      })
      .catch(error => {
        if (!controller.signal.aborted) setStorageError(error instanceof Error ? error.message : "Nem érhető el a tárhelyadat.");
      })
      .finally(() => { if (!controller.signal.aborted) setStorageLoading(false); });
    return () => controller.abort();
  }, [selectedScope, license]);

  const activeGrants = (license?.grants || []).filter(grant => grant.status === "ACTIVE");
  const projects = license?.projects || [];
  const quotaFraction = storage?.quotaBytes ? Math.max(0, Math.min(100, (storage.occupiedBytes / storage.quotaBytes) * 100)) : 0;
  const storageKind = storage?.source === "PLAN" ? "Csomaghoz kapcsolt keret" :
    storage?.source === "OVERRIDE" ? "Egyedi tárhelykeret" : "Alapértelmezett tárhelykeret";

  return <div className={styles.surface}>
    <div className={styles.topline}>
      <Link className={styles.back} href="/drive"><ArrowLeft size={17} /> Vissza a Drive-ba</Link>
      <span className={styles.brand}><HardDrive size={17} /> DIMPRO Drive</span>
    </div>
    <main className={styles.container}>
      <header className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>DIMPRO Drive · személyes és projektlicencek</span>
          <h1><BadgeCheck size={28} /> Licenc és előfizetés</h1>
          <p>A saját Drive- és projektlicencek, jogosultságok és tárhelykeretek áttekintése. Az üzemeltetői Licencközpont külön felület.</p>
        </div>
        <button className={styles.refresh} type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCcw size={15} /> Frissítés
        </button>
      </header>

      {loading && <div className={styles.state}><Loader2 size={24} className={styles.spin}/> Licencadatok betöltése…</div>}
      {loadError && <div className={styles.error} role="alert">{loadError} <button type="button" onClick={() => void refresh()}>Újrapróbálás</button></div>}
      {!loading && license?.ok && <>
        <div className={styles.metrics}>
          <article><span><ShieldCheck size={16}/> Saját Drive hozzáférés</span>
            <strong>{license.personalDrive?.enabled ? "Aktív" : "Nincs engedélyezve"}</strong>
            <small>{license.personalDrive?.enabled ? "Központi AUTH jogosultság" : "A saját tárhely külön igényelhető"}</small></article>
          <article><span><Users size={16}/> Hozzáférhető projektek</span>
            <strong>{projects.length}</strong><small>Aktuális projekttagság alapján</small></article>
          <article><span><LockKeyhole size={16}/> Aktív Drive-jogok</span>
            <strong>{activeGrants.length}</strong><small>Központi AUTH-hozzáférési bejegyzés</small></article>
          <article><span><CreditCard size={16}/> Előfizetés</span>
            <strong>Összerendelésre vár</strong><small>Nem helyettesíti az AUTH jogosultságot</small></article>
        </div>

        <div className={styles.columns}>
          <section className={styles.panel}>
            <h2><BadgeCheck size={19}/> Felhasználói fiók</h2>
            <dl className={styles.dataRows}>
              <div><dt>Név</dt><dd>{license.user?.displayName || "Nincs megadva"}</dd></div>
              <div><dt>E-mail</dt><dd>{license.user?.email || "Nincs megadva"}</dd></div>
              <div><dt>Fiók</dt><dd>Közös DIMPRO AUTH</dd></div>
              <div><dt>Saját Drive</dt><dd>{license.personalDrive?.enabled ? "Engedélyezett" : "Még nem engedélyezett"}</dd></div>
            </dl>
            {!license.personalDrive?.enabled &&
              <Link className={styles.secondaryLink} href="/register/drive">Saját Drive igénylése <ArrowRight size={14}/></Link>}
          </section>
          <section className={styles.panel}>
            <h2><CreditCard size={19}/> Csomag és előfizetés</h2>
            <div className={styles.neutralNotice}><Info size={19}/>
              <span><strong>A számlázási licencadatok még nincsenek összekötve.</strong>
              <small>{license.subscription?.explanation}</small></span>
            </div>
            <dl className={styles.dataRows}>
              <div><dt>Termék</dt><dd>DIMPRO Drive</dd></div>
              <div><dt>Előfizetési csomag</dt><dd>Még nincs hitelesített adat</dd></div>
              <div><dt>Fizetési állapot</dt><dd>Még nincs hitelesített adat</dd></div>
              <div><dt>Előfizetés lejárata</dt><dd>Még nincs hitelesített adat</dd></div>
            </dl>
          </section>
        </div>

        <PersonalCommercialReadinessCard/>

        <section className={styles.panel}>
          <h2><Database size={19}/> Tárhelykeret és használat</h2>
          <label className={styles.scopePicker}>Munkatér
            <select value={selectedScope} onChange={event => {
              window.history.replaceState(window.history.state,"","/drive/licenc");
              setSelectedScope(event.target.value);
            }}>
              {!selectedScope && <option value="">Nincs hozzáférhető tárhely</option>}
              {license.personalDrive?.enabled && <option value="personal">Saját Drive</option>}
              {projects.map(project => <option value={`project:${project.id}`} key={project.id}>Projekt · {project.name}</option>)}
            </select>
          </label>
          {storageLoading && <div className={styles.state}><Loader2 size={18} className={styles.spin}/> Tárhelyadatok betöltése…</div>}
          {storageError && <p className={styles.muted} role="status">{storageError}</p>}
          {!storageLoading && storage && <div className={styles.quota}>
            <div className={styles.quotaMain}><strong>{formatBytes(storage.occupiedBytes)}</strong>
              <span>felhasználva / {formatBytes(storage.quotaBytes)} keret</span>
              <b>{Math.round(quotaFraction)}%</b></div>
            <div className={styles.progress} role="progressbar" aria-label="Tárhelyhasználat"
              aria-valuenow={Math.round(quotaFraction)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{width:`${quotaFraction}%`}}/>
            </div>
            <div className={styles.quotaDetails}>
              <span>Szabad: <strong>{formatBytes(storage.remainingBytes)}</strong></span>
              <span>Foglalt: <strong>{formatBytes(storage.usedBytes)}</strong></span>
              <span>Függő: <strong>{formatBytes(storage.reservedBytes)}</strong></span>
              <span>Forrás: <strong>{storageKind}</strong></span>
            </div>
          </div>}
          {!selectedScope && <p className={styles.muted}>Jelenleg nincs olyan Saját Drive vagy projektmunkatér, amelynek tárhelyadatait megtekinthetnéd.</p>}
          <Link className={styles.secondaryLink} href="mailto:admin@dimpro.hu?subject=DIMPRO%20Drive%20t%C3%A1rhely%20%C3%A9s%20licenc%20ig%C3%A9nyl%C3%A9s">
            <Mail size={15}/> Tárhely- vagy csomagbővítés igénylése <ArrowRight size={14}/>
          </Link>
        </section>

        {selectedScope.startsWith("project:") &&
          projects.filter(project => "project:"+project.id===selectedScope)
            .map(project => <ProjectDriveLicensePanel key={project.id} projectId={project.id} projectName={project.name}/>)}

        <section className={styles.panel}>
          <h2><Building2 size={19}/> Hozzáférhető projektmunkaterek</h2>
          {projects.length ? <div className={styles.projectList}>
            {projects.map(project => <div key={project.id}>
              <Building2 size={16}/><span><strong>{project.name}</strong><small>{project.code || project.id}</small></span>
              <b>{project.access}</b>
            </div>)}
          </div> : <p className={styles.muted}>Még nincs hozzáférhető projektmunkatér.</p>}
          <p className={styles.helper}>A projekttagság nem jelent automatikusan saját előfizetést. A projektmappák hozzáférését továbbra is az ACL és a szerepkörök szabályozzák.</p>
        </section>

        <section className={styles.panel}>
          <h2><Clock3 size={19}/> Drive-hozzáférési érvényességek</h2>
          {license.grants?.length ? <div className={styles.grantList}>
            {license.grants.map((grant,index) => <div key={index} className={styles.grant}>
              <CheckCircle2 size={17}/>
              <span><strong>{grant.roleName || grant.roleCode}</strong>
                <small>{grant.scope === "PROJECT" ? `Projekt: ${grant.externalProjectId || "belső azonosító"}` : "Személyes / globális Drive-hozzáférés"}</small></span>
              <span className={styles.grantDate}>{formatDate(grant.validFrom)} – {grant.validUntil ? formatDate(grant.validUntil) : "nincs záródátum"}</span>
              <b data-status={grant.status}>{statusLabels[grant.status]}</b>
            </div>)}
          </div> : <p className={styles.muted}>Nincs közvetlen Drive-hozzáférési bejegyzés. Projektmeghívás önálló jogosultsági kapcsolat alapján is létezhet.</p>}
          <p className={styles.helper}>Ezek technikai hozzáférési érvényességek, nem a fizetett licenc vagy számlázási időszak lejárati dátumai.</p>
        </section>
      </>}

      <footer className={styles.footer}><LockKeyhole size={15}/> Az oldal kizárólag a bejelentkezett DIMPRO-fiókod adatait olvassa, és nem módosít előfizetést vagy jogosultságot.</footer>
    </main>
  </div>;
}
