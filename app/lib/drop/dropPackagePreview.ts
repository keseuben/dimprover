import type { DropCreatePackageInput } from "./dropTypes";

export type DropPackagePreview = {
  mode: DropCreatePackageInput["mode"];
  title: string;
  description: string;
  projectName: string | null;
  uploader: {
    name: string;
    email: string;
  };
  schedule: {
    retentionDays: number;
    opensAt: string;
    uploadClosesAt: string;
    expiresAt: string;
    graceExpiresAt: string;
  };
  counts: {
    recipients: number;
    invitationRecipients: number;
    finalReportRecipients: number;
    groups: number;
  };
  groups: Array<{
    name: string;
    code: string;
    sortOrder: number;
    sequenceStart: number;
  }>;
  limits: {
    maxFileCount: number;
    maxFileSizeBytes: number;
    maxTotalSizeBytes: number;
  };
  security: {
    accessPolicy: "token_pin";
    pinSource: "automatic" | "supplied";
    capabilityPurposes: readonly ["upload", "view", "download", "report"];
    rawCredentialsGeneratedOnlyOnCommit: true;
  };
  commit: {
    databaseRequired: true;
    filesPersisted: false;
    uploadEnabled: false;
  };
};

export function buildDropPackagePreview(
  input: DropCreatePackageInput,
  now = new Date(),
): DropPackagePreview {
  const expiresAt = new Date(now.getTime() + input.retentionDays * 86_400_000);
  const graceExpiresAt = new Date(expiresAt.getTime() + 72 * 3_600_000);

  return {
    mode: input.mode,
    title: input.title,
    description: input.description,
    projectName: input.projectName || null,
    uploader: {
      name: input.uploaderName,
      email: input.uploaderEmail,
    },
    schedule: {
      retentionDays: input.retentionDays,
      opensAt: now.toISOString(),
      uploadClosesAt: expiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      graceExpiresAt: graceExpiresAt.toISOString(),
    },
    counts: {
      recipients: input.recipients.length,
      invitationRecipients: input.recipients.filter((item) => item.receiveInvitation !== false).length,
      finalReportRecipients: input.recipients.filter((item) => item.receiveFinalReport !== false).length,
      groups: input.groups.length,
    },
    groups: input.groups.map((group, index) => ({
      name: group.name,
      code: group.code || `group-${index + 1}`,
      sortOrder: group.sortOrder ?? index,
      sequenceStart: group.sequenceStart ?? 1,
    })),
    limits: {
      maxFileCount: input.maxFileCount || 500,
      maxFileSizeBytes: input.maxFileSizeBytes || 262_144_000,
      maxTotalSizeBytes: input.maxTotalSizeBytes || 2_147_483_648,
    },
    security: {
      accessPolicy: "token_pin",
      pinSource: input.pin ? "supplied" : "automatic",
      capabilityPurposes: ["upload", "view", "download", "report"],
      rawCredentialsGeneratedOnlyOnCommit: true,
    },
    commit: {
      databaseRequired: true,
      filesPersisted: false,
      uploadEnabled: false,
    },
  };
}
