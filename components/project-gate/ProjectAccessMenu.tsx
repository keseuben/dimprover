"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { permissionsForRole, projectRoleLabel } from "@/app/lib/project-core/permissions";
import type { ProjectMembership, ProjectMembershipRole, ProjectPermission } from "@/app/lib/project-core/types";
import styles from "./ProjectAccessMenu.module.css";

type Props = {
  projectId: string;
  fallbackCount?: number;
  compact?: boolean;
};

type AccessPayload = {
  ok?: boolean;
  error?: string;
  memberships?: ProjectMembership[];
  access?: {
    canManageMembers: boolean;
    actorRole: ProjectMembershipRole;
    actorMembershipId: string;
  };
};

type ProjectInvitation = {
  id: string;
  email: string;
  userId: string;
  projectId: string;
  projectName: string;
  roleCode: "DRIVE_PROJECT_MEMBER" | "DRIVE_PROJECT_MANAGER";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
};

type InvitationPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  invitations?: ProjectInvitation[];
};

type EditableRole = Exclude<ProjectMembershipRole, "OWNER">;
type PanelView = "members" | "pending";

const editableRoles: Array<{ value: EditableRole; label: string; hint: string }> = [
  { value: "PROJECT_MANAGER", label: "Projektvezető", hint: "Tagkezelés, projektmódosítás és teljes dokumentum-munkafolyamat." },
  { value: "CONTRIBUTOR", label: "Közreműködő", hint: "Dokumentumfeltöltés, hozzászólás, ügyek és napi projektmunka." },
  { value: "REVIEWER", label: "Ellenőrző", hint: "Olvasás, véleményezés, jóváhagyás és audit-hozzáférés." },
  { value: "VIEWER", label: "Megtekintő", hint: "Csak olvasási és megtekintési jogosultság." },
];

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

function invitationRole(membership: ProjectMembership | undefined): EditableRole {
  if (!membership || membership.role === "OWNER") return "VIEWER";
  return membership.role;
}

function shortDate(value: string) {
  try {
    return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ProjectAccessMenu({ projectId, fallbackCount = 0, compact = false }: Props) {
  const [memberships, setMemberships] = useState<ProjectMembership[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [access, setAccess] = useState<AccessPayload["access"]>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PanelView>("members");
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draftRoles, setDraftRoles] = useState<Record<string, EditableRole>>({});
  const [confirmRemove, setConfirmRemove] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteOrganization, setInviteOrganization] = useState("");
  const [inviteRole, setInviteRole] = useState<EditableRole>("VIEWER");
  const [inviteDays, setInviteDays] = useState(7);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memberships`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => null) as AccessPayload | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A projekthozzáférések nem tölthetők be.");
    const nextMemberships = payload.memberships || [];
    setMemberships(nextMemberships);
    setAccess(payload.access);
    setDraftRoles(Object.fromEntries(
      nextMemberships
        .filter((member): member is ProjectMembership & { role: EditableRole } => member.role !== "OWNER")
        .map((member) => [member.id, member.role]),
    ));
    if (payload.access?.canManageMembers) {
      const invitationResponse = await fetch(
        `/api/dimpro-auth/invitations/project?projectId=${encodeURIComponent(projectId)}`,
        { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
      );
      const invitationPayload = await invitationResponse.json().catch(() => null) as InvitationPayload | null;
      if (invitationResponse.ok && invitationPayload?.ok) setInvitations(invitationPayload.invitations || []);
      else setInvitations([]);
    } else {
      setInvitations([]);
    }
    setLoaded(true);
  }, [projectId]);

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
        const payload = await response.json() as AccessPayload;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "A projekthozzáférések nem tölthetők be.");
        const nextMemberships = payload.memberships || [];
        setMemberships(nextMemberships);
        setAccess(payload.access);
        setDraftRoles(Object.fromEntries(
          nextMemberships
            .filter((member): member is ProjectMembership & { role: EditableRole } => member.role !== "OWNER")
            .map((member) => [member.id, member.role]),
        ));
        if (payload.access?.canManageMembers) {
          const invitationResponse = await fetch(
            `/api/dimpro-auth/invitations/project?projectId=${encodeURIComponent(projectId)}`,
            { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
          );
          const invitationPayload = await invitationResponse.json().catch(() => null) as InvitationPayload | null;
          if (invitationResponse.ok && invitationPayload?.ok) setInvitations(invitationPayload.invitations || []);
        }
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
  const invitedMemberships = useMemo(
    () => memberships.filter((membership) => membership.status === "INVITED"),
    [memberships],
  );
  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === "PENDING" || invitation.status === "EXPIRED"),
    [invitations],
  );
  const activeCount = loaded && !error ? activeMembers.length : fallbackCount;
  const invitedCount = pendingInvitations.filter((item) => item.status === "PENDING").length || invitedMemberships.length;
  const selectedInviteRole = editableRoles.find((item) => item.value === inviteRole)!;

  async function mutate(path: string, init: RequestInit) {
    setError("");
    setSuccess("");
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || payload?.error || "A művelet nem sikerült.");
    return payload;
  }

  async function submitInvite() {
    if (!inviteEmail.trim() || !inviteOrganization.trim()) {
      setError("A meghíváshoz e-mail-cím és szervezet szükséges.");
      return;
    }
    setBusy("invite");
    try {
      await mutate("/api/dimpro-auth/invitations/project", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          email: inviteEmail.trim(),
          displayName: inviteName.trim(),
          organizationName: inviteOrganization.trim(),
          role: inviteRole,
          expiresInDays: inviteDays,
        }),
      });
      setSuccess("A projektmeghívás elküldve.");
      setInviteEmail("");
      setInviteName("");
      setInviteOrganization("");
      setInviteRole("VIEWER");
      setInviteDays(7);
      setShowInvite(false);
      await load();
      setView("pending");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A meghívás nem sikerült.");
    } finally {
      setBusy("");
    }
  }

  async function saveRole(member: ProjectMembership) {
    const nextRole = draftRoles[member.id];
    if (!nextRole || nextRole === member.role) return;
    setBusy(`role:${member.id}`);
    try {
      await mutate(`/api/projects/${encodeURIComponent(projectId)}/memberships`, {
        method: "PATCH",
        body: JSON.stringify({ membershipId: member.id, role: nextRole }),
      });
      setSuccess("A szerepkör módosítva.");
      await load();
    } catch (caught) {
      setDraftRoles((current) => ({ ...current, [member.id]: member.role as EditableRole }));
      setError(caught instanceof Error ? caught.message : "A szerepkör módosítása nem sikerült.");
    } finally {
      setBusy("");
    }
  }

  async function removeMember(member: ProjectMembership) {
    if (confirmRemove !== member.id) {
      setConfirmRemove(member.id);
      return;
    }
    setBusy(`remove:${member.id}`);
    try {
      await mutate(`/api/projects/${encodeURIComponent(projectId)}/memberships`, {
        method: "DELETE",
        body: JSON.stringify({ membershipId: member.id }),
      });
      setConfirmRemove("");
      setSuccess("A projekthozzáférés megszüntetve.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A hozzáférés megszüntetése nem sikerült.");
    } finally {
      setBusy("");
    }
  }

  function pendingMembershipFor(invitation: ProjectInvitation) {
    return invitedMemberships.find((member) =>
      member.email?.toLowerCase() === invitation.email.toLowerCase()
      || member.userId.toLowerCase() === invitation.email.toLowerCase()
    );
  }

  async function revokeInvitation(invitation: ProjectInvitation) {
    setBusy(`revoke:${invitation.id}`);
    try {
      await mutate("/api/dimpro-auth/invitations/project", {
        method: "DELETE",
        body: JSON.stringify({ projectId, invitationId: invitation.id }),
      });
      setSuccess("A függő meghívás visszavonva.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A meghívás visszavonása nem sikerült.");
    } finally {
      setBusy("");
    }
  }

  async function resendInvitation(invitation: ProjectInvitation) {
    const membership = pendingMembershipFor(invitation);
    setBusy(`resend:${invitation.id}`);
    try {
      await mutate("/api/dimpro-auth/invitations/project", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          email: invitation.email,
          displayName: membership?.displayName || "",
          organizationName: membership?.organizationName || "",
          role: invitationRole(membership),
          expiresInDays: 7,
        }),
      });
      setSuccess("A meghívás újraküldve, az előző link érvénytelenítve.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A meghívás újraküldése nem sikerült.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={styles.root} ref={rootRef} data-project-access-menu="0.2.0">
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
            <div className={styles.headerActions}>
              {access?.canManageMembers && (
                <button
                  type="button"
                  className={styles.inviteTop}
                  onClick={() => { setShowInvite((current) => !current); setView("members"); }}
                  title="Ember meghívása"
                >
                  <UserPlus size={14} />
                  <span>Ember meghívása</span>
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} title="Bezárás" aria-label="Jogosultságpanel bezárása">
                <X size={14} />
              </button>
            </div>
          </header>

          <nav className={styles.tabs} aria-label="Projekt-hozzáférés nézet">
            <button type="button" className={view === "members" ? styles.tabActive : ""} onClick={() => setView("members")}>
              <Users size={13} /> Tagok <b>{activeCount}</b>
            </button>
            <button type="button" className={view === "pending" ? styles.tabActive : ""} onClick={() => setView("pending")}>
              <Clock3 size={13} /> Függő meghívások <b>{invitedCount}</b>
            </button>
          </nav>

          {showInvite && access?.canManageMembers && (
            <div className={styles.inviteForm}>
              <div className={styles.inviteHeading}>
                <div>
                  <strong>Ember meghívása</strong>
                  <span>A meghívott csak ehhez a projekthez kap hozzáférést.</span>
                </div>
                <button type="button" onClick={() => setShowInvite(false)} aria-label="Meghívás bezárása"><X size={13} /></button>
              </div>
              <div className={styles.formGrid}>
                <label className={styles.fieldWide}>
                  <span>E-mail-cím *</span>
                  <div className={styles.inputIcon}><Mail size={13} /><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" placeholder="nev@ceg.hu" /></div>
                </label>
                <label>
                  <span>Név</span>
                  <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Név" />
                </label>
                <label>
                  <span>Szervezet *</span>
                  <div className={styles.inputIcon}><Building2 size={13} /><input required value={inviteOrganization} onChange={(event) => setInviteOrganization(event.target.value)} placeholder="Cég / szervezet" /></div>
                </label>
                <label>
                  <span>Szerepkör</span>
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as EditableRole)}>
                    {editableRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Meghívó érvényessége</span>
                  <select value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))}>
                    <option value={3}>3 nap</option>
                    <option value={7}>7 nap</option>
                    <option value={14}>14 nap</option>
                    <option value={30}>30 nap</option>
                  </select>
                </label>
              </div>
              <div className={styles.rolePreview}>
                <ShieldCheck size={14} />
                <div><strong>{selectedInviteRole.label}</strong><span>{selectedInviteRole.hint}</span></div>
              </div>
              <div className={styles.formActions}>
                <button type="button" onClick={() => setShowInvite(false)}>Mégse</button>
                <button type="button" className={styles.primaryButton} onClick={() => void submitInvite()} disabled={busy === "invite"}>
                  {busy === "invite" ? <LoaderCircle size={14} className={styles.spin} /> : <Mail size={14} />}
                  Meghívás küldése
                </button>
              </div>
            </div>
          )}

          {(error || success) && (
            <div className={error ? styles.alertError : styles.alertSuccess}>
              {error || success}
              <button type="button" onClick={() => { setError(""); setSuccess(""); }} aria-label="Üzenet bezárása"><X size={12} /></button>
            </div>
          )}

          <div className={styles.body}>
            {!loaded && !error && <div className={styles.message}><LoaderCircle size={15} className={styles.spin} /> Jogosultságok betöltése…</div>}

            {loaded && view === "members" && activeMembers.map((member) => {
              const isOwner = member.role === "OWNER";
              const isSelf = access?.actorMembershipId === member.id;
              const draftRole = !isOwner ? (draftRoles[member.id] || member.role as EditableRole) : null;
              const roleChanged = !isOwner && draftRole !== member.role;
              const removing = busy === `remove:${member.id}`;
              return (
                <article className={styles.member} key={member.id}>
                  <span className={`${styles.memberIcon} ${isOwner ? styles.ownerIcon : ""}`}><ShieldCheck size={14} /></span>
                  <div className={styles.memberMain}>
                    <div className={styles.memberTitle}>
                      <strong>{member.displayName || member.email || member.userId}</strong>
                      <div>
                        {isSelf && <span className={styles.selfBadge}>Te</span>}
                        {isOwner && <span className={styles.ownerBadge}>Projektgazda</span>}
                      </div>
                    </div>
                    <small>{secondaryLine(member)}</small>
                    {access?.canManageMembers && !isOwner && !isSelf ? (
                      <div className={styles.roleEditor}>
                        <label>
                          <span>Szerepkör módosítása</span>
                          <select
                            value={draftRole || "VIEWER"}
                            onChange={(event) => setDraftRoles((current) => ({ ...current, [member.id]: event.target.value as EditableRole }))}
                            disabled={busy !== ""}
                          >
                            {editableRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                          </select>
                        </label>
                        <button
                          type="button"
                          className={styles.saveRole}
                          onClick={() => void saveRole(member)}
                          disabled={!roleChanged || busy !== ""}
                          title="Szerepkör mentése"
                        >
                          {busy === `role:${member.id}` ? <LoaderCircle size={13} className={styles.spin} /> : <Save size={13} />}
                        </button>
                      </div>
                    ) : (
                      <span className={styles.role}>{projectRoleLabel(member.role)}</span>
                    )}
                    <p>{rolePermissionSummary(member.role)}</p>
                    {isSelf && !isOwner && <p>A saját projektszerepköröd ezen a kezelőn nem módosítható.</p>}
                    {access?.canManageMembers && !isOwner && !isSelf && (
                      <div className={styles.memberActions}>
                        {confirmRemove === member.id ? (
                          <>
                            <span>Biztosan megszünteted?</span>
                            <button type="button" onClick={() => setConfirmRemove("")} disabled={removing}>Mégse</button>
                            <button type="button" className={styles.dangerButton} onClick={() => void removeMember(member)} disabled={removing}>
                              {removing ? <LoaderCircle size={12} className={styles.spin} /> : <Trash2 size={12} />}
                              Hozzáférés megszüntetése
                            </button>
                          </>
                        ) : (
                          <button type="button" className={styles.removeLink} onClick={() => setConfirmRemove(member.id)} disabled={busy !== ""}>
                            <Trash2 size={11} /> Hozzáférés megszüntetése
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {loaded && view === "members" && !activeMembers.length && (
              <div className={styles.message}>Nincs aktív projekthozzáférés.</div>
            )}

            {loaded && view === "pending" && pendingInvitations.map((invitation) => {
              const membership = pendingMembershipFor(invitation);
              const pendingRole = invitationRole(membership);
              const role = editableRoles.find((item) => item.value === pendingRole)!;
              const expired = invitation.status === "EXPIRED";
              return (
                <article className={styles.pendingCard} key={invitation.id}>
                  <div className={styles.pendingTop}>
                    <span className={styles.pendingIcon}><Mail size={14} /></span>
                    <div>
                      <strong>{membership?.displayName || invitation.email}</strong>
                      <small>{invitation.email}{membership?.organizationName ? ` · ${membership.organizationName}` : ""}</small>
                    </div>
                    <span className={expired ? styles.expiredBadge : styles.pendingBadge}>{expired ? "Lejárt" : "Függő"}</span>
                  </div>
                  <div className={styles.pendingMeta}>
                    <span>{role.label}</span>
                    <span>Lejárat: {shortDate(invitation.expiresAt)}</span>
                  </div>
                  {access?.canManageMembers && (
                    <div className={styles.pendingActions}>
                      <button type="button" onClick={() => void resendInvitation(invitation)} disabled={busy !== ""}>
                        {busy === `resend:${invitation.id}` ? <LoaderCircle size={12} className={styles.spin} /> : <RefreshCw size={12} />}
                        Újraküldés
                      </button>
                      <button type="button" className={styles.dangerGhost} onClick={() => void revokeInvitation(invitation)} disabled={busy !== ""}>
                        {busy === `revoke:${invitation.id}` ? <LoaderCircle size={12} className={styles.spin} /> : <Trash2 size={12} />}
                        Visszavonás
                      </button>
                    </div>
                  )}
                </article>
              );
            })}

            {loaded && view === "pending" && !pendingInvitations.length && (
              <div className={styles.message}><Check size={15} /> Nincs függő projektmeghívás.</div>
            )}
          </div>

          <footer className={styles.footer}>
            <span>Aktív: <strong>{activeCount}</strong></span>
            <span>Függő: <strong>{invitedCount}</strong></span>
            <span className={styles.footerRole}>Saját szerepkör: <strong>{access?.actorRole ? projectRoleLabel(access.actorRole) : "—"}</strong></span>
          </footer>
        </section>
      )}
    </div>
  );
}
