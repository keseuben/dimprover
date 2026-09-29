"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ShieldCheck, Users, X } from "lucide-react";
import { permissionsForRole, projectRoleLabel } from "@/app/lib/project-core/permissions";
import type { ProjectMembership, ProjectMembershipRole, ProjectPermission } from "@/app/lib/project-core/types";
import styles from "./ProjectAccessMenu.module.css";

type Props = {
  projectId: string;
  fallbackCount?: number;
  compact?: boolean;
};

type MembershipPayload = {
  ok?: boolean;
  error?: string;
  memberships?: ProjectMembership[];
};

const permissionGroups: Array<{ label: string; permissions: ProjectPermission[] }> = [
  { label: "Projektkezelés", permissions: ["project.update", "project.manage_members", "project.manage_lifecycle"] },
  { label: "Dokumentumok", permissions: ["document.write", "document.comment", "document.approve", "document.issue", "document.delete"] },
  { label: "Ügyek / RFI", permissions: ["issue.write"] },
  { label: "Kommunikáció", permissions: ["dialog.write"] },
  { label: "Jóváhagyás", permissions: ["approval.write", "approval.respond"] },
  { label: "Napló", permissions: ["diary.write", "diary.close"] },
  { label: "Audit / export", permissions: ["audit.read", "export.create"] },
];

function rolePermissionSummary(role: ProjectMembershipRole) {
  const allowed = new Set(permissionsForRole(role));
  const groups = permissionGroups
    .filter((group) => group.permissions.some((permission) => allowed.has(permission)))
    .map((group) => group.label);
  if (!groups.length) return "Megtekintési jogosultság";
  return groups.join(" · ");
}

function secondaryLine(member: ProjectMembership) {
  const values = [member.organizationName, member.email].filter(Boolean);
  return values.length ? values.join(" · ") : member.userId;
}

export default function ProjectAccessMenu({ projectId, fallbackCount = 0, compact = false }: Props) {
  const [memberships, setMemberships] = useState<ProjectMembership[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setError("");
    fetch(`/api/projects/${encodeURIComponent(projectId)}/memberships`, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = await response.json() as MembershipPayload;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "A projekthozzáférések nem tölthetők be.");
        setMemberships(payload.memberships || []);
        setLoaded(true);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "A projekthozzáférések nem tölthetők be.");
        setLoaded(true);
      });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeMembers = useMemo(
    () => memberships.filter((membership) => membership.status === "ACTIVE"),
    [memberships],
  );
  const invitedCount = useMemo(
    () => memberships.filter((membership) => membership.status === "INVITED").length,
    [memberships],
  );
  const activeCount = loaded && !error ? activeMembers.length : fallbackCount;

  return (
    <div className={styles.root} ref={rootRef} data-project-access-menu="0.1.0">
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.triggerCompact : ""} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((current) => !current)}
        title={`Projekt-hozzáférések: ${activeCount} aktív`}
        aria-label={`Projekt-hozzáférések, ${activeCount} aktív`}
        aria-expanded={open}
      >
        <Users size={compact ? 16 : 18} />
        <b className={styles.badge}>{activeCount}</b>
        {!compact && <ChevronDown size={12} className={styles.chevron} />}
      </button>

      {open && (
        <section className={styles.popover} role="dialog" aria-label="Projekt-hozzáférések">
          <header className={styles.header}>
            <div>
              <span>Projekt-hozzáférések</span>
              <strong>{activeCount} aktív hozzáférés</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)} title="Bezárás" aria-label="Jogosultságpanel bezárása">
              <X size={14} />
            </button>
          </header>

          <div className={styles.body}>
            {error && <div className={styles.message}>{error}</div>}
            {!loaded && !error && <div className={styles.message}>Jogosultságok betöltése…</div>}
            {loaded && !error && activeMembers.map((member) => (
              <article className={styles.member} key={member.id}>
                <span className={styles.memberIcon}><ShieldCheck size={14} /></span>
                <div className={styles.memberMain}>
                  <strong>{member.displayName || member.email || member.userId}</strong>
                  <small>{secondaryLine(member)}</small>
                  <span className={styles.role}>{projectRoleLabel(member.role)}</span>
                  <p>{rolePermissionSummary(member.role)}</p>
                </div>
              </article>
            ))}
            {loaded && !error && !activeMembers.length && (
              <div className={styles.message}>Nincs aktív projekthozzáférés.</div>
            )}
          </div>

          <footer className={styles.footer}>
            <span>Aktív: <strong>{activeCount}</strong></span>
            {invitedCount > 0 && <span>Függő meghívás: <strong>{invitedCount}</strong></span>}
          </footer>
        </section>
      )}
    </div>
  );
}
