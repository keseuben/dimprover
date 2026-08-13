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
  scopeAnalysisState: string;
  scopeAnalysis: {
    overallRisk?: "GREEN" | "YELLOW" | "RED";
    reviewCount?: number;
    deniedCount?: number;
    safeToPreflight?: boolean;
    candidates?: Array<{ path: string; riskLevel: "GREEN" | "YELLOW" | "RED"; decision: string; reasons: string[]; evidence: string[] }>;
  };
  scopeExpansionRequest: { id?: string; status?: string; candidatePaths?: string[]; decision?: string };
  preflight: { state?: string; checkedAt?: string; scopeConflictCount?: number };
  checkpoint: { id?: string; sha256?: string };
  contextPack: { version?: string; fileCount?: number; scopeCount?: number; yellowExcluded?: boolean };
  contextPackContent: { id?: string; sha256?: string; fileCount?: number; totalBytes?: number; excludedCount?: number; secretContentIncluded?: boolean };
  providerPrompt: { id?: string; sha256?: string; bytes?: number; fileCount?: number; allowedPathCount?: number; productionAccess?: string };
  providerOutputArtifact: { id?: string; sha256?: string; changedFileCount?: number; provider?: string; modelId?: string };
  runCoordinator: { state?: string; checkedAt?: string; code?: string; blockers?: string[]; sideEffectsCreated?: boolean };
  workspacePlan: { branchName?: string; worktreePath?: string; baselineCommit?: string; workerCode?: string };
  patchApplication: { state?: string; changedFileCount?: number; committed?: boolean; integrated?: boolean };
  mforgeResult: { state?: string; commit?: string; baselineCommit?: string; changedFileCount?: number; changedPaths?: string[]; productionAccess?: string };
  vguardReviewPrompt: { id?: string; sha256?: string; bytes?: number; resultCommit?: string; changedFileCount?: number; productionAccess?: string };
  vguardReview: { result?: string; summary?: string; findings?: Array<{ severity?: string; category?: string; message?: string; path?: string | null }> };
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

type RunReadiness = {
  ready: boolean;
  state: "READY" | "BLOCKED";
  checkedAt?: string;
  provider?: { provider?: string; label?: string; modelId?: string | null } | null;
  context?: { valid?: boolean; reason?: string; fileCount?: number; totalBytes?: number; baselineCommit?: string | null };
  prompt?: { valid?: boolean; reason?: string; bytes?: number; sha256?: string | null };
  budget?: { state?: string; hardStop?: boolean; reasons?: string[] };
  blockers?: string[];
  warnings?: string[];
};

type ReviewReadiness = {
  ready: boolean;
  state: "READY" | "BLOCKED";
  provider?: { provider?: string; label?: string; modelId?: string | null } | null;
  prompt?: { valid?: boolean; reason?: string; sha256?: string | null };
  mforgeResult?: { baselineCommit?: string; resultCommit?: string; changedFileCount?: number };
  budget?: { state?: string; hardStop?: boolean; reasons?: string[] };
  blockers?: string[];
  warnings?: string[];
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
  adapters?: Array<{ provider: string; label: string; configured: boolean; secretConfigured?: boolean; modelConfigured?: boolean; pricingConfigured?: boolean; executionGateEnabled: boolean; executionImplemented: boolean; ready: boolean; modelId: string | null; detail: string }>;
  budget?: { dailyLimitHuf?: number | null; monthlyLimitHuf?: number | null; thresholds?: number[] };
  usage?: { runCount?: number; dailyCostHuf?: number; monthlyCostHuf?: number; totalTokens?: number; workers?: Record<string, { costHuf?: number; runs?: number; tokens?: number }> };
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
  const [adapterStates, setAdapterStates] = useState<NonNullable<Payload["adapters"]>>([]);
  const [systemBudget, setSystemBudget] = useState<Payload["budget"] | null>(null);
  const [usage, setUsage] = useState<Payload["usage"] | null>(null);
  const [readinessByTask, setReadinessByTask] = useState<Record<string, RunReadiness>>({});
  const [reviewReadinessByTask, setReviewReadinessByTask] = useState<Record<string, ReviewReadiness>>({});
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
    setAdapterStates(payload.adapters || []);
    setSystemBudget(payload.budget || null);
    setUsage(payload.usage || null);
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

  async function analyze(task: ExternalTask) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/analyze`, { method: "POST", headers: adminHeaders(true) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; scopeAnalysisState?: string; analysis?: { candidates?: unknown[]; overallRisk?: string }; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A technikai scope nem elemezhető.");
      setMessage(`Technikai scope elkészült: ${payload.analysis?.overallRisk || "—"} · ${payload.analysis?.candidates?.length || 0} jelölt.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A technikai scope nem elemezhető.");
    } finally {
      setBusy(false);
    }
  }

  async function safeScope(task: ExternalTask) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/scope-review`, { method: "POST", headers: adminHeaders(true), body: JSON.stringify({ action: "EXCLUDE_YELLOW" }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; scopeAnalysisState?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A biztonságos scope döntés sikertelen.");
      setMessage("YELLOW elemek kizárva; csak GREEN scope maradt végrehajtható.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "A biztonságos scope döntés sikertelen."); }
    finally { setBusy(false); }
  }

  async function preflight(task: ExternalTask) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/preflight`, { method: "POST", headers: adminHeaders(true) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; checkpoint?: { id?: string }; contextPack?: { fileCount?: number }; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A preflight sikertelen.");
      setMessage(`Preflight PASS · checkpoint ${payload.checkpoint?.id || "—"} · context ${payload.contextPack?.fileCount || 0} fájl.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "A preflight sikertelen."); }
    finally { setBusy(false); }
  }

  async function buildContextPack(task: ExternalTask) {
    setBusy(true); setMessage("");
    try {
      const response=await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/context-pack`,{method:"POST",headers:adminHeaders(true)});
      const payload=await response.json().catch(()=>null) as {ok?:boolean;contextPack?:{fileCount?:number;totalBytes?:number;excludedCount?:number};error?:string}|null;
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"A Safe Context Pack nem készíthető.");
      setMessage(`Safe Context Pack kész · ${payload.contextPack?.fileCount||0} fájl · ${payload.contextPack?.excludedCount||0} kizárva.`); await load();
    } catch(error){setMessage(error instanceof Error?error.message:"A Safe Context Pack nem készíthető.")} finally{setBusy(false)}
  }

  async function buildProviderPrompt(task: ExternalTask) {
    setBusy(true); setMessage("");
    try {
      const response=await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/provider-prompt`,{method:"POST",headers:adminHeaders(true)});
      const payload=await response.json().catch(()=>null) as {ok?:boolean;providerPrompt?:{id?:string;bytes?:number;fileCount?:number};error?:string}|null;
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"Az M.Forge provider prompt nem készíthető.");
      setMessage(`M.Forge provider prompt kész · ${payload.providerPrompt?.fileCount||0} fájl · ${payload.providerPrompt?.bytes||0} byte.`);
      await load();
    } catch(error){setMessage(error instanceof Error?error.message:"Az M.Forge provider prompt nem készíthető.")} finally{setBusy(false)}
  }

  async function checkRunReadiness(task: ExternalTask) {
    setBusy(true); setMessage("");
    try {
      const response=await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/run-readiness?role=MFORGE`,{headers:adminHeaders(),cache:"no-store"});
      const payload=await response.json().catch(()=>null) as ({ok?:boolean;error?:string}&RunReadiness)|null;
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"A futási readiness nem ellenőrizhető.");
      setReadinessByTask((current)=>({...current,[task.id]:payload}));
      setMessage(payload.ready?"M.Forge futási kapu READY.":`M.Forge futási kapu BLOCKED · ${payload.blockers?.length||0} blokkoló ok.`);
    } catch(error){setMessage(error instanceof Error?error.message:"A futási readiness nem ellenőrizhető.")} finally{setBusy(false)}
  }

  async function requestRun(task: ExternalTask) {
    setBusy(true); setMessage("");
    try {
      const response=await fetch(`/api/dev/ai-worker/tasks/${encodeURIComponent(task.id)}/run`,{method:"POST",headers:adminHeaders(true)});
      const payload=await response.json().catch(()=>null) as {ok?:boolean;state?:string;code?:string;error?:string;readiness?:RunReadiness}|null;
      if(!response.ok||!payload?.ok){
        if(payload?.readiness)setReadinessByTask((current)=>({...current,[task.id]:payload.readiness!}));
        throw new Error(payload?.error||"Az M.Forge futás nem indítható.");
      }
      setMessage(`M.Forge run kérés elfogadva · ${payload.state||"—"}`); await load();
    } catch(error){setMessage(error instanceof Error?error.message:"Az M.Forge futás nem indítható."); await load().catch(()=>undefined)} finally{setBusy(false)}
  }

  async function buildReviewPrompt(task: ExternalTask) {
    setBusy(true); setMessage("");
    try {
      const response=await fetch("/api/dev/ai-worker/tasks/"+encodeURIComponent(task.id)+"/review-prompt",{method:"POST",headers:adminHeaders(true)});
      const payload=await response.json().catch(()=>null) as {ok?:boolean;vguardReviewPrompt?:{id?:string;bytes?:number;changedFileCount?:number};error?:string}|null;
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"A V.Guard review prompt nem készíthető.");
      setMessage("V.Guard review prompt kész · "+(payload.vguardReviewPrompt?.changedFileCount||0)+" fájl · "+(payload.vguardReviewPrompt?.bytes||0)+" byte.");
      await load();
    } catch(error){setMessage(error instanceof Error?error.message:"A V.Guard review prompt nem készíthető.")} finally{setBusy(false)}
  }
  async function checkReviewReadiness(task: ExternalTask) {
    setBusy(true); setMessage("");
    try {
      const response=await fetch("/api/dev/ai-worker/tasks/"+encodeURIComponent(task.id)+"/review-readiness",{headers:adminHeaders(),cache:"no-store"});
      const payload=await response.json().catch(()=>null) as ({ok?:boolean;error?:string}&ReviewReadiness)|null;
      if(!response.ok||!payload?.ok)throw new Error(payload?.error||"A V.Guard review readiness nem ellenőrizhető.");
      setReviewReadinessByTask((current)=>({...current,[task.id]:payload}));
      setMessage(payload.ready?"V.Guard review kapu READY.":"V.Guard review kapu BLOCKED · "+(payload.blockers?.length||0)+" blokkoló ok.");
    } catch(error){setMessage(error instanceof Error?error.message:"A V.Guard review readiness nem ellenőrizhető.")} finally{setBusy(false)}
  }

  async function requestReviewRun(task: ExternalTask) {
    setBusy(true); setMessage("");
    try {
      const response=await fetch("/api/dev/ai-worker/tasks/"+encodeURIComponent(task.id)+"/review-run",{method:"POST",headers:adminHeaders(true)});
      const payload=await response.json().catch(()=>null) as {ok?:boolean;workflowState?:string;review?:{result?:string;summary?:string};code?:string;error?:string;readiness?:ReviewReadiness}|null;
      if(!response.ok||!payload?.ok){
        if(payload?.readiness)setReviewReadinessByTask((current)=>({...current,[task.id]:payload.readiness!}));
        throw new Error(payload?.error||"A V.Guard review nem indítható.");
      }
      setMessage("V.Guard review elkészült · "+(payload.review?.result||payload.workflowState||"—"));
      await load();
    } catch(error){setMessage(error instanceof Error?error.message:"A V.Guard review nem indítható."); await load().catch(()=>undefined)} finally{setBusy(false)}
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
            <div className={styles.aiWorkerSafety}><ShieldCheck size={16} /><span>PROD SSH · PROD DB write · PROD secret · PROD restart/deploy: technikailag tiltott. Külső provider csak readiness + explicit global gate mellett indulhat.</span></div>
            <button type="button" className={styles.aiWorkerCreateButton} onClick={() => void createTask()} disabled={busy}>{busy ? "FOLYAMATBAN…" : "AI WORKER TASK LÉTREHOZÁSA"}</button>
          </section>

          {message ? <div className={styles.drawerNotice}>{message}</div> : null}
          <section className={styles.aiWorkerProviderPanel}>
            <header><b>PROVIDER / KÖLTSÉG KAPU</b><span>{adapterStates.some((item) => item.ready && item.provider !== "mock") ? "KÜLSŐ PROVIDER READY" : "KÜLSŐ FUTÁS ZÁRVA"}</span></header>
            <div className={styles.aiWorkerProviderGrid}>{adapterStates.filter((item) => item.provider !== "mock").map((item) => <article key={item.provider} data-ready={item.ready ? "true" : "false"}><strong>{item.label}</strong><span>{item.configured ? "Konfigurálva" : "Nincs konfigurálva"} · {item.executionImplemented ? "executor kész" : "executor előkészítés"} · {item.modelId || "modell nincs kijelölve"}</span><small>{item.detail}</small></article>)}</div>
            <div className={styles.aiWorkerUsageLine}><span>Mai költség <b>{Math.round(usage?.dailyCostHuf || 0).toLocaleString("hu-HU")} Ft</b>{systemBudget?.dailyLimitHuf ? ` / ${systemBudget.dailyLimitHuf.toLocaleString("hu-HU")} Ft` : " · napi limit nincs beállítva"}</span><span>Havi költség <b>{Math.round(usage?.monthlyCostHuf || 0).toLocaleString("hu-HU")} Ft</b>{systemBudget?.monthlyLimitHuf ? ` / ${systemBudget.monthlyLimitHuf.toLocaleString("hu-HU")} Ft` : " · havi limit nincs beállítva"}</span><span>Run <b>{usage?.runCount || 0}</b> · token <b>{(usage?.totalTokens || 0).toLocaleString("hu-HU")}</b></span></div>
          </section>
          {adapterDetail ? <div className={styles.aiAdapterNote}><strong>Worker Model Adapter</strong><span>{adapterDetail}</span></div> : null}

          <section className={styles.aiWorkerTaskList}>
            {tasks.map((task) => {
              const runReadiness=readinessByTask[task.id];
              const reviewReadiness=reviewReadinessByTask[task.id];
              return <article key={task.id}>
                <header><div><strong>{task.title}</strong><span>{task.moduleHint || "Automatikus modulazonosítás"} · {task.launchMode} · {task.modelPreference}</span></div><b>{task.workflowState}</b></header>
                <div className={styles.aiWorkerPipeline}>{pipeline.map((step, index) => <span key={step}>{step}{index < pipeline.length - 1 ? <ChevronRight size={12} /> : null}</span>)}</div>
                <div className={styles.aiWorkerFour}>
                  <div><small>FELADAT</small><strong>{task.goal.slice(0, 115)}</strong><span>{task.technicalScopeMode === "AUTO_BENJADMIN" ? "Scope: automatikus" : task.technicalScopeMode}</span></div>
                  <div><small>WORKER</small><strong>M.Forge-AI → V.Guard-AI</strong><span>M.Forge → V.Guard · provider gate</span></div>
                  <div><small>ELLENŐRZÉS</small><strong>Scope {task.scopeAnalysis?.overallRisk ? `· ${task.scopeAnalysis.overallRisk}` : "· elemzésre vár"}</strong><span>{task.scopeAnalysisState || "PENDING"} · review {task.scopeAnalysis?.reviewCount || 0} · tiltott {task.scopeAnalysis?.deniedCount || 0}</span></div>
                  <div><small>EREDMÉNY</small><strong>{task.preflight?.state === "PASS" ? `PREFLIGHT PASS · ${task.contextPack?.fileCount || 0} context fájl` : `${task.taskBudgetHuf.toLocaleString("hu-HU")} Ft · ${task.maxActiveMinutesPerWorker} perc`}</strong><span>{task.workspacePlan?.branchName ? `M.Forge terv: ${task.workspacePlan.branchName}` : "DEV READY: még nem"}</span></div>
                </div>
                {task.scopeAnalysis?.candidates?.length ? <details className={styles.aiScopeDetails}><summary><Eye size={13} /> Scope megtekintése · {task.scopeAnalysis.candidates.length} jelölt</summary><div>{task.scopeAnalysis.candidates.slice(0, 18).map((candidate) => <article key={candidate.path} data-risk={candidate.riskLevel}><b>{candidate.riskLevel}</b><code>{candidate.path}</code><span>{candidate.decision} · {candidate.reasons[0] || "—"}</span></article>)}</div></details> : null}
                {runReadiness ? <section className={styles.aiRunReadiness} data-ready={runReadiness.ready ? "true" : "false"}><header><strong>M.FORGE FUTÁSI KAPU</strong><b>{runReadiness.state}</b></header><div><span>Context <b>{runReadiness.context?.valid ? `OK · ${runReadiness.context.fileCount || 0} fájl` : "HIBA"}</b></span><span>Prompt <b>{runReadiness.prompt?.valid ? "OK" : "HIBA"}</b></span><span>Budget <b>{runReadiness.budget?.state || "—"}</b></span><span>Provider <b>{runReadiness.provider?.label || "nincs READY provider"}</b></span></div>{runReadiness.blockers?.length ? <ul>{runReadiness.blockers.slice(0, 6).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p>Minden futási előfeltétel teljesült.</p>}</section> : null}
                {task.mforgeResult?.state === "WORKER_DONE" ? <section className={styles.aiRunReadiness} data-ready="true"><header><strong>M.FORGE EREDMÉNY</strong><b>WORKER_DONE</b></header><div><span>Commit <b>{task.mforgeResult.commit ? task.mforgeResult.commit.slice(0,12) : "—"}</b></span><span>Módosított fájl <b>{task.mforgeResult.changedFileCount || 0}</b></span><span>Integráció <b>review előtt nincs</b></span></div></section> : null}
                {reviewReadiness ? <section className={styles.aiRunReadiness} data-ready={reviewReadiness.ready ? "true" : "false"}><header><strong>V.GUARD REVIEW KAPU</strong><b>{reviewReadiness.state}</b></header><div><span>Prompt <b>{reviewReadiness.prompt?.valid ? "OK" : "HIBA"}</b></span><span>Diff fájl <b>{reviewReadiness.mforgeResult?.changedFileCount || 0}</b></span><span>Budget <b>{reviewReadiness.budget?.state || "—"}</b></span><span>Provider <b>{reviewReadiness.provider?.label || "nincs READY provider"}</b></span></div>{reviewReadiness.blockers?.length ? <ul>{reviewReadiness.blockers.slice(0,6).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p>A független review minden előfeltétele teljesült.</p>}</section> : null}
                {task.vguardReview?.result ? <section className={styles.aiRunReadiness} data-ready={task.vguardReview.result === "FAIL" ? "false" : "true"}><header><strong>V.GUARD EREDMÉNY</strong><b>{task.vguardReview.result}</b></header><p>{task.vguardReview.summary || "Review összefoglaló nem érkezett."}</p>{task.vguardReview.findings?.length ? <ul>{task.vguardReview.findings.slice(0,6).map((finding,index) => <li key={(finding.path || "finding")+index}>{finding.severity || "INFO"} · {finding.category || "OTHER"} · {finding.path || "általános"} · {finding.message || "—"}</li>)}</ul> : null}</section> : null}
                <footer>
                  <span><CircleDollarSign size={13} /> Forge {task.forgeBudgetHuf.toLocaleString("hu-HU")} Ft · Guard {task.guardBudgetHuf.toLocaleString("hu-HU")} Ft</span>
                  <span><Clock3 size={13} /> {task.maxActiveMinutesPerWorker} perc/worker</span>
                  <div>{task.workflowState === "DRAFT" || task.scopeAnalysisState === "PENDING" ? <button type="button" onClick={() => void analyze(task)} disabled={busy}>SCOPE ELEMZÉS</button> : null}{task.scopeAnalysisState === "NEEDS_REVIEW" ? <button type="button" onClick={() => void safeScope(task)} disabled={busy} title="A YELLOW elemeket nem engedi írni; csak a GREEN scope marad">BIZTONSÁGOS SCOPE</button> : null}{task.workflowState === "READY" && ["AUTO_APPROVED","REVIEW_RESOLVED_SAFE"].includes(task.scopeAnalysisState) ? <button type="button" onClick={() => void preflight(task)} disabled={busy}>PREFLIGHT</button> : null}{task.workflowState === "READY" ? <button type="button" onClick={() => void transition(task, "PAUSED")} disabled={busy}>SZÜNET</button> : null}{task.workflowState === "PAUSED" ? <button type="button" onClick={() => void transition(task, "READY")} disabled={busy}>FOLYTATÁS</button> : null}{task.workflowState === "PREFLIGHT" && !task.contextPackContent?.id ? <button type="button" onClick={() => void buildContextPack(task)} disabled={busy}>CONTEXT PACK</button> : null}{task.workflowState === "PREFLIGHT" && task.contextPackContent?.id && !task.providerPrompt?.id ? <button type="button" onClick={() => void buildProviderPrompt(task)} disabled={busy}>PROVIDER PROMPT</button> : null}{task.workflowState === "PREFLIGHT" && task.providerPrompt?.id ? <button type="button" onClick={() => void checkRunReadiness(task)} disabled={busy}>FUTÁSI ELLENŐRZÉS</button> : null}{task.workflowState === "PREFLIGHT" && task.providerPrompt?.id && runReadiness?.ready ? <button type="button" className={styles.aiRunStartButton} onClick={() => void requestRun(task)} disabled={busy}>M.FORGE INDÍTÁS</button> : null}{task.workflowState === "PREFLIGHT" && task.contextPackContent?.id ? <span className={styles.aiWorkerReadyTag}>CONTEXT {task.contextPackContent.fileCount || 0}{task.providerPrompt?.id ? " · PROMPT KÉSZ" : " · PROMPTRA VÁR"} · WORKSPACE TERV KÉSZ</span> : null}</div>
                  <div>{task.workflowState === "WORKER_DONE" && !task.vguardReviewPrompt?.id ? <button type="button" onClick={() => void buildReviewPrompt(task)} disabled={busy}>V.GUARD PROMPT</button> : null}{task.workflowState === "WORKER_DONE" && task.vguardReviewPrompt?.id ? <button type="button" onClick={() => void checkReviewReadiness(task)} disabled={busy}>REVIEW ELLENŐRZÉS</button> : null}{task.workflowState === "WORKER_DONE" && task.vguardReviewPrompt?.id && reviewReadiness?.ready ? <button type="button" className={styles.aiRunStartButton} onClick={() => void requestReviewRun(task)} disabled={busy}>V.GUARD INDÍTÁS</button> : null}{task.workflowState === "WORKER_DONE" && task.vguardReviewPrompt?.id ? <span className={styles.aiWorkerReadyTag}>M.FORGE COMMIT · V.GUARD PROMPT KÉSZ</span> : null}{task.workflowState === "APPROVED" ? <span className={styles.aiWorkerReadyTag}>V.GUARD JÓVÁHAGYTA · BENJADMIN GATE KÖVETKEZIK</span> : null}{task.workflowState === "HUMAN_DECISION_REQUIRED" ? <span className={styles.aiWorkerReadyTag}>V.GUARD FAIL · BENJADMIN DÖNTÉS SZÜKSÉGES</span> : null}</div>
                </footer>
              </article>;
            })}
            {!tasks.length ? <div className={styles.railEmpty}>Még nincs Külső AI Worker V1 task.</div> : null}
          </section>
        </div>
      </aside>
    </div>
  );
}
