import { createHash } from "node:crypto";
import type { MeetingTranscriptLine, MeetingWorkspace } from "./types";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

export type GraphTranscriptConfig = {
  configured: boolean;
  tenantIdConfigured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
};

type GraphTranscriptMetadata = {
  id?: string;
  createdDateTime?: string;
  endDateTime?: string;
};

type GraphListResponse = {
  value?: GraphTranscriptMetadata[];
  error?: {
    code?: string;
    message?: string;
    innerError?: { code?: string };
  };
};

export class GraphTranscriptError extends Error {
  code: string;

  constructor(message: string, code = "GraphTranscriptError") {
    super(message);
    this.name = "GraphTranscriptError";
    this.code = code;
  }
}

export function getGraphTranscriptConfig(): GraphTranscriptConfig {
  const tenantIdConfigured = Boolean(process.env.MICROSOFT_GRAPH_TENANT_ID?.trim());
  const clientIdConfigured = Boolean(process.env.MICROSOFT_GRAPH_CLIENT_ID?.trim());
  const clientSecretConfigured = Boolean(process.env.MICROSOFT_GRAPH_CLIENT_SECRET?.trim());
  return {
    configured: tenantIdConfigured && clientIdConfigured && clientSecretConfigured,
    tenantIdConfigured,
    clientIdConfigured,
    clientSecretConfigured,
  };
}

export async function getGraphApplicationToken() {
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID?.trim();
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw new GraphTranscriptError(
      "A Microsoft Graph kapcsolat még nincs konfigurálva a szerveren.",
      "GraphNotConfigured",
    );
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    },
  );
  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !data?.access_token) {
    throw new GraphTranscriptError(
      data?.error_description || data?.error || "A Microsoft Graph alkalmazástoken nem kérhető le.",
      data?.error || "GraphTokenError",
    );
  }
  return data.access_token;
}

function graphErrorCode(data: GraphListResponse | null) {
  return data?.error?.innerError?.code || data?.error?.code || "GraphRequestError";
}

function graphErrorMessage(data: GraphListResponse | null, fallback: string) {
  return data?.error?.message || fallback;
}

function cleanTranscriptText(value: string) {
  return value
    .replace(/<v\s+[^>]+>/gi, "")
    .replace(/<\/v>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .trim();
}

function parseTranscriptContent(content: string, transcriptId: string, attributed: boolean): MeetingTranscriptLine[] {
  const blocks = content.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n{2,}/);
  const lines: MeetingTranscriptLine[] = [];

  blocks.forEach((block, blockIndex) => {
    const rows = block.split("\n").map((row) => row.trim()).filter(Boolean);
    const timeIndex = rows.findIndex((row) => row.includes("-->"));
    if (timeIndex < 0) return;
    const [start] = rows[timeIndex].split("-->").map((row) => row.trim());
    const rawText = rows.slice(timeIndex + 1).join(" ").trim();
    if (!rawText) return;
    const speakerMatch = rawText.match(/<v\s+([^>]+)>/i);
    const speaker = attributed && speakerMatch?.[1]?.trim() ? speakerMatch[1].trim() : "Teams átirat";
    const text = cleanTranscriptText(rawText);
    if (!text) return;
    const idHash = createHash("sha1").update(`${transcriptId}:${blockIndex}:${start}:${speaker}:${text}`).digest("hex").slice(0, 24);
    lines.push({
      id: `teams-${idHash}`,
      at: start.replace(/\.\d+$/, "").slice(0, 12),
      speaker: speaker.slice(0, 120),
      text: text.slice(0, 6000),
      shared: false,
      source: "graph",
    });
  });

  return lines;
}

async function getTranscriptContent(
  token: string,
  organizerUserId: string,
  onlineMeetingId: string,
  transcriptId: string,
) {
  const baseUrl = `${GRAPH_ROOT}/users/${encodeURIComponent(organizerUserId)}/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content`;
  let response = await fetch(baseUrl, {
    headers: { authorization: `Bearer ${token}`, accept: "text/vtt" },
    cache: "no-store",
  });
  let attributed = true;

  if (response.status === 403) {
    const errorData = (await response.clone().json().catch(() => null)) as GraphListResponse | null;
    if (graphErrorCode(errorData) === "SpeakerAttributionNotAllowed") {
      response = await fetch(baseUrl, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.microsoft.graph.transcript+text",
        },
        cache: "no-store",
      });
      attributed = false;
    }
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as GraphListResponse | null;
    throw new GraphTranscriptError(
      graphErrorMessage(data, `A Teams átirat tartalma nem kérhető le (${response.status}).`),
      graphErrorCode(data),
    );
  }
  return { content: await response.text(), attributed };
}

export async function fetchTeamsTranscript(workspace: MeetingWorkspace) {
  const organizerUserId = workspace.teamsTranscript.organizerUserId.trim();
  const onlineMeetingId = workspace.teamsTranscript.graphOnlineMeetingId.trim();
  if (!organizerUserId || !onlineMeetingId) {
    throw new GraphTranscriptError(
      "Add meg a Microsoft Entra szervezői felhasználóazonosítót és a Graph onlineMeeting azonosítót.",
      "MeetingGraphIdsMissing",
    );
  }

  const token = await getGraphApplicationToken();
  const listUrl = `${GRAPH_ROOT}/users/${encodeURIComponent(organizerUserId)}/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/transcripts`;
  const response = await fetch(listUrl, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as GraphListResponse | null;
  if (!response.ok) {
    throw new GraphTranscriptError(
      graphErrorMessage(data, `A Teams átiratok listája nem kérhető le (${response.status}).`),
      graphErrorCode(data),
    );
  }

  const transcripts = (data?.value || []).filter((item): item is GraphTranscriptMetadata & { id: string } => Boolean(item.id));
  if (transcripts.length === 0) {
    return { transcriptIds: [] as string[], lines: [] as MeetingTranscriptLine[], speakerAttribution: true };
  }

  const allLines: MeetingTranscriptLine[] = [];
  let speakerAttribution = true;
  for (const transcript of transcripts) {
    const result = await getTranscriptContent(token, organizerUserId, onlineMeetingId, transcript.id);
    speakerAttribution = speakerAttribution && result.attributed;
    allLines.push(...parseTranscriptContent(result.content, transcript.id, result.attributed));
  }

  return {
    transcriptIds: transcripts.map((item) => item.id),
    lines: allLines,
    speakerAttribution,
  };
}
