import "server-only";
import { cookies } from "next/headers";
import {
  parseDriveFolderUnlockToken,
  type DriveFolderUnlockGrant,
} from "./folderPasswordCrypto";

export const DRIVE_FOLDER_UNLOCK_COOKIE = "dimpro_drive_folder_unlocks_v1";

export const DRIVE_FOLDER_UNLOCK_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/projects",
  maxAge: 24 * 60 * 60,
};

export async function getCurrentDriveFolderUnlockGrants(projectId: string): Promise<Map<string, DriveFolderUnlockGrant>> {
  try {
    const store = await cookies();
    const grants = parseDriveFolderUnlockToken(store.get(DRIVE_FOLDER_UNLOCK_COOKIE)?.value);
    return new Map(
      grants
        .filter((grant) => grant.projectId === projectId)
        .map((grant) => [grant.folderId, grant] as const),
    );
  } catch {
    return new Map();
  }
}
