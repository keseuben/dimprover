"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, MailPlus, ShieldCheck, Users, X } from "lucide-react";
import { permissionsForRole, projectRoleLabel } from "@/app/lib/project-core/permissions";
import type { ProjectMembership, ProjectMembershipRole, ProjectPermission } from "@/app/lib/project-core/types";
import styles from "./ProjectAccessMenu.module.css";

type Props = {
  projectId: string;
  fallbackCount?: number;
  compact?: boolean;
  canManageMembers?: boolean;
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

export default function ProjectAccessMenu({ projectId, fallbackCount = 0, compact = false, canManageMembers = false }: Props) {
  const [memberships, setMemberships] = useState<ProjectMembership[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOrganization, setInviteOrganization] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectMembershipRole>("VIEWER");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const loadMemberships = useCallback(async (signal?: AbortSignal) => {
    setLoaded(false);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memberships`, {
        signal, credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
      });
      const payload = await response.json() as MembershipPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projekthozzáférések nem tölthetők be.");
      setMemberships(payload.memberships || []);
      setLoaded(true);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "A projekthozzáférések nem tölthetők be.");
      setLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadMemberships(controller.signal);
    return () => controller.abort();
  }, [loadMemberships]);

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

  async function submitInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageMembers || inviteBusy) return;
    const email = inviteEmail.trim().toLowerCase();
    const organizationName = inviteOrganization.trim();
    if (!email.includes("@") || !organizationName) {
      setInviteError("E-mail-cím és szervezet megadása kötelező.");
      return;
    }
    setInviteBusy(true);
    setInviteError("");
    setInviteMessage("");
    try {
      const response = await fetch("/api/dimpro-auth/invitations/project", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ projectId, email, organizationName, role: inviteRole }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || payload?.error || "A projektmeghívó nem küldhető el.");
      setInviteEmail("");
      setInviteOrganization("");
      setInviteRole("VIEWER");
      setInviteMessage("A projektmeghívó e-mail elküldve.");
      await loadMemberships();
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : "A projektmeghívó nem küldhető el.");
    } finally {
      setInviteBusy(false);
    }
  }

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
            {canManageMembers ? (
              <section className={styles.inviteSection}>
                <button type="button" className={styles.inviteToggle} onClick={() => { setInviteOpen((current) => !current); setInviteError(""); setInviteMessage(""); }}>
                  <MailPlus size={14} /> {inviteOpen ? "Meghívó bezárása" : "Résztvevő meghívása"}
                </button>
                {inviteOpen ? (
                  <form className={styles.inviteForm} onSubmit={submitInvitation}>
                    <label>E-mail-cím<input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="nev@ceg.hu" /></label>
                    <label>Szervezet<input required value={inviteOrganization} onChange={(event) => setInviteOrganization(event.target.value)} placeholder="pl. Partner Kft." /></label>
                    <label>Jogosultság<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as ProjectMembershipRole)}>
                      <option value="PROJECT_MANAGER">Projektvezető</option>
                      <option value="CONTRIBUTOR">Közreműködő</option>
                      <option value="REVIEWER">Ellenőrző</option>
                      <option value="VIEWER">Megtekintő</option>
                    </select></label>
                    {inviteError ? <div className={styles.inviteError}>{inviteError}</div> : null}
                    {inviteMessage ? <div className={styles.inviteSuccess}>{inviteMessage}</div> : null}
                    <button type="submit" className={styles.inviteSubmit} disabled={inviteBusy || !inviteEmail.trim() || !inviteOrganization.trim()}>
                      {inviteBusy ? <Loader2 size={14} className={styles.spin} /> : <MailPlus size={14} />} Meghívó e-mail küldése
                    </button>
                  </form>
                ) : null}
              </section>
            ) : null}
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
