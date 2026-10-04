import { authQuery } from "./db";
import {
  createDimproAuthInvitationToken,
  hashDimproAuthInvitationToken,
  isValidDimproAuthInvitationToken,
  normalizeDimproAuthEmail,
} from "./security";
import { DimproAuthError } from "./types";

export type DimproProjectInvitationRole = "DRIVE_PROJECT_MEMBER" | "DRIVE_PROJECT_MANAGER";

export type DimproProjectInvitation = {
  id: string;
  email: string;
  userId: string;
  projectId: string;
  projectName: string;
  organizationId: string | null;
  roleCode: DimproProjectInvitationRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
};

function invitationError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const known: Array<[string, string, number, string]> = [
    ["AUTH_INVITATION_PERMISSION_DENIED", "AUTH_INVITATION_PERMISSION_DENIED", 403, "Nincs jogosultságod projektmeghívás létrehozásához."],
    ["AUTH_INVITATION_USER_BLOCKED", "AUTH_INVITATION_USER_BLOCKED", 403, "A meghívott felhasználó jelenleg nem aktiválható."],
    ["AUTH_INVITATION_PROJECT_INVALID", "AUTH_INVITATION_PROJECT_INVALID", 404, "A projekt nem található vagy nem aktív."],
    ["AUTH_INVITATION_ROLE_INVALID", "AUTH_INVITATION_ROLE_INVALID", 400, "A meghívotti szerepkör nem engedélyezett."],
    ["AUTH_PROJECT_ROLE_INVALID", "AUTH_PROJECT_ROLE_INVALID", 400, "A projekt-hozzáférési szerepkör nem engedélyezett."],
    ["AUTH_INVITATION_EMAIL_INVALID", "AUTH_INVITATION_EMAIL_INVALID", 400, "Érvényes meghívotti e-mail-cím szükséges."],
    ["AUTH_INVITATION_EXPIRY_INVALID", "AUTH_INVITATION_EXPIRY_INVALID", 400, "A meghívó lejárati ideje nem engedélyezett."],
    ["AUTH_INVITATION_EXPIRED", "AUTH_INVITATION_EXPIRED", 410, "A meghívó lejárt."],
    ["AUTH_INVITATION_NOT_ACTIVE", "AUTH_INVITATION_NOT_ACTIVE", 409, "A meghívó már nem aktív."],
  ];
  for (const [fragment, code, status, publicMessage] of known) {
    if (message.includes(fragment)) throw new DimproAuthError(message, code, status, publicMessage);
  }
  throw error;
}

export async function createProjectInvitation(input: {
  inviterUserId: string;
  email: string;
  displayName?: string | null;
  projectId: string;
  roleCode?: DimproProjectInvitationRole;
  expiresInDays?: number;
}) {
  const email = normalizeDimproAuthEmail(input.email);
  const roleCode = input.roleCode || "DRIVE_PROJECT_MEMBER";
  const days = Number.isSafeInteger(input.expiresInDays) ? Number(input.expiresInDays) : 7;
  if (days < 1 || days > 30) throw new DimproAuthError("Invitation expiry out of range.", "AUTH_INVITATION_EXPIRY_INVALID", 400, "A meghívó 1–30 napig lehet érvényes.");
  const rawToken = createDimproAuthInvitationToken();
  const tokenHash = hashDimproAuthInvitationToken(rawToken);
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  try {
    const result = await authQuery<{
      invitation_id: string;
      invited_user_id: string;
      email_normalized: string;
      project_id: string;
      project_name: string;
      organization_id: string | null;
      role_code: DimproProjectInvitationRole;
      expires_at: Date | string;
    }>(
      `SELECT * FROM auth_invite_project_member($1,$2,$3,$4,$5,$6,$7)`,
      [input.inviterUserId, email, input.displayName || "", input.projectId, roleCode, tokenHash, expiresAt],
    );
    const row = result.rows[0];
    if (!row) throw new Error("AUTH_INVITATION_CREATE_EMPTY_RESULT");
    return {
      invitation: {
        id: row.invitation_id,
        email: row.email_normalized,
        userId: row.invited_user_id,
        projectId: row.project_id,
        projectName: row.project_name,
        organizationId: row.organization_id,
        roleCode: row.role_code,
        status: "PENDING" as const,
        expiresAt: new Date(row.expires_at).toISOString(),
      },
      rawToken,
    };
  } catch (error) {
    invitationError(error);
  }
}

export async function getProjectInvitation(rawToken: string): Promise<DimproProjectInvitation | null> {
  if (!isValidDimproAuthInvitationToken(rawToken)) return null;
  const result = await authQuery<{
    id: string;
    email_normalized: string;
    invited_user_id: string;
    project_id: string;
    project_name: string;
    organization_id: string | null;
    role_code: DimproProjectInvitationRole;
    status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
    expires_at: Date | string;
  }>(
    `SELECT i.id,i.email_normalized,i.invited_user_id,i.project_id,project.name AS project_name,i.organization_id,r.code AS role_code,i.status,i.expires_at
       FROM auth_invitations i
       JOIN auth_projects project ON project.id=i.project_id
       JOIN auth_roles r ON r.id=i.role_id
      WHERE i.token_hash=$1
      LIMIT 1`,
    [hashDimproAuthInvitationToken(rawToken)],
  );
  const row = result.rows[0];
  if (!row) return null;
  const expired = row.status === "PENDING" && new Date(row.expires_at).getTime() <= Date.now();
  return {
    id: row.id,
    email: row.email_normalized,
    userId: row.invited_user_id,
    projectId: row.project_id,
    projectName: row.project_name,
    organizationId: row.organization_id,
    roleCode: row.role_code,
    status: expired ? "EXPIRED" : row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function listProjectInvitationsByExternalProject(externalProjectId: string) {
  const result = await authQuery<{
    id: string; email_normalized: string; invited_user_id: string; project_id: string; project_name: string;
    organization_id: string | null; role_code: DimproProjectInvitationRole; status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
    expires_at: Date | string; created_at: Date | string;
  }>(
    `SELECT invitation.id,invitation.email_normalized,invitation.invited_user_id,invitation.project_id,project.name AS project_name,
            invitation.organization_id,role.code AS role_code,invitation.status,invitation.expires_at,invitation.created_at
       FROM auth_invitations invitation
       JOIN auth_projects project ON project.id=invitation.project_id
       JOIN auth_roles role ON role.id=invitation.role_id
      WHERE project.external_project_id=$1
      ORDER BY invitation.created_at DESC`,
    [externalProjectId],
  );
  return result.rows.map((row) => ({
    id: row.id, email: row.email_normalized, userId: row.invited_user_id, projectId: row.project_id, projectName: row.project_name,
    organizationId: row.organization_id, roleCode: row.role_code,
    status: row.status === "PENDING" && new Date(row.expires_at).getTime() <= Date.now() ? "EXPIRED" as const : row.status,
    expiresAt: new Date(row.expires_at).toISOString(), createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function acceptProjectInvitation(rawToken: string) {
  if (!isValidDimproAuthInvitationToken(rawToken)) {
    throw new DimproAuthError("Invalid invitation token.", "AUTH_INVITATION_TOKEN_INVALID", 400, "A meghívóazonosító érvénytelen.");
  }
  try {
    const result = await authQuery<{
      invitation_id: string;
      invited_user_id: string;
      product_code: string;
      project_id: string;
      project_name: string;
      role_code: DimproProjectInvitationRole;
    }>(`SELECT * FROM auth_accept_project_invitation($1)`, [hashDimproAuthInvitationToken(rawToken)]);
    const row = result.rows[0];
    if (!row) throw new Error("AUTH_INVITATION_ACCEPT_EMPTY_RESULT");
    return {
      invitationId: row.invitation_id,
      userId: row.invited_user_id,
      productCode: row.product_code,
      projectId: row.project_id,
      projectName: row.project_name,
      roleCode: row.role_code,
    };
  } catch (error) {
    invitationError(error);
  }
}

export async function revokeProjectInvitation(actorUserId: string, invitationId: string) {
  try {
    const result = await authQuery<{ revoked: boolean }>(
      `SELECT auth_revoke_project_invitation($1,$2) AS revoked`,
      [actorUserId, invitationId],
    );
    return Boolean(result.rows[0]?.revoked);
  } catch (error) {
    invitationError(error);
  }
}

export async function revokeProjectAccess(actorUserId: string, targetUserId: string, projectId: string) {
  try {
    const result = await authQuery<{ revoked_count: number }>(
      `SELECT auth_revoke_project_access($1,$2,$3) AS revoked_count`,
      [actorUserId, targetUserId, projectId],
    );
    return Number(result.rows[0]?.revoked_count || 0);
  } catch (error) {
    invitationError(error);
  }
}

export async function replaceProjectAccessRole(input: {
  actorUserId: string;
  targetUserId: string;
  targetEmail: string;
  targetDisplayName?: string | null;
  projectId: string;
  roleCode: DimproProjectInvitationRole;
}) {
  const email = normalizeDimproAuthEmail(input.targetEmail);
  await revokeProjectAccess(input.actorUserId, input.targetUserId, input.projectId);
  const created = await createProjectInvitation({
    inviterUserId: input.actorUserId,
    email,
    displayName: input.targetDisplayName || null,
    projectId: input.projectId,
    roleCode: input.roleCode,
    expiresInDays: 1,
  });
  if (created.invitation.userId !== input.targetUserId) {
    await revokeProjectInvitation(input.actorUserId, created.invitation.id).catch(() => false);
    throw new DimproAuthError(
      "Role replacement resolved a different AUTH user.",
      "AUTH_PROJECT_MEMBER_IDENTITY_MISMATCH",
      409,
      "A projekttag központi AUTH azonosítása megváltozott; a szerepkörváltás megszakadt.",
    );
  }
  const accepted = await acceptProjectInvitation(created.rawToken);
  if (accepted.userId !== input.targetUserId || accepted.projectId !== input.projectId || accepted.roleCode !== input.roleCode) {
    throw new DimproAuthError(
      "Role replacement acceptance scope mismatch.",
      "AUTH_PROJECT_ROLE_REPLACEMENT_MISMATCH",
      409,
      "A szerepkörváltás központi AUTH ellenőrzése nem egyezett; a művelet megszakadt.",
    );
  }
  return { roleCode: accepted.roleCode, invitationId: accepted.invitationId };
}
