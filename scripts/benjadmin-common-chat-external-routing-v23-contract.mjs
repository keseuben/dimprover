#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let passed = 0;
let failed = 0;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
function check(name, ok) {
  const n = String(passed + failed + 1).padStart(2, "0");
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${n} ${name}`);
    process.exitCode = 1;
  } else {
    passed += 1;
    console.log(`PASS ${n} ${name}`);
  }
}

const types = read("components/admin/developer-console/types.ts");
const composer = read("components/admin/developer-console/DeveloperComposer.tsx");
const route = read("app/api/dev/console/messages/route.ts");
const backend = read("app/lib/dev-center/developer-console.ts");
const dispatch = read("app/lib/dev-center/benai-dispatch.ts");
const bridge = read("app/lib/dev-center/manual-bridge.ts");
const live = read("components/admin/developer-console/LiveWorkPanel.tsx");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");

check("client targets include external workers", types.includes('"MFORGE"') && types.includes('"VGUARD"'));
check("server targets include external workers", backend.includes('"MFORGE"') && backend.includes('"VGUARD"'));
check("composer has grouped recipients", composer.includes("internalTargets") && composer.includes("externalTargets") && composer.includes("targetGroups"));
check("composer exposes MFORGE", composer.includes('value: "MFORGE"') && composer.includes('label: "M.Forge-AI"'));
check("composer exposes VGUARD", composer.includes('value: "VGUARD"') && composer.includes('label: "V.Guard-AI"'));
check("VGUARD task toggle is disabled", composer.includes('const reviewOnly = target === "VGUARD"') && composer.includes("disabled={reviewOnly}"));
check("MFORGE uses external task workflow", route.includes("createExternalAiWorkerTask") && route.includes('target === "MFORGE"') && route.includes('launchMode: "WORKER"'));
check("VGUARD coding task fails closed", route.includes("DEV_CONSOLE_VGUARD_REVIEW_ONLY") && route.includes('target === "VGUARD"'));
check("external chat-only routing exists", route.includes('target === "MFORGE"') && route.includes('target === "VGUARD"') && route.includes("task nem"));
check("dispatch map knows external workers", dispatch.includes('MFORGE: { id: "worker_mforge"') && dispatch.includes('VGUARD: { id: "worker_vguard"'));
check("handoff states BenjAdmin authority", bridge.includes("BenjAdmin a") && bridge.includes("rendszertulajdonos"));
check("handoff requires pickup marker", bridge.includes("MUNKAFELV") && bridge.includes("Europe/Budapest"));
check("handoff requires handback marker", bridge.includes("MUNKA VISSZAAD") && bridge.includes("Ne maradjon csendben"));
check("pickup uses Plus first-pull timestamp", live.includes('metadataText(task, "plusBridgeFirstPulledAt")'));
check("manual bridge does not use operator start as pickup", live.includes('metadataText(task, "bridgeMode") === "MANUAL_CHATGPT_BRIDGE") return null') && !live.includes('|| metadataText(task, "operatorStartedAt")'));
check("worker card has time ledger", live.includes("workerTimeLedger") && live.includes("pickedUpAt") && live.includes("returnedAt"));
check("task card has time ledger", live.includes('data-testid="benjadmin-work-time-ledger"') && live.includes("workStart") && live.includes("workEnd"));
check("recent returned work remains visible", live.includes("isRecentReturn") && live.includes("36 * 60 * 60 * 1000"));
check("external target styling exists", css.includes(".externalTargetGroup") && css.includes('button[data-external-worker]'));
check("time ledger styling exists", css.includes(".workerTimeLedger") && css.includes(".aiWorkTimeLedger"));

console.log(JSON.stringify({ ok: failed === 0, passed, failed }, null, 2));
if (failed) process.exit(1);
