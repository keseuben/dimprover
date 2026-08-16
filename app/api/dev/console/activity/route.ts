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
        sanitized: findings.length > 0,
        sensitiveFindings: findings,
      },
    });
    return json({ ok: true, message, sanitized: findings.length > 0, sensitiveFindings: findings }, 201);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "A worker activity nem rögzíthető." }, 400);
  }
}
