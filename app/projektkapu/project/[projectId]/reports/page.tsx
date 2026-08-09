import ProjectGateShell from "@/components/project-gate/ProjectGateShell";

type ReportsPageProps = { params: Promise<{ projectId: string }> };

export default async function ProjectGateReportsPage({ params }: ReportsPageProps) {
  const { projectId } = await params;
  return <ProjectGateShell projectId={projectId} activeModuleId="dock" />;
}
