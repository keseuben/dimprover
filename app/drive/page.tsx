import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  isDriveDevAccessConfigured,
  PROJECT_GATE_DEV_ACCESS_COOKIE,
  verifyProjectGateDevAccessToken,
} from "@/app/lib/project-gate/devAccess";
import DriveShell from "@/components/drive/DriveShell";

export default async function DrivePage() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";

  if (isDriveDevAccessConfigured(host)) {
    const cookieStore = await cookies();
    const token = cookieStore.get(PROJECT_GATE_DEV_ACCESS_COOKIE)?.value;
    if (!verifyProjectGateDevAccessToken(token)) redirect("/login");
  }

  return (
    <DriveShell
      pilotMode={process.env.DRIVE_PILOT_MODE_ENABLED?.trim().toLowerCase() === "true"}
      pilotProjectName={process.env.DRIVE_PILOT_PROJECT_NAME?.trim() || ""}
    />
  );
}
