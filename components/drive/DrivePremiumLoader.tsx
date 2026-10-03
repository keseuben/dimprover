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

const BOOT_STEPS: BootStep[] = [
  { key: "connection", label: "Kapcsolat és rendszerállapot", shortLabel: "Kapcsolat", threshold: 16, icon: Network },
  { key: "permissions", label: "Jogosultságok ellenőrzése", shortLabel: "Jogosultságok", threshold: 32, icon: ShieldCheck },
  { key: "workspace", label: "Workspace előkészítése", shortLabel: "Workspace", threshold: 50, icon: Layers3 },
  { key: "tree", label: "Projektmappák és dokumentumtár", shortLabel: "Dokumentumtár", threshold: 70, icon: FolderTree },
  { key: "metadata", label: "Metaadatok és nézeti rétegek", shortLabel: "Metaadatok", threshold: 88, icon: Database },
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

function statusForProgress(progress: number) {
  if (progress < 16) return "Biztonságos kapcsolat inicializálása…";
  if (progress < 32) return "Projektjogosultságok és hozzáférési szabályok ellenőrzése…";
  if (progress < 50) return "DIMPRO Workspace 1.0 környezet előkészítése…";
  if (progress < 70) return "Projektmappák és dokumentumtár betöltése…";
  if (progress < 88) return "Műszaki metaadatok és CsomagBOX kapcsolatok szinkronizálása…";
  return "Drive munkaterület végső összeállítása…";
}

export default function DrivePremiumLoader() {
  const [progress, setProgress] = useState(6);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setElapsedMs(elapsed);
      const target = progressTarget(elapsed);
      setProgress((current) => {
        if (current >= target) return current;
        const distance = target - current;
        const step = distance > 18 ? 2.2 : distance > 8 ? 1.35 : 0.7;
        return Math.min(target, Number((current + step).toFixed(1)));
      });
    }, 55);
    return () => window.clearInterval(interval);
  }, []);

  const roundedProgress = Math.round(progress);
  const currentStepIndex = useMemo(() => {
    let index = 0;
    for (let i = 0; i < BOOT_STEPS.length; i += 1) {
      if (progress >= BOOT_STEPS[i].threshold) index = Math.min(i + 1, BOOT_STEPS.length - 1);
    }
    return Math.min(index, BOOT_STEPS.length - 1);
  }, [progress]);

  const status = statusForProgress(progress);
  const slowHint = elapsedMs > 7000;

  return (
    <section className={styles.root} role="status" aria-live="polite" aria-label="DIMPRO Drive betöltése">
      <div className={styles.blueprint} aria-hidden="true" />
      <div className={styles.ambientGlow} aria-hidden="true" />

      <div className={styles.loaderCard}>
        <div className={styles.brandLine}>
          <span className={styles.brandKicker}>DIMPRO SYSTEM</span>
          <span className={styles.brandPulse}><i /> SECURE BOOT</span>
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
            <Image src="/dimprover-logo.png" alt="" width={84} height={84} priority className={styles.logo} />
          </div>

          <div className={styles.percentRing}>
            <strong>{roundedProgress}</strong>
            <span>%</span>
          </div>
        </div>

        <div className={styles.heading}>
          <span className={styles.productLabel}>DIMPRO DRIVE</span>
          <h2>Digitális projektmunkatér betöltése</h2>
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
            <span>RENDSZERINDÍTÁS</span>
            <strong>{roundedProgress}%</strong>
          </div>
        </div>

        <div className={styles.bootSteps}>
          {BOOT_STEPS.map((step, index) => {
            const Icon = step.icon;
            const done = progress >= step.threshold;
            const active = !done && index === currentStepIndex;
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
          <span>{slowHint ? "Kapcsolat ellenőrzése folyamatban…" : "Titkosított projektkapcsolat"}</span>
        </div>
      </div>
    </section>
  );
}
