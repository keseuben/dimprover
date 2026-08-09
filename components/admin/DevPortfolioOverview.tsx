"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Boxes,
  CalendarDays,
  ChevronRight,
  Clock3,
  FolderKanban,
  HardDrive,
  Layers3,
  MonitorCog,
  Network,
} from "lucide-react";
import { buildDevPortfolio, type DevPortfolioProject } from "@/app/lib/dev-center/portfolio";
import type { DevProject, DevVersion, DevWorkSession } from "@/app/lib/dev-center/types";

type Props = {
  projects: DevProject[];
  versions: DevVersion[];
  workSessions: DevWorkSession[];
  now?: number;
  query?: string;
  compact?: boolean;
  showHeading?: boolean;
};

const projectIcons: Record<string, typeof Boxes> = {
  project_dimpro: Layers3,
  project_dimprover: Network,
  project_infrastructure: MonitorCog,
  project_drive_drop: HardDrive,
  project_fajlmuhely: MonitorCog,
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDurationCompact(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} p`;
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining ? `${hours} ó ${remaining} p` : `${hours} ó`;
}

function statusLabel(status: DevVersion["status"] | DevProject["status"]) {
  const labels: Record<string, string> = {
    active: "Aktív termék",
    paused: "Szüneteltetve",
    completed: "Lezárt",
    archived: "Archivált",
    unassigned: "Besorolásra vár",
    planned: "Tervezett",
    in_progress: "Folyamatban",
    testing: "Tesztelés alatt",
    blocked: "Beavatkozásra vár",
    released: "Kiadva",
  };
  return labels[status] || status;
}

function statusClass(status: DevVersion["status"] | DevProject["status"]) {
  if (status === "completed" || status === "released") return "is-completed";
  if (status === "testing") return "is-testing";
  if (status === "blocked" || status === "paused" || status === "unassigned") return "is-waiting";
  return "is-progress";
}

function projectLinks(projectId: string) {
  if (projectId === "project_fajlmuhely") {
    return [
      { label: "Fájlműhely verziók", href: "/admin/fajlmuhely-verziok" },
      { label: "Release", href: "/admin/releases" },
    ];
  }
  if (projectId === "project_infrastructure") {
    return [
      { label: "Fejlesztési napló", href: "/admin/fejlesztesi-naplo" },
      { label: "Rendszerstruktúra", href: "/admin/dev/rendszerstruktura" },
    ];
  }
  if (projectId === "project_drive_drop") {
    return [
      { label: "Drive admin", href: "/admin/drive" },
      { label: "Verziók", href: "#verziok" },
    ];
  }
  if (projectId === "project_dimprover") {
    return [
      { label: "Rendszerstruktúra", href: "/admin/dev/rendszerstruktura" },
      { label: "Release Központ", href: "/admin/release-kozpont" },
    ];
  }
  if (projectId === "project_dimpro") {
    return [
      { label: "DIMPRO modulok", href: "#verziok" },
      { label: "Fejlesztési napló", href: "/admin/fejlesztesi-naplo" },
    ];
  }
  if (projectId === "project_hage") {
    return [
      { label: "HAGE verziók", href: "/admin/hage-verziok" },
      { label: "Release", href: "/admin/releases?project=HAGE_Munkater" },
    ];
  }
  return [{ label: "Fejlesztési napló", href: "/admin/fejlesztesi-naplo" }];
}

function matchesProject(project: DevPortfolioProject, query: string) {
  if (!query) return true;
  const haystack = [
    project.name,
    project.category,
    project.description,
    project.relationshipNote,
    ...project.modules.flatMap((module) => [module.name, module.latestVersion, module.latestTitle, module.latestSummary]),
  ].filter(Boolean).join(" ").toLocaleLowerCase("hu-HU");
  return haystack.includes(query);
}

function ProductProjectCard({ project, compact }: { project: DevPortfolioProject; compact: boolean }) {
  const Icon = projectIcons[project.id] || FolderKanban;
  const latestModule = project.modules[0];
  const links = projectLinks(project.id);
  return (
    <article className={`dev-product-family dev-product-family--${project.accent} ${compact ? "is-compact" : ""}`}>
      <div className="dev-product-family__head">
        <div className="dev-product-family__identity">
          <div className="dev-product-family__icon"><Icon size={23} aria-hidden="true" /></div>
          <div>
            <p>{project.category}</p>
            <h3>{project.name}</h3>
          </div>
        </div>
        <span className={`dev-status ${statusClass(project.status)}`}>{statusLabel(project.status)}</span>
      </div>

      <p className="dev-product-family__description">{project.description}</p>
      {project.relationshipNote ? <p className="dev-product-family__relationship">{project.relationshipNote}</p> : null}

      <div className="dev-product-family__metrics">
        <div><CalendarDays size={15} /><span>Projekt indulása</span><strong>{formatDate(project.startedAt)}</strong></div>
        <div><Clock3 size={15} /><span>Utolsó munka</span><strong>{formatDate(project.lastActivityAt)}</strong></div>
        <div><Boxes size={15} /><span>Verziók / modulok</span><strong>{project.versionCount} / {project.modules.length}</strong></div>
        <div><FolderKanban size={15} /><span>Ráfordítás</span><strong>{formatDurationCompact(project.timeMinutes)}</strong></div>
      </div>

      {!compact ? (
        <div className="dev-product-modules">
          <div className="dev-product-modules__heading">
            <span>Külön modulkártyák</span>
            <small>{project.modules.length ? `${project.modules.length} nyilvántartott modul` : "Még nincs rögzített modul"}</small>
          </div>
          <div className="dev-product-module-grid">
            {project.modules.map((module) => (
              <article key={module.id} className="dev-product-module-card">
                <div className="dev-product-module-card__top">
                  <strong>{module.name}</strong>
                  <span className={`dev-status ${statusClass(module.latestStatus)}`}>{statusLabel(module.latestStatus)}</span>
                </div>
                <p>{module.latestTitle}</p>
                <div className="dev-product-module-card__facts">
                  <span><small>Modul indulása</small><strong>{formatDate(module.startedAt)}</strong></span>
                  <span><small>Utolsó munka</small><strong>{formatDate(module.lastActivityAt)}</strong></span>
                  <span><small>Aktuális verzió</small><strong>{module.latestVersion}</strong></span>
                  <span><small>Ráfordítás</small><strong>{formatDurationCompact(module.timeMinutes)}</strong></span>
                </div>
                <p className="dev-product-module-card__summary">{module.latestSummary}</p>
              </article>
            ))}
            {!project.modules.length ? (
              <div className="dev-product-module-empty">A központi termékkártya elkészült; az első modulverzió rögzítésekor automatikusan megjelenik a modulkártya.</div>
            ) : null}
          </div>
        </div>
      ) : latestModule ? (
        <div className="dev-product-family__latest">
          <span>Legutóbbi modul</span>
          <strong>{latestModule.name} · {latestModule.latestVersion}</strong>
          <small>{latestModule.latestTitle}</small>
        </div>
      ) : null}

      <div className="dev-product-family__actions">
        {links.map((link) => <Link key={`${project.id}-${link.label}`} href={link.href}>{link.label}<ChevronRight size={14} /></Link>)}
      </div>
    </article>
  );
}

export default function DevPortfolioOverview({
  projects,
  versions,
  workSessions,
  now,
  query = "",
  compact = false,
  showHeading = true,
}: Props) {
  const [fallbackNow] = useState(() => Date.now());
  const portfolio = buildDevPortfolio(projects, versions, workSessions, now ?? fallbackNow);
  const normalizedQuery = query.trim().toLocaleLowerCase("hu-HU");
  const coreProjects = portfolio.coreProjects.filter((project) => matchesProject(project, normalizedQuery));
  const externalProjects = portfolio.externalProjects.filter((project) => matchesProject(project, normalizedQuery));
  const unassigned = portfolio.unassignedProject && matchesProject(portfolio.unassignedProject, normalizedQuery)
    ? portfolio.unassignedProject
    : undefined;

  return (
    <div className={`dev-portfolio-overview ${compact ? "is-compact" : ""}`}>
      {showHeading ? (
        <div className="dev-portfolio-heading">
          <div>
            <p className="dev-section-label">Mai termékcsalád- és projektstruktúra</p>
            <h2>Központi összesítők és külön modulkártyák</h2>
          </div>
          <span>A projektindulás és az utolsó munka külön látható.</span>
        </div>
      ) : null}

      <div className="dev-product-family-grid">
        {coreProjects.map((project) => <ProductProjectCard key={project.id} project={project} compact={compact} />)}
      </div>

      {externalProjects.length ? (
        <section className="dev-external-projects">
          <div className="dev-external-projects__heading">
            <div><p className="dev-section-label">Külön kezelt munkaterek</p><h3>Külső és vállalati projektek</h3></div>
            <span>{externalProjects.length} projekt</span>
          </div>
          <div className="dev-product-family-grid dev-product-family-grid--external">
            {externalProjects.map((project) => <ProductProjectCard key={project.id} project={project} compact={compact} />)}
          </div>
        </section>
      ) : null}

      {unassigned && !compact ? (
        <div className="dev-unassigned-project">
          <FolderKanban size={18} />
          <div><strong>{unassigned.name}</strong><span>{unassigned.versionCount} verzió · indulás: {formatDate(unassigned.startedAt)} · utolsó munka: {formatDate(unassigned.lastActivityAt)}</span></div>
          <Link href="/admin/fejlesztesi-naplo">Besorolás <ChevronRight size={14} /></Link>
        </div>
      ) : null}
    </div>
  );
}
