"use client";

import { X } from "lucide-react";
import DevPwaControls from "@/components/admin/DevPwaControls";
import styles from "./DeveloperConsole.module.css";

export default function AppInstallDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className={styles.drawerLayer} role="presentation"><button type="button" className={styles.drawerBackdrop} aria-label="Telepítés panel bezárása" onClick={onClose} /><aside className={styles.drawer} aria-label="BENJADMIN PWA és értesítések"><header className={styles.drawerHeader}><div><span>ALKALMAZÁS / ÉRTESÍTÉSEK</span><strong>Windows · tablet · telefon · PWA</strong></div><button type="button" onClick={onClose} aria-label="Bezárás"><X size={18} /></button></header><div className={`${styles.drawerBody} ${styles.pwaDrawerBody}`}><p>A Fejlesztői Konzol a BENJADMIN PWA-motort használja. Telepített módban külön alkalmazásablakként fut, a téma és a munkamenet-preferenciák helyben megmaradnak.</p><DevPwaControls /></div></aside></div>;
}
