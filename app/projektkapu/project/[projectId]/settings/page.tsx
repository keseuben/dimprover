import ProjectGateShell from "@/components/project-gate/ProjectGateShell";

type SettingsPageProps = { params: Promise<{ projectId: string }> };

export default async function ProjectGateSettingsPage({ params }: SettingsPageProps) {
  const { projectId } = await params;
  return <ProjectGateShell projectId={projectId} activeModuleId="dock" />;
}
