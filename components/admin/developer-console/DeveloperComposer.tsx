"use client";

import { CheckSquare2, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import BenjadminAvatar from "./BenjadminAvatar";
import type { ConsoleTarget, LiveProject } from "./types";
import styles from "./DeveloperConsole.module.css";

const internalTargets: Array<{ value: ConsoleTarget; label: string; title: string }> = [
  { value: "BENAI", label: "Ben-AI · AUTO", title: "Ben-AI koordináció és automatikus belső worker-kiosztás." },
  { value: "ARMINAI", label: "Ármin", title: "ÁrminAI belső kódmérnök címzése." },
  { value: "JAZMINAI", label: "Jázmin", title: "JázminAI belső kódmérnök címzése." },
  { value: "OUTMINAI", label: "Outmin", title: "OutminAI belső kódmérnök címzése." },
];

const externalTargets: Array<{ value: ConsoleTarget; label: string; title: string }> = [
  { value: "MFORGE", label: "M.Forge-AI", title: "Külső kódmérnök. Fejlesztési task esetén a Külső AI Worker workflow indul." },
  { value: "VGUARD", label: "V.Guard-AI", title: "Független review / quality worker. Írási taskot nem kaphat; meglévő eredményt ellenőriz." },
];



export default function DeveloperComposer({ projects, selectedProjectId, onProjectChange, onSend, busy }: {
  projects: LiveProject[];
  selectedProjectId: string;
  onProjectChange: (id: string) => void;
  onSend: (input: { text: string; target: ConsoleTarget; createTask: boolean; kind: "INSTRUCTION" | "DECISION" }) => Promise<boolean>;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState<ConsoleTarget>("BENAI");
  const [createTask, setCreateTask] = useState(true);
  const [decision, setDecision] = useState(false);
  const reviewOnly = target === "VGUARD";

  function chooseTarget(next: ConsoleTarget) {
    setTarget(next);
    if (next === "VGUARD") setCreateTask(false);
  }

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    const ok = await onSend({ text: value, target, createTask, kind: decision ? "DECISION" : "INSTRUCTION" });
    if (ok) { setText(""); setDecision(false); }
  }

  return (
    <section data-testid="benjadmin-developer-composer" className={styles.composer} aria-label="Fejlesztői utasítás beviteli sáv">
      <div className={styles.composerLeaderAvatar} aria-label="BENJADMIN · VEZETŐ">
        <BenjadminAvatar member="BENJADMIN" size="task" status={busy ? "working" : "idle"} eager />
        <span>BENJADMIN</span>
      </div>
      <div className={styles.composerEntryCard}>
      <div className={styles.composerOptions}>
        <div className={styles.targetGroups} aria-label="BENJADMIN AI címzettek">
          <div className={styles.targetGroup}><span>BELSŐ</span><div className={styles.targetButtons}>{internalTargets.map((item) => <button type="button" key={item.value} className={target === item.value ? styles.activeTarget : ""} onClick={() => chooseTarget(item.value)} title={item.title}>{item.label}</button>)}</div></div>
          <div className={`${styles.targetGroup} ${styles.externalTargetGroup}`}><span>KÜLSŐ</span><div className={styles.targetButtons}>{externalTargets.map((item) => <button type="button" key={item.value} data-external-worker={item.value} className={target === item.value ? styles.activeTarget : ""} onClick={() => chooseTarget(item.value)} title={item.title}>{item.label}</button>)}</div></div>
        </div>
        <div className={styles.composerControls}>
          <label title={reviewOnly ? "V.Guard review-only worker: új kódolási task helyett meglévő fejlesztési eredményt ellenőriz." : undefined}><CheckSquare2 size={14} /><input type="checkbox" checked={createTask} disabled={reviewOnly} onChange={(event) => setCreateTask(event.target.checked)} /> {reviewOnly ? "Review-only · meglévő eredmény" : target === "MFORGE" ? "Külső fejlesztési task létrehozása" : "Fejlesztési feladat létrehozása"}</label>
          <button type="button" className={decision ? styles.decisionActive : ""} onClick={() => setDecision((value) => !value)}><Sparkles size={14} /> Vezetői döntés</button>
          <select value={selectedProjectId} onChange={(event) => onProjectChange(event.target.value)} aria-label="Aktív fejlesztési projekt">
            <option value="">Projekt nélkül / általános</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>
      </div>
      <div className={styles.composerInputRow}>
        <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); void submit(); } }} placeholder="Írj a fejlesztői csapatnak… (Ctrl+Enter: küldés)" rows={2} />
        <button type="button" className={styles.sendButton} onClick={() => void submit()} disabled={busy || !text.trim()}>{busy ? <span className={styles.dotPulse}>•••</span> : <Send size={17} />}<span>KÜLDÉS</span></button>
      </div>
      </div>
    </section>
  );
}
