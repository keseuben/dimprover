import DropValidatedAccessPage from "@/components/drop/DropValidatedAccessPage";

export const dynamic = "force-dynamic";

export default async function DropReportTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DropValidatedAccessPage rawToken={token} purpose="report" />;
}
