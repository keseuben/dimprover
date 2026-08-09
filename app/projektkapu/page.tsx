import ProjectGateShell from "@/components/project-gate/ProjectGateShell";
import { DEFAULT_PROJECT_ID } from "@/app/lib/project-gate/d6Modules";

export default function ProjektkapuPage() {
  return <ProjectGateShell projectId={DEFAULT_PROJECT_ID} activeModuleId="dock" />;
}
