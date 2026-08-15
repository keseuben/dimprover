"use client";

import { CheckSquare2, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import BenjadminAvatar from "./BenjadminAvatar";
import type { ConsoleTarget, LiveProject } from "./types";
import styles from "./DeveloperConsole.module.css";

const targets: Array<{ value: ConsoleTarget; label: string }> = [
  { value: "BENAI", label: "Ben-AI · AUTO" },
  { value: "ARMINAI", label: "Ármin" },
  { value: "JAZMINAI", label: "Jázmin" },
  { value: "OUTMINAI", label: "Outmin" },
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
        <div className={styles.targetButtons} aria-label="Ben-AI fejlesztési koordináció és opcionális worker preferencia">
          {targets.map((item) => <button type="button" key={item.value} className={target === item.value ? styles.activeTarget : ""} onClick={() => setTarget(item.value)} title={item.value === "BENAI" ? "Ben-AI automatikusan a szabad és jogosult kódolónak osztja ki." : `${item.label} preferálása; Ben-AI előbb ellenőrzi, hogy szabad-e.`}>{item.label}</button>)}
        </div>
        <div className={styles.composerControls}>
          <label><CheckSquare2 size={14} /><input type="checkbox" checked={createTask} onChange={(event) => setCreateTask(event.target.checked)} /> Fejlesztési feladat létrehozása</label>
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
