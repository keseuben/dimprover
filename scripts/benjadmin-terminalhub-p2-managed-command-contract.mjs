import fs from "node:fs";
import path from "node:path";
const root=process.cwd(); const read=(f)=>fs.readFileSync(path.join(root,f),"utf8"); const checks=[];
function check(name,ok){checks.push(Boolean(ok));console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)throw new Error(name);}
const panel=read("components/admin/developer-console/TerminalManagedCommands.tsx");
const hub=read("components/admin/developer-console/TerminalHubWorkspace.tsx");
const control=read("app/lib/dev-center/control-plane-commands.ts");
const route=read("app/api/dev/engine/control-plane/commands/route.ts");
check("Terminal Hub a meglévő Control Plane command API-t használja",panel.includes("/api/dev/engine/control-plane/commands"));
check("Csak fix managed action készlet létezik",["refresh_state","collect_metrics","run_build","run_tests","restart_service"].every((x)=>panel.includes(x)));
check("Célkörnyezet fixen DEV",panel.includes('targetEnvironment: "DEV"'));
check("Mutating managed action READY sessiont kér",panel.includes('item.status === "active"')&&panel.includes('item.handshake_stage === "READY"')&&panel.includes("action.mutating && !sessionId"));
check("Terminal Hub rawCommand false metaadatot küld",panel.includes("rawCommand: false"));
check("Control Plane nyers shell kulcsokat szerveroldalon tilt",["command","shell","script","argv","executable"].every((x)=>control.includes(`"${x}"`))&&control.includes("CONTROL_RAW_COMMAND_FORBIDDEN"));
check("DEV mutating operation server oldalon sessiont kér",control.includes("CONTROL_DEV_SESSION_REQUIRED")&&control.includes("assertDevEngineOperation"));
check("Control Plane API admin mutation subjectet kér",route.includes("getDevCenterMutationSubject(request.headers, false)"));
check("Terminal Hub nem implementál saját build/restart processzt",!panel.includes("child_process")&&!panel.includes("spawn(")&&!panel.includes("execFile("));
check("Managed panel a Terminal Hubban megjelenik",hub.includes("<TerminalManagedCommands sessions={live?.sessions || []}"));
console.log(`SUMMARY ${checks.filter(Boolean).length}/${checks.length} PASS`);
