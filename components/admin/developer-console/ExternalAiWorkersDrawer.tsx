"use client";

import { ChevronRight, CircleDollarSign, Clock3, Eye, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import BenjadminAvatar from "./BenjadminAvatar";
import type { LiveProject } from "./types";
import styles from "./DeveloperConsole.module.css";

type ExternalTask = {
  id: string;
  projectId: string | null;
  title: string;
  goal: string;
  workflowState: string;
  launchMode: string;
  modelPreference: string;
  moduleHint: string | null;
  taskBudgetHuf: number;
  forgeBudgetHuf: number;
  guardBudgetHuf: number;
  maxActiveMinutesPerWorker: number;
  maxFixRounds: number;
  technicalScopeMode: string;
  createdAt: string;
};

type ExternalWorker = {
  code: "MFORGE" | "VGUARD";
  displayName: string;
  personName: string;
  role: string;
  layer: string;
  avatar: string;
  capabilities: string[];
};

type Payload = {
  ok?: boolean;
  tasks?: ExternalTask[];
  workers?: ExternalWorker[];
  defaults?: {
    taskBudgetHuf?: number;
    maxActiveMinutesPerWorker?: number;
    maxFixRounds?: number;
  };
  adapter?: { ready?: boolean; detail?: string };
  error?: string;
};

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

const pipeline = ["FELADAT", "FORGE", "GUARD", "GATE", "DEV"];

export default function ExternalAiWorkersDrawer({ open, onClose, projects, selectedProjectId }: {
  open: boolean;
  onClose: () => void;
  projects: LiveProject[];
  selectedProjectId: string;
}) {
  const [tasks, setTasks] = useState<ExternalTask[]>([]);
  const [workers, setWorkers] = useState<ExternalWorker[]>([]);
  const [adapterDetail, setAdapterDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [projectId, setProjectId] = useState(selectedProjectId);
  const [moduleHint, setModuleHint] = useState("");
  const [launchMode, setLaunchMode] = useState("WORKER");
  const [modelPreference, setModelPreference] = useState("AUTO");
  const [budget, setBudget] = useState(2500);
  const [minutes, setMinutes] = useState(45);

  async function load() {
    const response = await fetch("/api/dev/ai-worker/tasks", { headers: adminHeaders(), cache: "no-store" });
    const payload = await response.json().catch(() => null) as Payload | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A Külső AI Worker adatok nem tölthetők be.");
    setTasks(payload.tasks || []);
    setWorkers(payload.workers || []);
    setAdapterDetail(payload.adapter?.detail || "");
    if (payload.defaults?.taskBudgetHuf) setBudget((current) => current || payload.defaults!.taskBudgetHuf!);
    if (payload.defaults?.maxActiveMinutesPerWorker) setMinutes((current) => current || payload.defaults!.maxActiveMinutesPerWorker!);
  }

  useEffect(() => {
    if (!open) return;
    setProjectId(selectedProjectId);
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "A Külső AI Worker adatok nem tölthetők be."));
  }, [open, selectedProjectId]);

  async function createTask() {
    if (!title.trim() || !goal.trim() || !projectId) {
      setMessage("Feladatnév, cél és projekt szükséges.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/dev/ai-worker/tasks", {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({ title, goal, projectId, moduleHint, launchMode, modelPreference, taskBudgetHuf: budget, maxActiveMinutesPerWorker: minutes }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; task?: { id?: string }; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Az AI worker task nem hozható létre.");
      setTitle("");
      setGoal("");
      setMessage(`AI worker task létrejött: ${payload.task?.id || "—"}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az AI worker task nem hozható létre.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(task: ExternalTask, state: "READY" | "PAUSED") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/transition`, {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({ state }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Az állapot nem módosítható.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az állapot nem módosítható.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className={styles.drawerLayer} role="presentation">
      <button type="button" className={styles.drawerBackdrop} aria-label="Külső AI Workerek bezárása" onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerExtraWide}`} aria-label="Külső AI Worker V1">
        <header className={styles.drawerHeader}>
          <div><span>KÜLSŐ AI WORKER V1</span><strong>M.Forge-AI + V.Guard-AI · BENJADMIN Control Plane</strong></div>
          <button type="button" onClick={onClose} aria-label="Bezárás"><X size={18} /></button>
        </header>
        <div className={styles.drawerBody}>
          <section className={styles.aiWorkerProfiles}>
            {workers.map((worker) => (
              <article key={worker.code}>
                <BenjadminAvatar member={worker.code} size="head" status="idle" eager />
                <div><strong>{worker.displayName} · {worker.personName}</strong><span>{worker.role}</span><p>{worker.code === "MFORGE" ? "Implementáció, refaktor, frontend/backend/API." : "Független review, security, regresszió és minőségellenőrzés."}</p><small>Külső worker réteg · PROD hozzáférés: TILTVA</small></div>
              </article>
            ))}
          </section>

          <section className={styles.aiWorkerCreate}>
            <header><Sparkles size={17} /><div><strong>Új AI fejlesztési feladat</strong><span>Terméknyelvű leírás · technikai scope automatikus</span></div></header>
            <div className={styles.aiWorkerFormGrid}>
              <label><span>Feladat neve</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Rövid, érthető cím" /></label>
              <label><span>Érintett modul · opcionális</span><input value={moduleHint} onChange={(event) => setModuleHint(event.target.value)} placeholder="pl. Projektkapu" /></label>
              <label className={styles.aiWorkerWide}><span>Mit szeretnél elérni?</span><textarea rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Írd le termék- vagy műszaki nyelven. Fájlt, mappát, branchet vagy worktree-t nem kell megadnod." /></label>
              <label><span>Projekt</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Válassz projektet</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label><span>Indítási mód</span><select value={launchMode} onChange={(event) => setLaunchMode(event.target.value)}><option value="QUICK">Gyors</option><option value="WORKER">Worker</option><option value="PARALLEL">Párhuzamos</option></select></label>
              <label><span>Modellválasztás</span><select value={modelPreference} onChange={(event) => setModelPreference(event.target.value)}><option value="AUTO">AUTO</option><option value="CLAUDE">Claude</option><option value="OPENAI_CODEX">OpenAI-Codex</option></select></label>
              <label><span>Költségkeret · Ft</span><input type="number" min={100} step={100} value={budget} onChange={(event) => setBudget(Number(event.target.value))} /></label>
              <label><span>Max. aktív futás · perc/worker</span><input type="number" min={5} max={480} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>
            </div>
            <div className={styles.aiScopeHint}><Eye size={16} /><div><strong>Scope megtekintése</strong><span>V1.1-ben a BENJADMIN automatikusan felderíti a route-okat, komponenseket, API-kat, service-eket, type-okat, teszteket és dokumentációt. Kézi fájl/mappa-választás nem lesz kötelező.</span></div></div>
            <div className={styles.aiWorkerSafety}><ShieldCheck size={16} /><span>PROD SSH · PROD DB write · PROD secret · PROD restart/deploy: technikailag tiltandó. V1.0-ban külső provider még nem indul.</span></div>
            <button type="button" className={styles.aiWorkerCreateButton} onClick={() => void createTask()} disabled={busy}>{busy ? "FOLYAMATBAN…" : "AI WORKER TASK LÉTREHOZÁSA"}</button>
          </section>

          {message ? <div className={styles.drawerNotice}>{message}</div> : null}
          {adapterDetail ? <div className={styles.aiAdapterNote}><strong>Worker Model Adapter</strong><span>{adapterDetail}</span></div> : null}

          <section className={styles.aiWorkerTaskList}>
            {tasks.map((task) => (
              <article key={task.id}>
                <header><div><strong>{task.title}</strong><span>{task.moduleHint || "Automatikus modulazonosítás"} · {task.launchMode} · {task.modelPreference}</span></div><b>{task.workflowState}</b></header>
                <div className={styles.aiWorkerPipeline}>{pipeline.map((step, index) => <span key={step}>{step}{index < pipeline.length - 1 ? <ChevronRight size={12} /> : null}</span>)}</div>
                <div className={styles.aiWorkerFour}>
                  <div><small>FELADAT</small><strong>{task.goal.slice(0, 115)}</strong><span>{task.technicalScopeMode === "AUTO_BENJADMIN" ? "Scope: automatikus" : task.technicalScopeMode}</span></div>
                  <div><small>WORKER</small><strong>M.Forge-AI → V.Guard-AI</strong><span>Provider: mock V1.0</span></div>
                  <div><small>ELLENŐRZÉS</small><strong>Scope · Review · Gate</strong><span>Max. javítási kör: {task.maxFixRounds}</span></div>
                  <div><small>EREDMÉNY</small><strong>{task.taskBudgetHuf.toLocaleString("hu-HU")} Ft · {task.maxActiveMinutesPerWorker} perc</strong><span>DEV READY: még nem</span></div>
                </div>
                <footer>
                  <span><CircleDollarSign size={13} /> Forge {task.forgeBudgetHuf.toLocaleString("hu-HU")} Ft · Guard {task.guardBudgetHuf.toLocaleString("hu-HU")} Ft</span>
                  <span><Clock3 size={13} /> {task.maxActiveMinutesPerWorker} perc/worker</span>
                  <div>{task.workflowState === "DRAFT" ? <button type="button" onClick={() => void transition(task, "READY")} disabled={busy}>ELŐKÉSZÍTÉS KÉSZ</button> : null}{task.workflowState === "READY" ? <button type="button" onClick={() => void transition(task, "PAUSED")} disabled={busy}>SZÜNET</button> : null}{task.workflowState === "PAUSED" ? <button type="button" onClick={() => void transition(task, "READY")} disabled={busy}>FOLYTATÁS</button> : null}</div>
                </footer>
              </article>
            ))}
            {!tasks.length ? <div className={styles.railEmpty}>Még nincs Külső AI Worker V1 task.</div> : null}
          </section>
        </div>
      </aside>
    </div>
  );
}
