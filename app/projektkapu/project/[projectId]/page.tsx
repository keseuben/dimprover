import ProjectGateShell from "@/components/project-gate/ProjectGateShell";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectGateProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  return <ProjectGateShell projectId={projectId} activeModuleId="dock" />;
}
