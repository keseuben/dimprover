"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Flag,
  Gauge,
} from "lucide-react";
import styles from "./ProjectPulsePlaceholder.module.css";

type PulseViewId = "territory" | "building" | "discipline";

type ProjectPulsePlaceholderProps = {
  progressPercent?: number;
  projectName?: string;
};

const STORAGE_COLLAPSED = "dimpro-projectpulse-collapsed";
const STORAGE_VIEW = "dimpro-projectpulse-view";

const VIEWS: Array<{
  id: PulseViewId;
  label: string;
  image: string;
  alt: string;
  caption: string;
}> = [
  {
    id: "territory",
    label: "Terület nézet",
    image: "/images/projektpulzus/projektpulzus-terulet.svg",
    alt: "Projektpulzus területnézet több épület és projektrész eltérő előrehaladásával",
    caption: "Projektterület · épületek és külső munkák összehasonlítása",
  },
  {
    id: "building",
    label: "Épület nézet",
    image: "/images/projektpulzus/projektpulzus-epulet.svg",
    alt: "Projektpulzus épületnézet a projektfázisok előrehaladásával",
    caption: "Kiválasztott épület · projektfázisok és következő mérföldkövek",
  },
  {
    id: "discipline",
    label: "Szakági nézet",
    image: "/images/projektpulzus/projektpulzus-szakag.svg",
    alt: "Projektpulzus szakági nézet absztrakt kockasziluettekkel",
    caption: "Kiválasztott épület · szakági készültség és eltérések",
  },
];

function isPulseView(value: string | null): value is PulseViewId {
  return value === "territory" || value === "building" || value === "discipline";
}

export default function ProjectPulsePlaceholder({
  progressPercent = 68,
  projectName = "Aktív projekt",
}: ProjectPulsePlaceholderProps) {
  const [view, setView] = useState<PulseViewId>("territory");
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedView = window.localStorage.getItem(STORAGE_VIEW);
    const savedCollapsed = window.localStorage.getItem(STORAGE_COLLAPSED);

    if (isPulseView(savedView)) setView(savedView);
    if (savedCollapsed === "true" || savedCollapsed === "false") {
      setCollapsed(savedCollapsed === "true");
    }
    setHydrated(true);
  }, []);

  const activeView = useMemo(
    () => VIEWS.find((item) => item.id === view) ?? VIEWS[0],
    [view],
  );

  function changeView(nextView: PulseViewId) {
    setView(nextView);
    window.localStorage.setItem(STORAGE_VIEW, nextView);
    if (collapsed) {
      setCollapsed(false);
      window.localStorage.setItem(STORAGE_COLLAPSED, "false");
    }
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_COLLAPSED, String(next));
      return next;
    });
  }

  return (
    <section
      className={`${styles.pulse} ${collapsed ? styles.pulseCollapsed : ""}`}
      aria-label="Projektpulzus"
      data-hydrated={hydrated}
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.pulseIcon}><Activity size={23} strokeWidth={2.1} /></span>
          <div>
            <strong>Projektpulzus</strong>
            {!collapsed && <small>{activeView.caption}</small>}
          </div>
        </div>

        <div className={styles.viewSwitch} role="tablist" aria-label="Projektpulzus nézetek">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              className={view === item.id ? styles.viewButtonActive : ""}
              onClick={() => changeView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.collapseButton}
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Projektpulzus kinyitása" : "Projektpulzus összecsukása"}
          title={collapsed ? "Projektpulzus kinyitása" : "Projektpulzus összecsukása"}
        >
          {collapsed ? <ChevronDown size={19} /> : <ChevronUp size={19} />}
        </button>
      </header>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.progressRing} style={{ "--pulse-progress": `${progressPercent * 3.6}deg` } as CSSProperties} />
          <span><small>Teljes készültség</small><strong>{progressPercent}%</strong></span>
        </div>
        <div className={styles.metric}>
          <AlertCircle size={20} className={styles.dangerIcon} />
          <span><small>Kritikus pontok</small><strong>3</strong></span>
        </div>
        <div className={`${styles.metric} ${styles.metricWide}`}>
          <Flag size={20} />
          <span><small>Következő mérföldkő</small><strong>Szerkezetépítés – B épület</strong></span>
        </div>
        <div className={`${styles.metric} ${styles.metricWide}`}>
          <Gauge size={20} className={styles.warningIcon} />
          <span><small>Ütemállapot</small><strong className={styles.warningText}>Enyhén késésben</strong></span>
        </div>
      </div>

      {!collapsed && (
        <div className={styles.stage}>
          <div className={styles.imageFrame}>
            <Image
              key={activeView.id}
              className={styles.image}
              src={activeView.image}
              alt={activeView.alt}
              width={1600}
              height={620}
              sizes="(max-width: 900px) 920px, 100vw"
              unoptimized
              draggable={false}
            />
            <span className={styles.placeholderBadge}>Ideiglenes látványkép</span>
          </div>
          <footer className={styles.footer}>
            <span>{projectName}</span>
            <small>A nézetváltó és az összecsukás működik. Az adatvezérelt Projektpulzus motor külön fejlesztési körben készül.</small>
          </footer>
        </div>
      )}
    </section>
  );
}
