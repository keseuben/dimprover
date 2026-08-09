import { createDropPackage } from "./dropRepository";
import {
  listDropSpaceMemberships,
  type DropSpaceListItem,
} from "./dropSpaceRepository";
import { parseDropCreatePackageInput } from "./dropValidation";
import type {
  DropCreatedPackage,
  DropGroupInput,
  DropPackageMode,
} from "./dropTypes";
import type { DropSpacePackageVisibility } from "./dropSpaceTypes";

export type DropSpaceResolvedSession = Awaited<ReturnType<typeof import("./dropSpaceRepository").resolveDropSpaceSession>>;

export type DropSpacePackageCreateRequest = {
  mode?: DropPackageMode;
  title?: string;
  description?: string;
  projectId?: string;
  retentionDays?: number;
  pin?: string;
  visibility?: DropSpacePackageVisibility;
  selectedMembershipIds?: string[];
  groups?: DropGroupInput[];
};

function serviceError(message: string, code: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  return error;
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function normalizeVisibility(value: unknown): DropSpacePackageVisibility {
  const allowed: DropSpacePackageVisibility[] = ["space_members", "selected_members", "private"];
  if (allowed.includes(value as DropSpacePackageVisibility)) return value as DropSpacePackageVisibility;
  return "selected_members";
}

export async function createPackageInDropSpace(
  session: DropSpaceResolvedSession,
  rawInput: DropSpacePackageCreateRequest,
): Promise<DropCreatedPackage> {
  if (!session.permissions.includes("package.create")) {
    throw serviceError("A tértagsági szerepkör nem hozhat létre saját csomagot.", "DROP_SPACE_PACKAGE_CREATE_FORBIDDEN", 403);
  }
  if (session.runtimeMode !== "writable") {
    throw serviceError("A Drop tér jelenleg csak olvasható vagy blokkolt.", "DROP_SPACE_NOT_WRITABLE", 409);
  }
  if (session.packageCount >= session.space.maxPackages) {
    throw serviceError("A Drop tér elérte a licenc szerinti csomaglimitet.", "DROP_SPACE_PACKAGE_LIMIT_REACHED", 409);
  }

  const retentionDays = Number(rawInput.retentionDays || 7);
  const proposedExpiry = Date.now() + retentionDays * 86_400_000;
  if (proposedExpiry > new Date(session.effectiveAccessEndsAt).getTime()) {
    throw serviceError(
      "A csomag megőrzési ideje túlnyúlna a tér vagy a tagság hozzáférési idején.",
      "DROP_SPACE_PACKAGE_EXCEEDS_ACCESS_END",
      400,
    );
  }

  const visibility = normalizeVisibility(rawInput.visibility);
  const selectedMembershipIds = uniqueIds(rawInput.selectedMembershipIds)
    .filter((id) => id !== session.membership.id);
  const memberships = await listDropSpaceMemberships(session.space.id);
  const activeMemberIds = new Set(
    memberships.filter((member) => member.status === "active").map((member) => member.id),
  );
  if (selectedMembershipIds.some((id) => !activeMemberIds.has(id))) {
    throw serviceError(
      "A kiválasztott tagok között nem aktív vagy másik térhez tartozó tagság szerepel.",
      "DROP_SPACE_SELECTED_MEMBER_NOT_ACTIVE",
      403,
    );
  }
  if (visibility === "selected_members" && selectedMembershipIds.length === 0) {
    throw serviceError(
      "Kiválasztott tagokkal megosztott csomagnál legalább egy aktív tértagot jelöljön ki, vagy válassza a privát láthatóságot.",
      "DROP_SPACE_SELECTED_MEMBER_REQUIRED",
      400,
    );
  }

  const projectId = typeof rawInput.projectId === "string" ? rawInput.projectId.trim() : "";
  const project = projectId
    ? session.projects.find((item) => item.projectId === projectId)
    : null;
  if (projectId && !project) {
    throw serviceError("A kiválasztott projekt nincs ehhez a Drop térhez rendelve.", "DROP_SPACE_PROJECT_NOT_LINKED", 403);
  }

  const invitationMemberships = visibility === "private"
    ? []
    : memberships.filter((member) => {
        if (member.status !== "active" || member.id === session.membership.id) return false;
        return visibility === "space_members" || selectedMembershipIds.includes(member.id);
      });

  const normalized = parseDropCreatePackageInput({
    mode: rawInput.mode || "file",
    title: rawInput.title,
    description: rawInput.description,
    projectId: project?.projectId || "",
    projectName: project?.projectNameSnapshot || "",
    organizationId: session.membership.organizationName || session.space.organizationId || "",
    uploaderName: session.membership.displayName,
    uploaderEmail: session.membership.email,
    retentionDays,
    pin: rawInput.pin,
    recipients: invitationMemberships.map((member) => ({
      name: member.displayName,
      email: member.email,
      company: member.organizationName || undefined,
      role: "invitee" as const,
      receiveInvitation: true,
      receiveActivityNotifications: true,
      receiveFinalReport: true,
    })),
    groups: Array.isArray(rawInput.groups) ? rawInput.groups : [],
  });

  return createDropPackage({
    ...normalized,
    spaceContext: {
      spaceId: session.space.id,
      createdByMembershipId: session.membership.id,
      visibility,
      selectedMembershipIds: visibility === "selected_members" ? selectedMembershipIds : [],
    },
  }, {
    userId: `drop-space-membership:${session.membership.id}`,
    organizationId: session.space.organizationId || undefined,
    name: session.membership.displayName,
    email: session.membership.email,
  });
}

export function buildDropSpacePackageCreationState(input: {
  space: DropSpaceListItem;
  schemaReady: boolean;
  featureEnabled: boolean;
}) {
  return {
    ready: input.schemaReady && input.featureEnabled,
    schemaReady: input.schemaReady,
    featureEnabled: input.featureEnabled,
    fileUploadEnabled: true,
    note: input.schemaReady
      ? input.featureEnabled
        ? "A térbeli csomagkészítés aktív."
        : "A DROP 0.3.2 séma kész, de a csomagkészítési feature flag zárva van."
      : "A DROP 0.3.2 atomi tércsomag-migráció még nincs alkalmazva.",
  };
}
