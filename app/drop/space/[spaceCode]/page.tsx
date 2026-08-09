import DropSpaceGuestWorkspace from "@/components/drop/DropSpaceGuestWorkspace";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ spaceCode: string }>;
};

export default async function DropSpaceWorkspacePage({ params }: PageProps) {
  const { spaceCode } = await params;
  return <DropSpaceGuestWorkspace spaceCode={spaceCode} />;
}
