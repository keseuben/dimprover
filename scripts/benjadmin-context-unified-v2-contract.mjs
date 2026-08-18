#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
let passed=0, failed=0;
function check(name,ok){if(ok){passed++;console.log("PASS "+String(passed).padStart(2,"0")+" "+name);}else{failed++;console.error("FAIL "+name);}}
const helper=read("app/lib/dev-center/development-context.ts");
const core=read("app/lib/dev-center/developer-console.ts");
const live=read("app/lib/dev-center/terminal-hub/live-workspace-activity.ts");
const panel=read("components/admin/developer-console/LiveWorkPanel.tsx");
const message=read("components/admin/developer-console/DeveloperMessage.tsx");
const workspace=read("components/admin/developer-console/LiveWorkspaceReadOnly.tsx");
const drawer=read("components/admin/developer-console/WorkerActivityDrawer.tsx");
check("Shared resolver owns project identity",helper.includes("projectId: string")&&helper.includes("projectName: string")&&helper.includes("resolveTaskDevelopmentContext"));
check("Developer console imports shared resolver",core.includes("resolveTaskDevelopmentContext")&&core.includes("DEVELOPMENT_STAGE_LABELS"));
check("Developer console duplicate hierarchy resolver removed",!core.includes("function inferHierarchy")&&!core.includes("const WORK_STAGE_LABELS"));
check("Task context sync persists project identity",core.includes("projectId: text(input.metadata.projectId) || hierarchy.projectId")&&core.includes("projectName: text(input.metadata.projectName) || hierarchy.projectName"));
check("Worker Inbox shows project chain",panel.includes("context.mainModule")&&panel.includes("context.projectName")&&panel.includes("context.submoduleName"));
check("Common chat exposes project field",message.includes("<small>PROJEKT</small>")&&message.includes("projectName"));
check("Live Workspace uses shared resolver",live.includes("resolveTaskDevelopmentContext")&&live.includes("projectName: development?.projectName"));
check("Live Workspace UI shows project chain",workspace.includes("worker.projectName || worker.projectId"));
check("Worker drawer uses shared resolver",drawer.includes("resolveTaskDevelopmentContext")&&drawer.includes("activeContext.projectName"));
check("Six-stage model remains shared",helper.includes("DEVELOPMENT_STAGE_LABELS")&&panel.includes("6/{context.workStageIndex}")&&workspace.includes("6/{worker.workStageIndex}")&&drawer.includes("6/{activeContext.workStageIndex}"));
console.log(JSON.stringify({ok:failed===0,passed,failed,contract:"BENJADMIN Context Unified V2"},null,2));
if(failed)process.exit(1);
