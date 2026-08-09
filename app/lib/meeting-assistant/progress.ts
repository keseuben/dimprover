import type { MeetingWorkspace } from "./types";

export type MeetingProgressStatus = "not_started" | "in_progress" | "complete" | "warning";

export type MeetingProgressStep = {
  id: string;
  sectionId: string;
  label: string;
  shortLabel: string;
  weight: number;
  percent: number;
  status: MeetingProgressStatus;
  issues: string[];
};

export type MeetingProgressResult = {
  percent: number;
  label: string;
  status: MeetingProgressStatus;
  steps: MeetingProgressStep[];
  issues: string[];
};

function ratio(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}


function meaningfulText(value: string | null | undefined) {
  return String(value || "")
    .replace(/Az egyeztetés során az alábbiak kerültek megtárgyalásra:?/gi, "")
    .replace(/Döntés\s*\/\s*megállapodás:?/gi, "")
    .replace(/Döntés\s*\/\s*eredmény:?/gi, "")
    .replace(/Nyitott kérdések:?/gi, "")
    .replace(/[-–—:;,.\s]/g, "")
    .length >= 3;
}

function stepStatus(percent: number, issues: string[]): MeetingProgressStatus {
  if (percent >= 100) return "complete";
  if (issues.length > 0 && percent >= 50) return "warning";
  if (percent > 0) return "in_progress";
  return "not_started";
}

function agendaCompletion(workspace: MeetingWorkspace) {
  const items = (workspace.agenda || []).filter((item) => item.shared || (item.topicBlocks || []).length > 0);
  if (items.length === 0) return { percent: 0, issues: ["Nincs rögzített napirendi vagy Joker-témakör."] };

  let earned = 0;
  let possible = 0;
  let emptyContent = 0;
  for (const item of items) {
    possible += 4;
    if (item.title.trim()) earned += 1;
    const hasDiscussion = meaningfulText(item.discussionNotes) || (item.topicBlocks || []).some((topic) => meaningfulText(topic.discussion));
    const hasOutcome = meaningfulText(item.decisionSummary) || (item.topicBlocks || []).some((topic) => meaningfulText(topic.decision));
    const hasQuestion = meaningfulText(item.openQuestions) || (item.topicBlocks || []).some((topic) => meaningfulText(topic.openQuestions));
    if (hasDiscussion) earned += 1.5;
    if (hasOutcome) earned += 1;
    if (hasQuestion || item.completed) earned += 0.5;
    if (!hasDiscussion && !hasOutcome && !hasQuestion) emptyContent += 1;
  }
  const issues: string[] = [];
  if (emptyContent > 0) issues.push(`${emptyContent} napirendi pontnál még nincs érdemi egyeztetési tartalom.`);
  return { percent: ratio(earned, possible), issues };
}

export function calculateMeetingProgress(workspace: MeetingWorkspace): MeetingProgressResult {
  const steps: MeetingProgressStep[] = [];

  const metaChecks = [
    Boolean(workspace.projectId),
    Boolean(String(workspace.title || "").trim()),
    Boolean(String(workspace.meetingTypeCode || "").trim()),
    Boolean(workspace.scheduledStart),
    Boolean(String(workspace.chairpersonName || "").trim()),
    Boolean(String(workspace.minuteTakerName || "").trim()),
  ];
  const metaIssues: string[] = [];
  if (!workspace.projectId) metaIssues.push("Nincs projekthez kapcsolva az értekezlet.");
  if (!workspace.scheduledStart) metaIssues.push("Nincs megadva az értekezlet időpontja.");
  if (!String(workspace.chairpersonName || "").trim()) metaIssues.push("Nincs megadva az értekezletvezető.");
  if (!String(workspace.minuteTakerName || "").trim()) metaIssues.push("Nincs megadva a jegyzőkönyvvezető.");
  const metaPercent = ratio(metaChecks.filter(Boolean).length, metaChecks.length);
  steps.push({ id: "meta", sectionId: "meeting-meta", label: "Előkészítés és alapadatok", shortLabel: "Előkészítés", weight: 10, percent: metaPercent, status: stepStatus(metaPercent, metaIssues), issues: metaIssues });

  const attendees = workspace.attendees || [];
  const present = attendees.filter((item) => item.status !== "invited_absent");
  const attendanceChecks = [
    attendees.length > 0,
    present.length > 0,
    present.length > 0 && present.every((item) => String(item.name || "").trim().length > 0),
  ];
  const attendanceIssues: string[] = [];
  if (attendees.length === 0) attendanceIssues.push("A jelenléti lista még üres.");
  if (attendees.length > 0 && present.length === 0) attendanceIssues.push("Nincs jelenlévőként megjelölt résztvevő.");
  const attendancePercent = ratio(attendanceChecks.filter(Boolean).length, attendanceChecks.length);
  steps.push({ id: "attendance", sectionId: "meeting-attendance", label: "Jelenlévők és meghívottak", shortLabel: "Résztvevők", weight: 15, percent: attendancePercent, status: stepStatus(attendancePercent, attendanceIssues), issues: attendanceIssues });

  const agenda = agendaCompletion(workspace);
  steps.push({ id: "agenda", sectionId: "meeting-agenda", label: "Napirend és egyeztetési tartalom", shortLabel: "Egyeztetés", weight: 25, percent: agenda.percent, status: stepStatus(agenda.percent, agenda.issues), issues: agenda.issues });

  const actions = workspace.actionItems || [];
  const actionable = actions.filter((item) => item.type === "task" || item.type === "deadline");
  const missingOwners = actionable.filter((item) => !String(item.owner || "").trim()).length;
  const missingDueDates = actionable.filter((item) => !String(item.dueDate || "").trim()).length;
  const actionIssues: string[] = [];
  if (actions.length === 0) actionIssues.push("Még nincs rögzített döntés, feladat vagy nyitott kérdés.");
  if (missingOwners > 0) actionIssues.push(`${missingOwners} feladatnál vagy határidőnél hiányzik a felelős.`);
  if (missingDueDates > 0) actionIssues.push(`${missingDueDates} feladatnál vagy határidőnél hiányzik a dátum.`);
  let actionPercent = actions.length > 0 ? 45 : 0;
  if (actions.length > 0 && missingOwners === 0) actionPercent += 30;
  if (actions.length > 0 && missingDueDates === 0) actionPercent += 25;
  steps.push({ id: "actions", sectionId: "meeting-actions", label: "Döntések, feladatok és kérdések", shortLabel: "Döntések", weight: 20, percent: actionPercent, status: stepStatus(actionPercent, actionIssues), issues: actionIssues });

  const attachments = workspace.attachments || [];
  const pendingAttachments = attachments.filter((item) => item.status === "pending").length;
  const attachmentIssues: string[] = [];
  if (pendingAttachments > 0) attachmentIssues.push(`${pendingAttachments} melléklet jóváhagyásra vár.`);
  const attachmentPercent = attachments.length === 0 ? 100 : ratio(attachments.length - pendingAttachments, attachments.length);
  steps.push({ id: "attachments", sectionId: "meeting-attachments", label: "Képek és mellékletek", shortLabel: "Mellékletek", weight: 5, percent: attachmentPercent, status: stepStatus(attachmentPercent, attachmentIssues), issues: attachmentIssues });

  const activeSummary = (workspace.publishedSummaries || []).find((item) => item.id === workspace.activePublishedSummaryId && !item.revokedAt);
  const hasDraft = meaningfulText(workspace.aiMinutesDraft) || (workspace.agenda || []).some((item) => meaningfulText(item.discussionNotes) || meaningfulText(item.decisionSummary));
  const summaryPercent = activeSummary ? 100 : hasDraft ? 55 : 0;
  const summaryIssues = activeSummary ? [] : ["Az értekezleti összefoglaló még nincs közzétéve."];
  steps.push({ id: "summary", sectionId: "meeting-live-minutes", label: "Összefoglaló és emlékeztető", shortLabel: "Összefoglaló", weight: 15, percent: summaryPercent, status: stepStatus(summaryPercent, summaryIssues), issues: summaryIssues });

  const nextMeeting = workspace.nextMeeting || { status: "not_defined", startsAt: "" };
  const hasNextMeeting = nextMeeting.status !== "not_defined" && Boolean(nextMeeting.startsAt);
  const isClosed = workspace.status !== "active";
  const isFinal = workspace.status === "published" || workspace.status === "archived";
  let closurePercent = 0;
  if (hasNextMeeting) closurePercent += 30;
  if (isClosed) closurePercent += 40;
  if (isFinal) closurePercent += 30;
  const closureIssues: string[] = [];
  if (!hasNextMeeting) closureIssues.push("A következő egyeztetés várható időpontja nincs rögzítve.");
  if (!isClosed) closureIssues.push("Az értekezlet még nincs lezárva.");
  steps.push({ id: "closure", sectionId: "meeting-closure", label: "Lezárás és véglegesítés", shortLabel: "Lezárás", weight: 10, percent: closurePercent, status: stepStatus(closurePercent, closureIssues), issues: closureIssues });

  const percent = Math.round(steps.reduce((sum, step) => sum + step.percent * step.weight, 0) / 100);
  const issues = steps.flatMap((step) => step.issues);
  const status: MeetingProgressStatus = percent >= 100 ? "complete" : issues.length > 0 && percent >= 50 ? "warning" : percent > 0 ? "in_progress" : "not_started";
  const label = workspace.status === "archived"
    ? "Archivált"
    : workspace.status === "published"
      ? "Véglegesítve"
      : activeSummary
        ? "Összefoglaló közzétéve"
        : percent >= 75
          ? "Lezárásra előkészítve"
          : percent >= 35
            ? "Értekezlet folyamatban"
            : "Előkészítés alatt";

  return { percent, label, status, steps, issues };
}
