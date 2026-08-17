import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyFieldCaptureRedirect() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "").split(",")[0].trim().toLowerCase();
  const target = host.includes("dev.dimpro.hu") || host.includes("localhost")
    ? "https://drop.dev.dimpro.hu/terep"
    : "https://drop.dimpro.hu/terep";
  redirect(target);
}
