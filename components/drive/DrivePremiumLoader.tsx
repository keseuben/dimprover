"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Check, Database, FolderTree, Layers3, Network, ShieldCheck } from "lucide-react";
import styles from "./DrivePremiumLoader.module.css";

type BootStep = {
  key: string;
  label: string;
  shortLabel: string;
  threshold: number;
  icon: typeof Network;
};

const PROJECT_BOOT_STEPS: BootStep[] = [
  { key: "connection", label: "Kapcsolat és rendszerállapot", shortLabel: "Kapcsolat", threshold: 16, icon: Network },
  { key: "permissions", label: "Jogosultságok ellenőrzése", shortLabel: "Jogosultságok", threshold: 32, icon: ShieldCheck },
  { key: "workspace", label: "Workspace előkészítése", shortLabel: "Workspace", threshold: 50, icon: Layers3 },
  { key: "tree", label: "Projektmappák és dokumentumtár", shortLabel: "Dokumentumtár", threshold: 70, icon: FolderTree },
  { key: "metadata", label: "Metaadatok és nézeti rétegek", shortLabel: "Metaadatok", threshold: 88, icon: Database },
];

const PERSONAL_BOOT_STEPS: BootStep[] = [
  { key: "connection", label: "Kapcsolat és rendszerállapot", shortLabel: "Kapcsolat", threshold: 16, icon: Network },
  { key: "permissions", label: "Személyes Drive jogosultság ellenőrzése", shortLabel: "Jogosultságok", threshold: 32, icon: ShieldCheck },
  { key: "workspace", label: "Saját Drive munkatér előkészítése", shortLabel: "Saját Drive", threshold: 50, icon: Layers3 },
  { key: "content", label: "USER_ROOT tartalom betöltése", shortLabel: "Tartalom", threshold: 70, icon: FolderTree },
  { key: "metadata", label: "Fájlmetaadatok és biztonsági állapot", shortLabel: "Metaadatok", threshold: 88, icon: Database },
];

function progressTarget(elapsedMs: number) {
  if (elapsedMs < 420) return 12;
  if (elapsedMs < 900) return 24;
  if (elapsedMs < 1500) return 39;
  if (elapsedMs < 2200) return 56;
  if (elapsedMs < 3100) return 72;
  if (elapsedMs < 4200) return 84;
  return 92;
}

function statusForProgress(progress: number, workspaceType: "PROJECT" | "PERSONAL") {
  if (progress < 16) return "Biztonságos kapcsolat inicializálása…";
  if (progress < 32) return workspaceType === "PERSONAL"
    ? "Személyes Drive jogosultság ellenőrzése…"
    : "Projektjogosultságok és hozzáférési szabályok ellenőrzése…";
  if (progress < 50) return workspaceType === "PERSONAL"
    ? "Saját Drive munkatér előkészítése…"
    : "DIMPRO Workspace 1.0 környezet előkészítése…";
  if (progress < 70) return workspaceType === "PERSONAL"
    ? "USER_ROOT tartalom betöltése…"
    : "Projektmappák és dokumentumtár betöltése…";
  if (progress < 88) return workspaceType === "PERSONAL"
    ? "Fájlmetaadatok és biztonsági állapot ellenőrzése…"
    : "Műszaki metaadatok és CsomagBOX kapcsolatok szinkronizálása…";
  return "Drive munkaterület végső összeállítása…";
}

type Props = { complete?: boolean; workspaceType?: "PROJECT" | "PERSONAL" };

export default function DrivePremiumLoader({ complete = false, workspaceType = "PROJECT" }: Props) {
  const [progress, setProgress] = useState(6);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setElapsedMs(elapsed);
      const target = complete ? 100 : progressTarget(elapsed);
      setProgress((current) => {
        if (current >= target) return current;
        const distance = target - current;
        const step = complete
          ? Math.max(4, Math.ceil(distance * 0.35))
          : distance > 18
            ? 2.2
            : distance > 8
              ? 1.35
              : 0.7;
        return Math.min(target, Number((current + step).toFixed(1)));
      });
    }, 55);
    return () => window.clearInterval(interval);
  }, [complete]);

  const roundedProgress = Math.round(progress);
  const bootSteps = workspaceType === "PERSONAL" ? PERSONAL_BOOT_STEPS : PROJECT_BOOT_STEPS;
  const currentStepIndex = useMemo(() => {
    let index = 0;
    for (let i = 0; i < bootSteps.length; i += 1) {
      if (progress >= bootSteps[i].threshold) index = Math.min(i + 1, bootSteps.length - 1);
    }
    return Math.min(index, bootSteps.length - 1);
  }, [bootSteps, progress]);

  const ready = complete && roundedProgress >= 100;
  const status = ready ? "DIMPRO Drive készen áll." : statusForProgress(progress, workspaceType);
  const slowHint = !complete && elapsedMs > 7000;

  return (
    <section className={styles.root} role="status" aria-live="polite" aria-label="DIMPRO Drive betöltése">
      <div className={styles.blueprint} aria-hidden="true" />
      <div className={styles.ambientGlow} aria-hidden="true" />

      <div className={styles.loaderComposition}>
        <div className={[styles.loaderCard, ready ? styles.loaderCardComplete : ""].filter(Boolean).join(" ")}>
        <div className={styles.brandLine}>
          <span className={styles.brandKicker}>DIMPRO SYSTEM</span>
          <span className={styles.brandPulse}><i /> {ready ? "SYSTEM READY" : "SECURE BOOT"}</span>
        </div>

        <div className={styles.visualStage} aria-hidden="true">
          <div className={styles.outerOrbit}>
            <span className={`${styles.orbitNode} ${styles.node1}`} />
            <span className={`${styles.orbitNode} ${styles.node2}`} />
            <span className={`${styles.orbitNode} ${styles.node3}`} />
            <span className={`${styles.orbitNode} ${styles.node4}`} />
            <span className={`${styles.orbitNode} ${styles.node5}`} />
            <span className={`${styles.orbitNode} ${styles.node6}`} />
          </div>
          <div className={styles.middleOrbit} />
          <div className={styles.innerOrbit} />

          <div className={styles.logoCore}>
            <span className={styles.logoScan} />
            <Image src="/dimprover-logo.png" alt="" width={132} height={132} priority className={styles.logo} />
          </div>

          <div className={styles.percentRing}>
            <strong>{roundedProgress}</strong>
            <span>%</span>
          </div>
        </div>

        <div className={styles.heading}>
          <span className={styles.productLabel}>DIMPRO DRIVE</span>
          <h2>{ready ? "DIMPRO Drive készen áll" : workspaceType === "PERSONAL" ? "Személyes Drive betöltése" : "Digitális projektmunkatér betöltése"}</h2>
          <p>{status}</p>
        </div>

        <div className={styles.progressBlock}>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={roundedProgress}
            aria-label="Drive betöltési folyamat"
          >
            <span className={styles.progressGrid} aria-hidden="true" />
            <span className={styles.progressFill} style={{ width: `${progress}%` }}>
              <i className={styles.progressShimmer} />
            </span>
          </div>
          <div className={styles.progressMeta}>
            <span>{ready ? "RENDSZER KÉSZ" : "RENDSZERINDÍTÁS"}</span>
            <strong>{roundedProgress}%</strong>
          </div>
        </div>

        <div className={styles.bootSteps}>
          {bootSteps.map((step, index) => {
            const Icon = step.icon;
            const done = ready || progress >= step.threshold;
            const active = !ready && !done && index === currentStepIndex;
            return (
              <div
                key={step.key}
                className={[
                  styles.bootStep,
                  done ? styles.bootStepDone : "",
                  active ? styles.bootStepActive : "",
                ].filter(Boolean).join(" ")}
                title={step.label}
              >
                <span className={styles.stepIcon}>
                  {done ? <Check size={14} strokeWidth={2.5} /> : <Icon size={14} strokeWidth={1.9} />}
                </span>
                <span>{step.shortLabel}</span>
              </div>
            );
          })}
        </div>

        <div className={styles.systemFooter}>
          <span><i className={styles.liveDot} /> DEV WORKSPACE</span>
          <span>Workspace 1.0</span>
          <span className={styles.footerDivider} />
          <span>{ready ? "Munkatér előkészítve" : slowHint ? "Kapcsolat ellenőrzése folyamatban…" : workspaceType === "PERSONAL" ? "Titkosított személyes Drive kapcsolat" : "Titkosított projektkapcsolat"}</span>
        </div>
        </div>

        <div className={[styles.driveWordmark, ready ? styles.driveWordmarkReady : ""].filter(Boolean).join(" ")} aria-label="DIMPRO Drive">
          <div className={styles.driveWordmarkMain}>
            <strong>DIMPRO</strong>
            <span>DRIVE</span>
          </div>
          <small>DIGITÁLIS PROJEKTMUNKATÉR</small>
        </div>
      </div>
    </section>
  );
}
