import { randomUUID } from "node:crypto";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { NextResponse } from "next/server";
import {
  estimateMeetingAi,
  getMeetingAiConfig,
  getMeetingAiUsageSummary,
  MEETING_AI_ACTIONS,
  MEETING_AI_MODELS,
  runMeetingAi,
  type MeetingAiAction,
  type MeetingAiModelTier,
} from "@/app/lib/meeting-assistant/ai";
import { readMeetingWorkspace, sanitizeMeetingId, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

type AiRequest = {
  meetingId?: string;
  action?: MeetingAiAction;
  modelTier?: MeetingAiModelTier;
  context?: unknown;
  operation?: "estimate" | "run";
  confirmedMaxHuf?: number;
  confirmedPremium?: boolean;
  accessToken?: string;
};

function validAction(value: unknown): value is MeetingAiAction {
  return typeof value === "string" && value in MEETING_AI_ACTIONS;
}

function validModelTier(value: unknown): value is MeetingAiModelTier {
  return typeof value === "string" && value in MEETING_AI_MODELS;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAuthorized) {
    return NextResponse.json({ ok: false, error: "Az AI-funkciókat csak a szervező használhatja." }, { status: 403 });
  }
  const [usage, workspace] = await Promise.all([
    getMeetingAiUsageSummary(meetingId),
    readMeetingWorkspace(meetingId),
  ]);
  return NextResponse.json({
    ok: true,
    config: getMeetingAiConfig(),
    usage,
    sourceSummary: {
      transcriptLines: workspace.transcript.length,
      participants: workspace.attendees.length || workspace.participants.length,
      agendaItems: workspace.agenda.length,
      actionItems: workspace.actionItems.length,
      aiAttachments: workspace.attachments.filter((item) => item.includeInAi).length,
      aiResults: workspace.aiResults.length,
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AiRequest | null;
  if (!body || !validAction(body.action)) {
    return NextResponse.json({ ok: false, error: "Ismeretlen AI-művelet." }, { status: 400 });
  }
  const meetingId = sanitizeMeetingId(body.meetingId);
  const auth = await authorizeMeetingRequest(request, meetingId, body.accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAuthorized) {
    return NextResponse.json({ ok: false, error: "Az AI-funkciókat csak a szervező használhatja." }, { status: 403 });
  }
  const context = body.context ?? {};
  const modelTier = validModelTier(body.modelTier) ? body.modelTier : undefined;
  const estimate = estimateMeetingAi(body.action, context, modelTier);

  if (body.operation !== "run") {
    return NextResponse.json({ ok: true, estimate });
  }

  try {
    const currentWorkspace = await readMeetingWorkspace(meetingId);
    const userId = auth.mode === "token"
      ? String(auth.payload?.issuedTo || "meeting-token-user")
      : "authenticated-session-user";
    const result = await runMeetingAi({
      meetingId,
      projectId: currentWorkspace.projectId,
      userId,
      action: body.action,
      modelTier,
      context,
      confirmedMaxHuf: Number(body.confirmedMaxHuf ?? 0),
      confirmedPremium: Boolean(body.confirmedPremium),
    });

    const definition = MEETING_AI_ACTIONS[body.action];
    const aiResult = {
      id: `ai-result-${randomUUID()}`,
      action: body.action,
      label: definition.label,
      text: result.text,
      provider: result.provider,
      modelTier: result.modelTier,
      model: result.model,
      estimatedInputTokens: result.estimate.inputTokens,
      estimatedOutputTokens: result.estimate.outputTokens,
      actualInputTokens: result.usage.inputTokens,
      actualOutputTokens: result.usage.outputTokens,
      estimatedCostHuf: result.estimate.estimatedCostHuf,
      approvedMaxCostHuf: Number(body.confirmedMaxHuf ?? 0),
      actualCostHuf: result.actualCostHuf,
      durationMs: result.durationMs,
      status: "success" as const,
      createdAt: new Date().toISOString(),
    };

    const workspace = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      aiResults: [...current.aiResults, aiResult].slice(-200),
      auditLog: [...current.auditLog, {
        id: `audit-${randomUUID()}`,
        type: "ai_run_completed",
        at: new Date().toISOString(),
        actorName: current.organizerName || "Szervező",
        actorRole: "organizer" as const,
        message: `${definition.label} elkészült. Modell: ${result.modelDisplayName}; tényleges költség: ${result.actualCostHuf.toFixed(2)} Ft.`,
        operation: `ai:${body.action}`,
      }].slice(-1000),
    }));
    const usage = await getMeetingAiUsageSummary(meetingId);

    return NextResponse.json({ ok: true, result, aiResult, workspace, usage });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Az AI-futtatás sikertelen.", estimate },
      { status: 400 },
    );
  }
}