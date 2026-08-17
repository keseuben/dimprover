import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { createWorkerActivityConsoleMessage, type ConsoleMessageKind } from "@/app/lib/dev-center/developer-console";
import { isSensitivePath, scanSensitiveText } from "@/app/lib/dev-center/ai-worker/secret-scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const workerCodes = new Set(["BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI", "MFORGE", "VGUARD"]);
const phases = new Set(["analysis", "coding", "file-change", "diff", "test", "build", "commit", "release", "terminal", "note", "error"]);
const kinds = new Set<ConsoleMessageKind>(["CODE_ACTIVITY", "FILE_CHANGE", "DIFF", "TERMINAL_ACTIVITY", "TEST_RESULT", "BUILD_EVENT", "COMMIT", "RELEASE", "MESSAGE", "ERROR", "WARNING"]);

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function clean(value: unknown, max: number) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function sanitize(value: unknown, max: number) {
  const raw = clean(value, max);
  const findings = raw ? scanSensitiveText(raw) : [];
  return {
    value: findings.length ? `[ÉRZÉKENY ADAT MASZKOLVA – ${findings.join(", ")}]` : raw,
    findings,
  };
}

function kindForPhase(phase: string): ConsoleMessageKind {
  if (phase === "coding" || phase === "analysis") return "CODE_ACTIVITY";
  if (phase === "file-change") return "FILE_CHANGE";
  if (phase === "diff") return "DIFF";
  if (phase === "terminal") return "TERMINAL_ACTIVITY";
  if (phase === "test") return "TEST_RESULT";
  if (phase === "build") return "BUILD_EVENT";
  if (phase === "commit") return "COMMIT";
  if (phase === "release") return "RELEASE";
  if (phase === "error") return "ERROR";
  return "MESSAGE";
}


const stageLabels = ["", "ELEMZÉS / ELŐKÉSZÍTÉS", "FEJLESZTÉS", "TESZTELÉS", "ELLENŐRZÉS / JAVÍTÁS", "BUILD / KIADÁS", "LEZÁRÁS / ÁTADÁS"] as const;
function stageForPhase(phase: string, requested: unknown) {
  const numeric = Number(requested);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 6) return Math.round(numeric);
  if (phase === "analysis" || phase === "note") return 1;
  if (["coding", "file-change", "diff", "terminal"].includes(phase)) return 2;
  if (phase === "test") return 3;
  if (phase === "error") return 4;
  if (["build", "commit"].includes(phase)) return 5;
  if (phase === "release") return 6;
  return 1;
}

export async function POST(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers))) return json({ ok: false, error: "Nincs jogosultság worker activity rögzítéséhez." }, 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    const workerCode = clean(body.workerCode, 40).toUpperCase();
    const phase = clean(body.phase, 80).toLowerCase() || "note";
    const requestedKind = clean(body.kind, 80).toUpperCase() as ConsoleMessageKind;
    if (!workerCodes.has(workerCode)) return json({ ok: false, error: "Ismeretlen worker kód." }, 400);
    if (!phases.has(phase)) return json({ ok: false, error: "Ismeretlen worker activity fázis." }, 400);
    const kind = kinds.has(requestedKind) ? requestedKind : kindForPhase(phase);
    const summary = sanitize(body.summary, 4000);
    const detail = sanitize(body.detail, 8000);
    if (!summary.value) return json({ ok: false, error: "A worker activity összefoglaló nem lehet üres." }, 400);

    const filePathRaw = clean(body.filePath, 600);
    const filePathSensitive = filePathRaw ? isSensitivePath(filePathRaw) : false;
    const command = sanitize(body.command, 1600);
    const diffSummary = sanitize(body.diffSummary, 4000);
    const findings = [...new Set([...summary.findings, ...detail.findings, ...command.findings, ...diffSummary.findings, ...(filePathSensitive ? ["Sensitive path"] : [])])];
    const progressRaw = Number(body.progressPercent);
    const progressPercent = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : null;
    const workStageIndex = stageForPhase(phase, body.workStageIndex);
    const mainModule = sanitize(body.mainModule, 180);
    const moduleName = sanitize(body.moduleName, 180);
    const submoduleName = sanitize(body.submoduleName, 220);
    const workItem = sanitize(body.workItem, 500);
    const activityAction = sanitize(body.activityAction, 700);
    const activityNarrative = sanitize(body.activityNarrative, 3000);
    const uniqueFindings = [...new Set([...findings, ...mainModule.findings, ...moduleName.findings, ...submoduleName.findings, ...workItem.findings, ...activityAction.findings, ...activityNarrative.findings])];
    const message = await createWorkerActivityConsoleMessage({
      workerCode,
      taskId: clean(body.taskId, 180) || null,
      projectId: clean(body.projectId, 180) || null,
      phase,
      kind,
      summary: summary.value,
      detail: detail.value,
      level: kind === "ERROR" ? "error" : kind === "WARNING" ? "warning" : kind === "TEST_RESULT" || kind === "COMMIT" || kind === "RELEASE" ? "success" : "info",
      progressPercent,
      metadata: {
        sessionId: clean(body.sessionId, 180) || null,
        filePath: filePathSensitive ? "[ÉRZÉKENY ÚTVONAL MASZKOLVA]" : filePathRaw || null,
        command: command.value || null,
        diffSummary: diffSummary.value || null,
        status: clean(body.status, 120) || null,
        mainModule: mainModule.value || null,
        moduleName: moduleName.value || null,
        submoduleName: submoduleName.value || null,
        workItem: workItem.value || null,
        activityAction: activityAction.value || null,
        activityNarrative: activityNarrative.value || null,
        workStageIndex,
        workStageLabel: stageLabels[workStageIndex],
        activityPhase: phase,
        sanitized: uniqueFindings.length > 0,
        sensitiveFindings: uniqueFindings,
      },
    });
    return json({ ok: true, message, sanitized: uniqueFindings.length > 0, sensitiveFindings: uniqueFindings }, 201);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "A worker activity nem rögzíthető." }, 400);
  }
}
