"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileSpreadsheet,
  FileText,
  Building2,
  HelpCircle,
  LayoutGrid,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  D6_MODULES,
  DEFAULT_PROJECT_ID,
  getD6Module,
  projectGateModuleHref,
  type D6ModuleId,
} from "@/app/lib/project-gate/d6Modules";
import DriveWorkspace from "./DriveWorkspace";
import DialogWorkspace from "./DialogWorkspace";
import DecideWorkspace from "./DecideWorkspace";
import DiaryWorkspace from "./DiaryWorkspace";
import ProjectCalendarWorkspace from "./ProjectCalendarWorkspace";
import ProjectPulsePlaceholder from "./ProjectPulsePlaceholder";
import ProjectGateNavigationRail from "./ProjectGateNavigationRail";
import ProjectGateProjectBoard from "./ProjectGateProjectBoard";
import ProjectGateModuleSwitcher from "./ProjectGateModuleSwitcher";
import styles from "./ProjectGateShell.module.css";

type ProjectGateShellProps = {
  projectId?: string;
  activeModuleId?: D6ModuleId;
};

type ProjectDashboardData = {
  project: {
    id: string;
    code: string;
    name: string;
    description: string;
    status: string;
    progressPercent: number;
    currentPhase: string;
    endsAt?: string | null;
  };
  membership: {
    displayName: string;
    role: string;
  };
  permissions: string[];
  metrics: {
    activeMemberCount: number;
    invitedMemberCount: number;
    moduleCount: number;
    preparedModuleCount: number;
  };
  recentAuditEvents: Array<{
    id: string;
    summary: string;
    eventType: string;
    createdAt: string;
  }>;
};

type ProjectOption = {
  id: string;
  code: string;
  name: string;
};

type ProjectsPayload = {
  ok?: boolean;
  projects?: Array<{ id: string; code?: string; name: string }>;
};

const recentDocuments = [
  { name: "Építészeti terv – E-03.pdf", meta: "Műszaki tervek", time: "Ma 09:42", type: "PDF" },
  { name: "Alaprajz – Földszint.dwg", meta: "Műszaki tervek", time: "Ma 08:15", type: "DWG" },
  { name: "Költségvetés – V1.xlsx", meta: "Pénzügy", time: "Tegnap 16:30", type: "XLSX" },
  { name: "Műszaki leírás.docx", meta: "Dokumentáció", time: "Tegnap 11:05", type: "DOCX" },
];

const approvals = [
  { title: "Építészeti terv – E-03.pdf", area: "Építészeti tervek", priority: "Magas", due: "05.20." },
  { title: "Költségvetés – V1.xlsx", area: "Pénzügy", priority: "Magas", due: "05.21." },
  { title: "Szerződés tervezet.docx", area: "Jogi dokumentumok", priority: "Közepes", due: "05.22." },
  { title: "Beszállítói ajánlat.pdf", area: "Beszerzés", priority: "Közepes", due: "05.23." },
];

const dialogs = [
  { title: "Homlokzati burkolat kiválasztása", code: "#DIA-27", status: "Új", owner: "AK" },
  { title: "Gépészeti akna méretezés", code: "#DIA-21", status: "Válaszra vár", owner: "ZS" },
  { title: "Költségoptimalizálási javaslatok", code: "#DIA-18", status: "Folyamatban", owner: "PM" },
];

const activities = [
  { time: "10:24", title: "Új dokumentum feltöltve", detail: "Építészeti terv – E-03.pdf" },
  { time: "09:32", title: "Jóváhagyási kérés indítva", detail: "Költségvetés – V1.xlsx" },
  { time: "08:47", title: "Új hozzászólás érkezett", detail: "#DIA-27" },
  { time: "07:58", title: "Dokumentum módosítva", detail: "Műszaki leírás.docx" },
];

const workspaceCopy: Record<D6ModuleId, { eyebrow: string; title: string; description: string; callout: string }> = {
  dock: {
    eyebrow: "Központi projektmunkatér",
    title: "ProjektTér áttekintés",
    description: "Az aktív projekt dokumentumai, nyitott egyeztetései, jóváhagyásai és naplóeseményei egy felületen.",
    callout: "A DOCK az első működő D6 munkatér. A további modulok ugyanarra a projekt-, jogosultság- és auditmagra épülnek.",
  },
  drive: {
    eyebrow: "DIMPRO DRIVE",
    title: "Dokumentumtár",
    description: "Projekt- és szakági mappák, dokumentumverziók, revíziók és hozzáférési események előkészített munkaterülete.",
    callout: "A DRIVE Core már a közös Project Core jogosultságaira, PostgreSQL repositoryra, auditnaplóra és desktop változáskurzorra épül.",
  },
  drop: {
    eyebrow: "DIMPRO DROP",
    title: "Fájlkapu",
    description: "A Projektkapun belüli Drop-kapcsolat helye. A publikus DIMPRO Drop külön fejlesztési csevegésben készül.",
    callout: "Ebben a fejlesztési körben a Drop forrását, API-jait és adatmodelljét nem módosítjuk.",
  },
  dialog: {
    eyebrow: "DIMPRO DIALOG",
    title: "Egyeztetések",
    description: "Szakági kérdések, adatkérések, tervészrevételek és kooperációs pontok témakártyákba rendezve.",
    callout: "Minden ügyhöz felelős, határidő, státusz, résztvevő és kapcsolódó dokumentum tartozik majd.",
  },
  decide: {
    eyebrow: "DIMPRO DECIDE",
    title: "Jóváhagyások",
    description: "Terv-, termékkiváltási, költség- és határidőhatásos döntések auditálható munkafolyamata.",
    callout: "A sorozatos és párhuzamos jóváhagyási láncok közös Workflow Core-ra épülnek.",
  },
  diary: {
    eyebrow: "DIMPRO DIARY",
    title: "Projektnapló",
    description: "Projekt- és kivitelezési események, naplótervezetek és eltakarás előtti ellenőrzési kérelmek.",
    callout: "A DIARY előkészítő és nyomon követő rendszer; nem helyettesíti a hivatalos e-építési naplót.",
  },
};

function ModuleHex({ moduleId, large = false }: { moduleId: D6ModuleId; large?: boolean }) {
  const definition = getD6Module(moduleId);
  const Icon = definition.Icon;
  return (
    <span className={`${styles.moduleHex} ${styles[`moduleHex_${definition.tone}`]} ${large ? styles.moduleHexLarge : ""}`}>
      <span className={styles.moduleHexInner}><Icon size={large ? 30 : 19} strokeWidth={1.8} /></span>
    </span>
  );
}

function ModuleStrip({ projectId, activeModuleId }: { projectId: string; activeModuleId: D6ModuleId }) {
  return (
    <section className={styles.moduleStrip}>
      <div className={styles.sectionLabel}><span /> A D6 CORE – 6 ÖSSZEKAPCSOLT PROJEKTMODUL <span /></div>
      <div className={styles.moduleStripGrid}>
        {D6_MODULES.map((item) => (
          <Link key={item.id} href={projectGateModuleHref(projectId, item.id)} className={`${styles.moduleTile} ${activeModuleId === item.id ? styles.moduleTileActive : ""}`}>
            <ModuleHex moduleId={item.id} large />
            <strong>{item.order}. {item.brandName}</strong>
            <span>{item.hungarianName}</span>
            {item.state === "external-development" && <small>Külön fejlesztés alatt</small>}
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardCards({ auditEvents }: { auditEvents: ProjectDashboardData["recentAuditEvents"] }) {
  const visibleActivities = auditEvents.length
    ? auditEvents.map((event) => ({
        time: new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.createdAt)),
        title: event.summary,
        detail: event.eventType,
      }))
    : activities;

  return (
    <div className={styles.dashboardGrid}>
      <section className={styles.panel}>
        <header><span><FileText size={17} /> Legutóbbi dokumentumok</span><button type="button">Megnyitás</button></header>
        <div className={styles.list}>
          {recentDocuments.map((item) => (
            <div key={item.name} className={styles.documentRow}>
              <span className={styles.fileBadge}>{item.type}</span>
              <div><strong>{item.name}</strong><small>{item.meta}</small></div>
              <time>{item.time}</time>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <header><span><ShieldCheck size={17} /> Jóváhagyások folyamatban</span><button type="button">Összes (4)</button></header>
        <div className={styles.list}>
          {approvals.map((item) => (
            <div key={item.title} className={styles.approvalRow}>
              <span className={styles.approvalIcon}><FileSpreadsheet size={16} /></span>
              <div><strong>{item.title}</strong><small>{item.area}</small></div>
              <span className={styles.priority}>{item.priority}</span>
              <time>{item.due}</time>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <header><span><Users size={17} /> Nyitott egyeztetések</span><button type="button">Összes (3)</button></header>
        <div className={styles.list}>
          {dialogs.map((item) => (
            <div key={item.code} className={styles.dialogRow}>
              <div><strong>{item.title}</strong><small>{item.code} · Építészeti csapat</small></div>
              <span>{item.status}</span>
              <b>{item.owner}</b>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <header><span><Activity size={17} /> Projekt aktivitás</span><button type="button">Ma <ChevronDown size={13} /></button></header>
        <div className={styles.timeline}>
          {visibleActivities.map((item) => (
            <div key={`${item.time}-${item.title}`} className={styles.timelineRow}>
              <i />
              <time>{item.time}</time>
              <div><strong>{item.title}</strong><small>{item.detail}</small></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PreparedWorkspace({ activeModuleId }: { activeModuleId: D6ModuleId }) {
  const copy = workspaceCopy[activeModuleId];
  const active = getD6Module(activeModuleId);
  return (
    <section className={styles.workspacePanel}>
      <div className={styles.workspaceIntro}>
        <ModuleHex moduleId={activeModuleId} large />
        <div>
          <span>{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </div>
      <div className={styles.workspaceCallout}>{copy.callout}</div>
      <div className={styles.preparedGrid}>
        <article><Clock3 size={20} /><strong>Állapot</strong><span>{active.state === "active" ? "MVP munkatér" : active.state === "external-development" ? "Külön fejlesztés alatt" : "Előkészített modulhely"}</span></article>
        <article><Users size={20} /><strong>Közös jogosultság</strong><span>Project ID + tagság + szerveroldali engedély</span></article>
        <article><ShieldCheck size={20} /><strong>Audit</strong><span>Minden érzékeny művelet központi eseménynaplóba kerül</span></article>
      </div>
    </section>
  );
}

function ContextBoard({
  projectId,
  activeModuleId,
  dashboard,
  open,
  onClose,
}: {
  projectId: string;
  activeModuleId: D6ModuleId;
  dashboard: ProjectDashboardData | null;
  open: boolean;
  onClose: () => void;
}) {
  const active = getD6Module(activeModuleId);
  const contextCopy: Record<D6ModuleId, string[]> = {
    dock: ["Heti projektkép áttekintése", "Közelgő határidők ellenőrzése", "Nyitott ügyek kiosztása"],
    drive: ["Legutóbbi dokumentumverziók", "Feltöltési és hozzáférési események", "Átadási célmappák"],
    drop: ["Kapcsolódó Drop-csomagok", "Lejáró külső hozzáférések", "DRIVE célmappa ellenőrzése"],
    dialog: ["Nyitott RFI-k és egyeztetések", "Válaszadási határidők", "Kapcsolódó dokumentumok"],
    decide: ["Függő jóváhagyások", "Költség- és határidőhatások", "Döntési audit"],
    diary: ["Nyitott hibák", "Visszaellenőrzésre váró tételek", "Legutóbbi helyszíni események"],
  };
  const auditEvents = dashboard?.recentAuditEvents.slice(0, 3) || [];

  return (
    <aside className={`${styles.contextBoard} ${open ? styles.contextBoardOpen : ""}`} aria-hidden={!open}>
      <header className={styles.contextHeader}>
        <div>
          <span>Projektkontextus</span>
          <strong>{active.hungarianName}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Jobb oldali projektpanel bezárása" title="Projektpanel bezárása">
          <X size={17} />
        </button>
      </header>

      <div className={styles.contextScroll}>
        <section className={styles.contextProject}>
          <small>{dashboard?.project.code || "D6-001"}</small>
          <strong>{dashboard?.project.name || "D6 Irodaépület"}</strong>
          <span>{dashboard?.project.currentPhase || "Projektkörnyezet"}</span>
          <div><b style={{ width: `${dashboard?.project.progressPercent ?? 68}%` }} /></div>
          <p><span>{dashboard?.project.status || "ACTIVE"}</span><strong>{dashboard?.project.progressPercent ?? 68}%</strong></p>
        </section>

        <section className={styles.contextSection}>
          <header><ListChecks size={16} /><strong>Aktuális fókusz</strong></header>
          <div className={styles.contextChecklist}>
            {contextCopy[activeModuleId].map((item) => <span key={item}><CheckCircle2 size={14} />{item}</span>)}
          </div>
        </section>

        <section className={styles.contextSection}>
          <header><CalendarDays size={16} /><strong>Gyors elérés</strong></header>
          <div className={styles.contextActions}>
            <Link href={projectGateModuleHref(projectId, "dialog")}>Egyeztetések</Link>
            <Link href={projectGateModuleHref(projectId, "drive")}>Dokumentumtár</Link>
            <Link href={projectGateModuleHref(projectId, "diary")}>Projektnapló</Link>
            <Link href={`/projektkapu/project/${encodeURIComponent(projectId)}/reports`}>Riportok</Link>
          </div>
        </section>

        <section className={styles.contextSection}>
          <header><Activity size={16} /><strong>Legutóbbi aktivitás</strong></header>
          <div className={styles.contextActivity}>
            {(auditEvents.length ? auditEvents : [{ id: "context-empty", summary: "Még nincs új projektaktivitás.", eventType: "PROJECT", createdAt: new Date().toISOString() }]).map((event) => (
              <div key={event.id}>
                <i />
                <span><strong>{event.summary}</strong><small>{event.eventType}</small></span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function userInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "DP";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export default function ProjectGateShell({ projectId = DEFAULT_PROJECT_ID, activeModuleId = "dock" }: ProjectGateShellProps) {
  const activeModule = getD6Module(activeModuleId);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dashboard, setDashboard] = useState<ProjectDashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [boardOpen, setBoardOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [moduleSwitcherOpen, setModuleSwitcherOpen] = useState(false);

  const closeModuleSwitcher = useCallback(() => setModuleSwitcherOpen(false), []);

  useEffect(() => {
    const stored = window.localStorage.getItem("dimpro-projectgate-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  useEffect(() => {
    const storedBoard = window.localStorage.getItem("dimpro-projectgate-board-open");
    const legacySidebar = window.localStorage.getItem("dimpro-projectgate-sidebar-collapsed");
    const storedContext = window.localStorage.getItem("dimpro-projectgate-context-open");
    if (storedBoard === "true" || storedBoard === "false") setBoardOpen(storedBoard === "true");
    else if (legacySidebar === "true" || legacySidebar === "false") setBoardOpen(legacySidebar !== "true");
    if (storedContext === "true" || storedContext === "false") setContextOpen(storedContext === "true");
    else setContextOpen(window.matchMedia("(min-width: 1261px)").matches);
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const isModuleShortcut = event.ctrlKey
        && event.altKey
        && (event.code === "KeyM" || event.key.toLowerCase() === "m");

      if (!isModuleShortcut || event.repeat) return;

      event.preventDefault();
      event.stopPropagation();
      setModuleSwitcherOpen((current) => !current);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDashboardError("");
    fetch(`/api/projects/${encodeURIComponent(projectId)}/dashboard`, {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; error?: string } & Partial<ProjectDashboardData>;
        if (!response.ok || !payload.ok || !payload.project || !payload.membership || !payload.metrics) {
          throw new Error(payload.error || "A projektadatok nem tölthetők be.");
        }
        setDashboard(payload as ProjectDashboardData);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDashboardError(error instanceof Error ? error.message : "A projektadatok nem tölthetők be.");
      });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as ProjectsPayload;
        if (!payload.ok || !Array.isArray(payload.projects)) return;
        setProjectOptions(payload.projects.map((project) => ({
          id: project.id,
          code: project.code || project.id,
          name: project.name,
        })));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  function toggleBoard() {
    setBoardOpen((current) => {
      const next = !current;
      window.localStorage.setItem("dimpro-projectgate-board-open", String(next));
      return next;
    });
  }

  function closeBoard() {
    setBoardOpen(false);
    window.localStorage.setItem("dimpro-projectgate-board-open", "false");
  }

  function toggleContext() {
    setContextOpen((current) => {
      const next = !current;
      window.localStorage.setItem("dimpro-projectgate-context-open", String(next));
      return next;
    });
  }

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("dimpro-projectgate-theme", next);
      return next;
    });
  }

  function changeProject(nextProjectId: string) {
    if (!nextProjectId || nextProjectId === projectId) return;
    window.location.assign(projectGateModuleHref(nextProjectId, activeModule.id));
  }

  const displayName = dashboard?.membership.displayName || "DIMPRO felhasználó";
  const displayRole = dashboard?.membership.role || "Projekt résztvevő";
  const projectStatusLabel = dashboard?.project.status === "ACTIVE" ? "Aktív projekt" : dashboard?.project.status || "Projekt";
  const projectName = dashboard?.project.name || "D6 Irodaépület";
  const projectCode = dashboard?.project.code || "D6-001";
  const progressPercent = dashboard?.project.progressPercent ?? 68;
  const currentPhase = dashboard?.project.currentPhase || "Projektkörnyezet";
  const activeMemberCount = dashboard?.metrics.activeMemberCount ?? 0;
  const currentProjectOptions = useMemo(() => {
    if (projectOptions.some((project) => project.id === projectId)) return projectOptions;
    return [{ id: projectId, code: projectCode, name: projectName }, ...projectOptions];
  }, [projectCode, projectId, projectName, projectOptions]);

  return (
    <main className={styles.page} data-theme={theme} data-board-open={boardOpen} data-context-open={contextOpen}>
      <ProjectGateNavigationRail
        projectId={projectId}
        activeModuleId={activeModule.id}
        boardOpen={boardOpen}
        theme={theme}
        onToggleBoard={toggleBoard}
        onOpenModuleSwitcher={() => setModuleSwitcherOpen(true)}
        onToggleTheme={toggleTheme}
      />

      <ProjectGateProjectBoard
        projectId={projectId}
        projectCode={projectCode}
        projectName={projectName}
        projectStatus={dashboard?.project.status || "ACTIVE"}
        currentPhase={currentPhase}
        progressPercent={progressPercent}
        activeMemberCount={activeMemberCount}
        activeModuleId={activeModule.id}
        projects={currentProjectOptions}
        onProjectChange={changeProject}
        onClose={closeBoard}
      />

      <div className={styles.content}>
        <header className={styles.projectHeader}>
          <div className={styles.projectIdentity}>
            <span className={styles.projectIcon}><Building2 size={19} /></span>
            <div>
              <h1>{projectName}</h1>
              <div className={styles.projectMeta}>
                <span>{projectCode}</span>
                <span className={dashboard?.project.status === "ACTIVE" || !dashboard ? styles.activeBadge : styles.statusBadgeHeader}>{projectStatusLabel}</span>
                <span>{currentPhase}</span>
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerAction} onClick={toggleContext} title={contextOpen ? "Projektkontextus bezárása" : "Projektkontextus megnyitása"}>
              {contextOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}<span>Kontextus</span>
            </button>
            <button type="button" className={styles.headerIconButton} title="Értesítések" aria-label="Értesítések"><Bell size={18} /><b>3</b></button>
            <button type="button" className={styles.headerIconButton} title="Súgó" aria-label="Súgó"><HelpCircle size={18} /></button>
            <div className={styles.userPill}>
              <span className={styles.avatar}>{userInitials(displayName)}</span>
              <div><strong>{displayName}</strong><span>{displayRole}</span></div>
            </div>
          </div>
        </header>

        <div className={styles.localToolbar}>
          <div className={styles.moduleContext}>
            <ModuleHex moduleId={activeModule.id} />
            <div><strong>{activeModule.hungarianName}</strong><span>DIMPRO {activeModule.brandName}</span></div>
          </div>
          <button type="button" className={styles.moduleSwitchButton} onClick={() => setModuleSwitcherOpen(true)}>
            <LayoutGrid size={16} /><span>Modulváltó</span><kbd>Ctrl Alt M</kbd>
          </button>
          <div className={styles.toolbarSpacer} />
          <label className={styles.searchBox}><Search size={16} /><input aria-label="Keresés" placeholder="Keresés a projektben..." /></label>
        </div>

        <div className={styles.blueprint} aria-hidden="true" />
        <div className={styles.pageInner}>
          {activeModule.id === "dock" && (
            <>
              <ProjectPulsePlaceholder progressPercent={progressPercent} projectName={projectName} />
              <ModuleStrip projectId={projectId} activeModuleId={activeModule.id} />
              <section className={styles.projectSummary} aria-label="Projektösszefoglaló">
                <div><small>{projectCode}</small><strong>{projectName}</strong><span>{currentPhase}</span></div>
                <div className={styles.summaryProgress}>
                  <span><b>Projekt előrehaladása</b><strong>{progressPercent}%</strong></span>
                  <i><b style={{ width: `${progressPercent}%` }} /></i>
                </div>
                <dl>
                  <div><dt>Státusz</dt><dd>{projectStatusLabel}</dd></div>
                  <div><dt>Határidő</dt><dd>{dashboard?.project.endsAt ? new Intl.DateTimeFormat("hu-HU").format(new Date(dashboard.project.endsAt)) : "Nincs megadva"}</dd></div>
                  <div><dt>Résztvevők</dt><dd>{activeMemberCount} aktív</dd></div>
                </dl>
              </section>
            </>
          )}

          {dashboardError && <div className={styles.dataWarning}>Project Core: {dashboardError}</div>}

          {activeModule.id === "dock" ? (
            <>
              <ProjectCalendarWorkspace projectId={projectId} permissions={dashboard?.permissions || []} />
              <DashboardCards auditEvents={dashboard?.recentAuditEvents || []} />
            </>
          ) : activeModule.id === "drive" ? (
            <DriveWorkspace projectId={projectId} permissions={dashboard?.permissions || []} />
          ) : activeModule.id === "dialog" ? (
            <DialogWorkspace projectId={projectId} permissions={dashboard?.permissions || []} />
          ) : activeModule.id === "decide" ? (
            <DecideWorkspace projectId={projectId} permissions={dashboard?.permissions || []} />
          ) : activeModule.id === "diary" ? (
            <DiaryWorkspace projectId={projectId} permissions={dashboard?.permissions || []} />
          ) : (
            <PreparedWorkspace activeModuleId={activeModule.id} />
          )}
        </div>
      </div>

      <ContextBoard projectId={projectId} activeModuleId={activeModule.id} dashboard={dashboard} open={contextOpen} onClose={toggleContext} />
      {contextOpen && <button type="button" className={styles.contextBackdrop} onClick={toggleContext} aria-label="Projektpanel bezárása" />}

      <ProjectGateModuleSwitcher open={moduleSwitcherOpen} projectId={projectId} activeModuleId={activeModule.id} onClose={closeModuleSwitcher} />

      <nav className={styles.mobileNav} aria-label="Mobil Projektkapu modulok">
        {D6_MODULES.map((item) => {
          const Icon = item.Icon;
          return <Link key={item.id} href={projectGateModuleHref(projectId, item.id)} className={activeModule.id === item.id ? styles.mobileNavActive : ""}><Icon size={19} /><span>{item.hungarianName}</span></Link>;
        })}
      </nav>
    </main>
  );
}
