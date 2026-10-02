"use client";

import { Send } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

export default function DropActionButton({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <div className={styles.dropWrap}>
      <button
        type="button"
        className={`${styles.toolButton} ${styles.dropButton} ${iconOnly ? styles.toolIconOnly : ""}`}
        onClick={() => window.open("https://drop.dimpro.hu", "_blank", "noopener,noreferrer")}
        title="DROP küldés"
        aria-label="DROP küldés"
      >
        <Send size={iconOnly ? 16 : 14} />
        {!iconOnly && <span>DROP küldés</span>}
      </button>
      <div className={styles.dropDescription} role="tooltip">
        <strong>DIMPRO Drop</strong>
        Külső partnerektől fájlok fogadása és biztonságos csomagküldés. A Drop külön felületen nyílik meg, a projektkapcsolat később közvetlenül is átadható lesz.
      </div>
    </div>
  );
}
