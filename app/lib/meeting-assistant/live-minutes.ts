import type { MeetingAgendaItem, MeetingTopicBlock, MeetingWorkspace } from "./types";

function clean(value: string | null | undefined) {
  return String(value || "").trim();
}

function nonEmpty(value: string | null | undefined) {
  return clean(value).length > 0;
}

function formatDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderTopicBlock(topic: MeetingTopicBlock, includePrivate: boolean) {
  const lines: string[] = [];
  lines.push(`### ${topic.order}. ${topic.title}`);
  if (nonEmpty(topic.background)) lines.push(`Előzmény / problémafelvetés: ${clean(topic.background)}`);
  if (nonEmpty(topic.discussion)) lines.push(`Egyeztetés tartalma: ${clean(topic.discussion)}`);
  if (nonEmpty(topic.decision)) lines.push(`Döntés / eredmény: ${clean(topic.decision)}`);
  if (nonEmpty(topic.openQuestions)) lines.push(`Nyitott kérdések: ${clean(topic.openQuestions)}`);
  if (nonEmpty(topic.clientOpinion)) lines.push(`Megrendelői vélemény / jóváhagyás: ${clean(topic.clientOpinion)}`);
  if (nonEmpty(topic.designerOpinion)) lines.push(`Tervezői álláspont: ${clean(topic.designerOpinion)}`);
  if (nonEmpty(topic.contractorOpinion)) lines.push(`Kivitelezői álláspont: ${clean(topic.contractorOpinion)}`);
  if (nonEmpty(topic.owner)) lines.push(`Felelős: ${clean(topic.owner)}`);
  if (nonEmpty(topic.dueDate)) lines.push(`Határidő: ${clean(topic.dueDate)}`);
  if (includePrivate && nonEmpty(topic.privateNotes)) lines.push(`Privát szervezői megjegyzés: ${clean(topic.privateNotes)}`);
  return lines.join("\n\n");
}

function renderAgendaItem(item: MeetingAgendaItem, includePrivate: boolean) {
  const lines: string[] = [];
  lines.push(`## ${item.order}. ${item.title}`);
  if (nonEmpty(item.description)) lines.push(clean(item.description));
  if (nonEmpty(item.discussionNotes)) lines.push(`Egyeztetés tartalma: ${clean(item.discussionNotes)}`);
  if (nonEmpty(item.decisionSummary)) lines.push(`Döntés / eredmény: ${clean(item.decisionSummary)}`);
  if (nonEmpty(item.openQuestions)) lines.push(`Nyitott kérdések: ${clean(item.openQuestions)}`);
  if (includePrivate && nonEmpty(item.privateNotes)) lines.push(`Privát szervezői megjegyzés: ${clean(item.privateNotes)}`);
  if (item.topicBlocks.length > 0) {
    const topics = item.topicBlocks
      .filter((topic) => includePrivate || topic.shared)
      .sort((a, b) => a.order - b.order)
      .map((topic) => renderTopicBlock(topic, includePrivate))
      .filter(Boolean)
      .join("\n\n");
    if (topics) lines.push(`### Témakörök\n\n${topics}`);
  }
  return lines.join("\n\n");
}

export function renderLiveMinutesText(workspace: MeetingWorkspace, includePrivate = false) {
  const lines: string[] = [];
  const meetingNumber = workspace.minuteNumber || "Még nincs sorszámozva";
  lines.push(`# ${workspace.documentLabel || "Egyeztetési emlékeztető"}`);
  lines.push(`**Azonosító:** ${meetingNumber}`);
  lines.push(`**Projekt:** ${workspace.projectCode ? `${workspace.projectCode} · ` : ""}${workspace.projectName}`);
  lines.push(`**Értekezlet típusa:** ${workspace.meetingType} (${workspace.meetingTypeCode})`);
  if (workspace.meetingLocation) lines.push(`**Helyszín:** ${workspace.meetingLocation}`);
  if (workspace.scheduledStart) lines.push(`**Időpont:** ${formatDateTime(workspace.scheduledStart)}`);
  if (workspace.chairpersonName) lines.push(`**Értekezletvezető:** ${workspace.chairpersonName}`);
  if (workspace.minuteTakerName) lines.push(`**Jegyzőkönyvvezető:** ${workspace.minuteTakerName}`);
  if (workspace.approverName) lines.push(`**Jóváhagyó:** ${workspace.approverName}`);

  const attendees = workspace.attendees.filter((item) => item.status !== "invited_absent");
  if (attendees.length > 0) {
    lines.push("## Jelenlévők");
    lines.push(attendees.map((item) => {
      const meta = [item.organization, item.functionTitle].filter(Boolean).join(" · ");
      return `- ${item.name}${meta ? ` – ${meta}` : ""}`;
    }).join("\n"));
  }

  const agenda = workspace.agenda
    .filter((item) => includePrivate || item.shared)
    .sort((a, b) => a.order - b.order)
    .map((item) => renderAgendaItem(item, includePrivate))
    .filter(Boolean);
  if (agenda.length > 0) lines.push(agenda.join("\n\n"));

  const sharedEntries = workspace.sharedMessages.filter((item) => item.status === "shared" && (item.includeInDocument ?? true));
  if (sharedEntries.length > 0) {
    lines.push("## Szöveges bejegyzések");
    lines.push(sharedEntries.map((item) => {
      const agenda = workspace.agenda.find((agendaItem) => agendaItem.id === item.agendaItemId);
      const meta = [item.submittedBy, item.submittedAt ? formatDateTime(item.submittedAt) : "", agenda ? `Napirend: ${agenda.order}. ${agenda.title}` : ""].filter(Boolean).join(" · ");
      return `- **${meta || "Bejegyzés"}:** ${clean(item.text)}`;
    }).join("\n"));
  }

  const sharedAttachments = workspace.attachments.filter((item) => item.status === "shared");
  if (sharedAttachments.length > 0) {
    lines.push("## Képek és mellékletek");
    lines.push(sharedAttachments.map((item) => {
      const agenda = workspace.agenda.find((agendaItem) => agendaItem.id === item.agendaItemId);
      const title = item.title || item.originalName;
      const caption = item.description || item.caption;
      const meta = [agenda ? `Napirend: ${agenda.order}. ${agenda.title}` : "Általános melléklet", item.uploadedBy ? `Feltöltötte: ${item.uploadedBy}` : ""].filter(Boolean).join(" · ");
      return `- **${clean(title)}**${caption ? ` – ${clean(caption)}` : ""}${meta ? ` (${meta})` : ""}`;
    }).join("\n"));
  }

  const actions = workspace.actionItems.filter((item) => includePrivate || item.shared);
  if (actions.length > 0) {
    lines.push("## Döntések, feladatok és nyitott kérdések");
    lines.push(actions.map((item) => {
      const type = item.type === "decision" ? "Döntés" : item.type === "question" ? "Kérdés" : item.type === "deadline" ? "Határidő" : "Feladat";
      const meta = [item.owner ? `Felelős: ${item.owner}` : "", item.dueDate ? `Határidő: ${item.dueDate}` : ""].filter(Boolean).join(" · ");
      return `- **${type}:** ${item.title}${meta ? ` (${meta})` : ""}`;
    }).join("\n"));
  }

  if (workspace.nextMeeting.status !== "not_defined" && workspace.nextMeeting.startsAt) {
    lines.push("## Következő egyeztetés");
    lines.push(`Várható időpont: ${formatDateTime(workspace.nextMeeting.startsAt)}${workspace.nextMeeting.location ? ` · ${workspace.nextMeeting.location}` : ""}`);
    if (workspace.nextMeeting.note) lines.push(workspace.nextMeeting.note);
  }

  const activeSummary = workspace.publishedSummaries.find((item) => item.id === workspace.activePublishedSummaryId && !item.revokedAt);
  if (activeSummary) {
    lines.push("## Közzétett lezáró tájékoztatás");
    lines.push(activeSummary.closingMessage);
    if (activeSummary.emailNotice) lines.push(activeSummary.emailNotice);
  }

  return lines.filter(Boolean).join("\n\n");
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();
}
