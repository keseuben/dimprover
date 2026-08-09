import DropSpaceInvitationClient from "@/components/drop/DropSpaceInvitationClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function DropSpaceInvitationPage({ params }: PageProps) {
  const { token } = await params;
  return <DropSpaceInvitationClient token={token} />;
}
