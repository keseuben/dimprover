import { headers } from "next/headers";
import GazdaSegedClient from "@/components/gazdaseged/GazdaSegedClient";
import GazdaSegedMarketing from "@/components/gazdaseged/GazdaSegedMarketing";

export default async function GazdaSegedPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const headersList = await headers();
  const params = await searchParams;
  const host = (headersList.get("host") ?? "").toLowerCase().split(":")[0];
  const isPublicMarketingHost = host === "dimpro.hu" || host === "www.dimpro.hu";
  const hasDirectModuleView = Boolean(params?.view);

  if (isPublicMarketingHost && !hasDirectModuleView) {
    return <GazdaSegedMarketing />;
  }

  return <GazdaSegedClient />;
}
