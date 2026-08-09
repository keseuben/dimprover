"use client";

import { Send } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

export default function DropActionButton() {
  return (
    <div className={styles.dropWrap}>
      <button
        type="button"
        className={`${styles.toolButton} ${styles.dropButton}`}
        onClick={() => window.open("https://drop.dimpro.hu", "_blank", "noopener,noreferrer")}
        aria-label="DIMPRO Drop megnyitása új lapon"
      >
        <Send size={14} />
        <span>DROP küldés</span>
      </button>
      <div className={styles.dropDescription} role="tooltip">
        <strong>DIMPRO Drop</strong>
        Külső partnerektől fájlok fogadása és biztonságos csomagküldés. A Drop külön felületen nyílik meg, a projektkapcsolat később közvetlenül is átadható lesz.
      </div>
    </div>
  );
}
