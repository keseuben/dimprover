"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Keyboard, X } from "lucide-react";
import {
  D6_MODULES,
  projectGateModuleHref,
  type D6ModuleId,
} from "@/app/lib/project-gate/d6Modules";
import styles from "./ProjectGateShell.module.css";

type Props = {
  open: boolean;
  projectId: string;
  activeModuleId: D6ModuleId;
  onClose: () => void;
};

export default function ProjectGateModuleSwitcher({ open, projectId, activeModuleId, onClose }: Props) {
  const activeIndex = useMemo(
    () => Math.max(0, D6_MODULES.findIndex((item) => item.id === activeModuleId)),
    [activeModuleId],
  );
  const [selectedIndex, setSelectedIndex] = useState(activeIndex);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIndex(activeIndex);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (/^[1-6]$/.test(event.key)) {
        event.preventDefault();
        const directIndex = Number(event.key) - 1;
        const directModule = D6_MODULES[directIndex];
        if (directModule) window.location.assign(projectGateModuleHref(projectId, directModule.id));
        return;
      }

      if (event.key === "Tab" || event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const direction = event.shiftKey && event.key === "Tab" ? -1 : 1;
        setSelectedIndex((current) => (current + direction + D6_MODULES.length) % D6_MODULES.length);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => (current - 1 + D6_MODULES.length) % D6_MODULES.length);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selected = D6_MODULES[selectedIndex];
        if (selected) window.location.assign(projectGateModuleHref(projectId, selected.id));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, projectId, selectedIndex]);

  if (!open) return null;

  return (
    <div className={styles.moduleSwitcherBackdrop} role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={styles.moduleSwitcher}
        role="dialog"
        aria-modal="true"
        aria-label="D6 modulváltó"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.moduleSwitcherHeader}>
          <div>
            <span><Keyboard size={15} /> D6 modulváltó</span>
            <strong>Váltás másik projektmodulra</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Modulváltó bezárása" title="Bezárás">
            <X size={18} />
          </button>
        </header>

        <div className={styles.moduleSwitcherGrid}>
          {D6_MODULES.map((item, index) => {
            const Icon = item.Icon;
            const selected = index === selectedIndex;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.moduleSwitcherItem} ${selected ? styles.moduleSwitcherItemSelected : ""}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => window.location.assign(projectGateModuleHref(projectId, item.id))}
              >
                <span className={styles.moduleSwitcherIcon}><Icon size={20} /></span>
                <span className={styles.moduleSwitcherText}>
                  <strong>{item.hungarianName}</strong>
                  <small>DIMPRO {item.brandName}</small>
                </span>
                <kbd>{item.order}</kbd>
              </button>
            );
          })}
        </div>

        <footer className={styles.moduleSwitcherFooter}>
          <span><kbd>Tab</kbd> következő</span>
          <span><kbd>Shift</kbd> + <kbd>Tab</kbd> előző</span>
          <span><CornerDownLeft size={13} /> Enter megnyitás</span>
          <span><kbd>Esc</kbd> bezárás</span>
        </footer>
      </div>
    </div>
  );
}
