import { notFound } from "next/navigation";
import ProjectGateShell from "@/components/project-gate/ProjectGateShell";
import { D6_MODULES, type D6ModuleId } from "@/app/lib/project-gate/d6Modules";

type ProjectModulePageProps = {
  params: Promise<{ projectId: string; module: string }>;
};

export default async function ProjectGateModulePage({ params }: ProjectModulePageProps) {
  const { projectId, module } = await params;
  const knownModule = D6_MODULES.find((item) => item.id === module);
  if (!knownModule) notFound();
  return <ProjectGateShell projectId={projectId} activeModuleId={knownModule.id as D6ModuleId} />;
}
