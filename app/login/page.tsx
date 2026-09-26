import { headers } from "next/headers";
import { DimproAppOtpLogin } from "./DimproAppOtpLogin";
import { DimproverOtpLogin } from "./DimproverOtpLogin";
import { ProjectGateCodeLogin } from "./ProjectGateCodeLogin";

function isProjectGateDevDomain(host: string) {
  const normalizedHost = host.toLowerCase().split(":")[0];
  return normalizedHost === "projektkapu.dev.dimpro.hu"
    && process.env.PROJECTKAPU_DEV_CODE_AUTH_ENABLED?.trim().toLowerCase() === "true";
}

function isDriveDevDomain(host: string) {
  const normalizedHost = host.toLowerCase().split(":")[0];
  const enabled = process.env.DRIVE_DEV_PASSWORD_AUTH_ENABLED?.trim().toLowerCase() === "true";
  return normalizedHost === "drive.dev.dimpro.hu" && enabled;
}

function isDimproDomain(host: string) {
  const normalizedHost = host.toLowerCase().split(":")[0];
  return (
    normalizedHost === "app.dimpro.hu" ||
    normalizedHost === "dimpro.hu" ||
    normalizedHost === "www.dimpro.hu" ||
    normalizedHost.endsWith(".dimpro.hu")
  );
}

export default async function LoginPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  if (isProjectGateDevDomain(host)) {
    return <ProjectGateCodeLogin />;
  }

  if (isDriveDevDomain(host)) {
    return <ProjectGateCodeLogin mode="drive" />;
  }

  if (isDimproDomain(host)) {
    return <DimproAppOtpLogin />;
  }

  return <DimproverOtpLogin />;
}
