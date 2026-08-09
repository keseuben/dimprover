import type { MeetingWorkspace } from "./types";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: MeetingWorkspace["status"]) {
  return {
    active: "Folyamatban",
    draft_closed: "Lezárt piszkozat",
    pending_approval: "Jóváhagyásra vár",
    published: "Közzétett",
    archived: "Archivált",
  }[status];
}

function attendanceStatusLabel(status: MeetingWorkspace["attendees"][number]["status"]) {
  return {
    present: "Jelen",
    late: "Késve érkezett",
    left_early: "Korábban távozott",
    invited_absent: "Meghívott, nem vett részt",
  }[status];
}

function participationModeLabel(mode: MeetingWorkspace["attendees"][number]["participationMode"]) {
  return mode === "in_person" ? "Személyes" : "Online";
}

function actionTypeLabel(type: MeetingWorkspace["actionItems"][number]["type"]) {
  return { task: "Feladat", decision: "Döntés", question: "Kérdés", deadline: "Határidő" }[type];
}

export function createExportWorkspace(workspace: MeetingWorkspace, includePrivate: boolean): MeetingWorkspace {
  if (includePrivate) return workspace;
  const activeSummary = workspace.publishedSummaries.find((item) => item.id === workspace.activePublishedSummaryId && item.publishedAt && !item.revokedAt);
  return {
    ...workspace,
    privateNotes: "",
    attendees: workspace.attendees.map((item) => ({ ...item, email: "", phone: "" })),
    agenda: workspace.agenda
      .filter((item) => item.shared)
      .map((item) => ({
        ...item,
        privateNotes: "",
        topicBlocks: item.topicBlocks
          .filter((topic) => topic.shared)
          .map((topic) => ({ ...topic, privateNotes: "" })),
      })),
    sharedMessages: workspace.sharedMessages.filter((item) => item.status === "shared"),
    transcript: workspace.transcript.filter((item) => item.shared),
    actionItems: workspace.actionItems.filter((item) => item.shared),
    attachments: workspace.attachments.filter((item) => item.status === "shared"),
    aiResults: [],
    aiMinutesDraft: "",
    publishedSummaries: activeSummary ? [activeSummary] : [],
    activePublishedSummaryId: activeSummary?.id || "",
    feedback: [],
    emailLog: [],
    auditLog: [],
    editorAccess: {
      ...workspace.editorAccess,
      grantId: "",
      editorEmail: "",
    },
    presentationControl: {
      ...workspace.presentationControl,
      grantId: "",
      controllerEmail: "",
    },
    presentation: {
      ...workspace.presentation,
      controllerGrantId: "",
    },
    nativeTranscription: {
      ...workspace.nativeTranscription,
      jobId: "",
      sourceFileName: "",
      sourceMimeType: "",
      sourceSizeBytes: 0,
      sourceOrigin: "",
      speakers: [],
      lastError: "",
    },
    teamsTranscript: {
      ...workspace.teamsTranscript,
      organizerUserId: "",
      graphOnlineMeetingId: "",
      lastError: "",
      transcriptIds: [],
    },
    teamsAttendance: {
      ...workspace.teamsAttendance,
      graphCalendarEventId: "",
      attendanceReportId: "",
      lastError: "",
    },
    closure: {
      ...workspace.closure,
      note: "",
    },
  };
}

function renderTopicBlocks(item: MeetingWorkspace["agenda"][number], includePrivate: boolean) {
  return item.topicBlocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((topic) => `
      <section class="topic-block">
        <h4>${topic.order}. ${escapeHtml(topic.title)}</h4>
        ${topic.background ? `<div class="topic-field"><b>Előzmény / problémafelvetés</b><div>${escapeHtml(topic.background)}</div></div>` : ""}
        ${topic.discussion ? `<div class="topic-field"><b>Egyeztetés tartalma</b><div>${escapeHtml(topic.discussion)}</div></div>` : ""}
        ${topic.decision ? `<div class="topic-field decision"><b>Döntés / eredmény</b><div>${escapeHtml(topic.decision)}</div></div>` : ""}
        ${topic.openQuestions ? `<div class="topic-field question"><b>Nyitott kérdések</b><div>${escapeHtml(topic.openQuestions)}</div></div>` : ""}
        ${topic.clientOpinion ? `<div class="topic-field client"><b>Megrendelői vélemény / jóváhagyás</b><div>${escapeHtml(topic.clientOpinion)}</div></div>` : ""}
        ${topic.designerOpinion ? `<div class="topic-field"><b>Tervezői álláspont</b><div>${escapeHtml(topic.designerOpinion)}</div></div>` : ""}
        ${topic.contractorOpinion ? `<div class="topic-field"><b>Kivitelezői álláspont</b><div>${escapeHtml(topic.contractorOpinion)}</div></div>` : ""}
        ${(topic.owner || topic.dueDate) ? `<div class="topic-meta"><b>Felelős:</b> ${escapeHtml(topic.owner || "-")} · <b>Határidő:</b> ${escapeHtml(topic.dueDate || "-")}</div>` : ""}
        ${includePrivate && topic.privateNotes ? `<div class="topic-field private"><b>Privát szervezői megjegyzés</b><div>${escapeHtml(topic.privateNotes)}</div></div>` : ""}
      </section>`)
    .join("");
}

export function renderMeetingHtml(workspace: MeetingWorkspace, includePrivate: boolean) {
  const data = createExportWorkspace(workspace, includePrivate);
  const activeSummary = data.publishedSummaries.find((item) => item.id === data.activePublishedSummaryId && !item.revokedAt);
  const attendance = data.attendees.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong>${item.external ? `<div class="muted">Külsős / vendég</div>` : ""}</td>
      <td>${escapeHtml(item.organization || "-")}</td>
      <td>${escapeHtml(item.functionTitle || "-")}</td>
      <td>${escapeHtml(participationModeLabel(item.participationMode))}</td>
      <td>${escapeHtml(attendanceStatusLabel(item.status))}</td>
      <td>${escapeHtml(item.arrivalTime || "-")} / ${escapeHtml(item.departureTime || "-")}</td>
      ${includePrivate ? `<td>${escapeHtml(item.email || "-")}<div class="muted">${escapeHtml(item.phone || "")}</div></td>` : ""}
    </tr>`).join("");

  const actions = data.actionItems.map((item) => `
    <tr>
      <td>${escapeHtml(actionTypeLabel(item.type))}</td>
      <td>${escapeHtml(data.agenda.find((agendaItem) => agendaItem.id === item.agendaItemId)?.title || "-")}</td>
      <td><strong>${escapeHtml(item.title)}</strong>${item.detail ? `<div class="muted">${escapeHtml(item.detail)}</div>` : ""}</td>
      <td>${escapeHtml(item.owner || "-")}</td>
      <td>${escapeHtml(item.dueDate || "-")}</td>
      <td>${item.shared ? "Megosztott" : "Privát"}</td>
    </tr>`).join("");

  const attachments = data.attachments.map((item) => `
    <tr>
      <td>${escapeHtml(item.originalName)}</td>
      <td>${escapeHtml(data.agenda.find((agendaItem) => agendaItem.id === item.agendaItemId)?.title || "-")}</td>
      <td>${escapeHtml(item.caption || "-")}</td>
      <td>${escapeHtml(item.uploadedBy)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${Math.max(0, item.sizeBytes / 1024 / 1024).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} MB</td>
    </tr>`).join("");

  const agenda = data.agenda.slice().sort((a, b) => a.order - b.order).map((item) => `
    <article class="agenda-item ${item.completed ? "done" : ""}">
      <h3><span>${item.completed ? "✓" : "○"}</span> ${item.order}. ${escapeHtml(item.title)}</h3>
      ${item.description ? `<div class="agenda-description">${escapeHtml(item.description)}</div>` : ""}
      ${item.discussionNotes ? `<div class="agenda-field"><b>Egyeztetés tartalma</b><div>${escapeHtml(item.discussionNotes)}</div></div>` : ""}
      ${item.decisionSummary ? `<div class="agenda-field decision"><b>Döntés / eredmény</b><div>${escapeHtml(item.decisionSummary)}</div></div>` : ""}
      ${item.openQuestions ? `<div class="agenda-field question"><b>Nyitott kérdések</b><div>${escapeHtml(item.openQuestions)}</div></div>` : ""}
      ${includePrivate && item.privateNotes ? `<div class="agenda-field private"><b>Privát szervezői megjegyzés</b><div>${escapeHtml(item.privateNotes)}</div></div>` : ""}
      ${item.topicBlocks.length ? `<div class="topic-list"><h4>Rögzített témakörök</h4>${renderTopicBlocks(item, includePrivate)}</div>` : ""}
      <div class="muted">Utolsó módosítás: ${escapeHtml(formatDate(item.updatedAt))} · ${escapeHtml(item.updatedBy || "-")}</div>
    </article>`).join("");

  const sharedEntries = data.sharedMessages
    .filter((item) => item.status === "shared" && (item.includeInDocument ?? true))
    .map((item) => {
      const agendaItem = data.agenda.find((agenda) => agenda.id === item.agendaItemId);
      return `<div class="box"><strong>${escapeHtml(item.submittedBy)}</strong> · ${escapeHtml(formatDate(item.submittedAt))}${agendaItem ? ` · Napirend: ${escapeHtml(`${agendaItem.order}. ${agendaItem.title}`)}` : ""}<br>${escapeHtml(item.text)}</div>`;
    }).join("");

  const transcript = data.transcript.map((item) => `
    <div class="transcript-line"><span class="time">${escapeHtml(item.at)}</span><strong>${escapeHtml(item.speaker)}:</strong> ${escapeHtml(item.text)}</div>`).join("");

  const feedbackSummary = includePrivate && data.feedback.length ? `
    <h2>Résztvevői visszajelzések</h2>
    <table><thead><tr><th>Résztvevő</th><th>Típus</th><th>Megjegyzés</th><th>Státusz</th><th>Időpont</th></tr></thead><tbody>
      ${data.feedback.map((item) => `<tr><td>${escapeHtml(item.anonymous ? "Névtelen" : item.participantName)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.comment || item.quote || "-")}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(formatDate(item.createdAt))}</td></tr>`).join("")}
    </tbody></table>` : "";

  return `<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.minuteNumber || data.title)} - ${escapeHtml(data.documentLabel)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font-family: Arial, "DejaVu Sans", sans-serif; font-size: 10.5pt; line-height: 1.45; background: #fff; }
    header { border-bottom: 3px solid #0f766e; padding-bottom: 12px; margin-bottom: 18px; }
    .brand { color: #0f766e; font-size: 10pt; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 5px 0 0; font-size: 22pt; line-height: 1.15; }
    h2 { margin: 22px 0 8px; color: #0f766e; font-size: 14pt; page-break-after: avoid; }
    h3 { margin: 14px 0 6px; font-size: 11.5pt; }
    h4 { margin: 10px 0 5px; font-size: 10.5pt; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 20px; margin-top: 14px; }
    .meta div { border-bottom: 1px solid #cbd5e1; padding: 4px 0; }
    .meta b { color: #475569; }
    .status { display: inline-block; margin-top: 10px; border: 1px solid #99f6e4; border-radius: 999px; padding: 4px 10px; background: #f0fdfa; color: #115e59; font-weight: 800; }
    .box { border: 1px solid #cbd5e1; border-radius: 9px; padding: 11px 13px; margin: 8px 0; white-space: pre-wrap; }
    .warning { border-color: #fcd34d; background: #fffbeb; }
    .summary { border: 1px solid #f4d06f; border-left: 5px solid #d6a900; background: #fff9df; padding: 14px 16px; white-space: pre-wrap; }
    .agenda-item { border: 1px solid #cbd5e1; border-radius: 10px; padding: 11px 13px; margin: 9px 0; page-break-inside: avoid; }
    .agenda-item.done h3 { color: #166534; }
    .agenda-item h3 { margin: 0 0 7px; }
    .agenda-description { color: #475569; white-space: pre-wrap; margin-bottom: 8px; }
    .agenda-field, .topic-field { border-left: 3px solid #38bdf8; background: #f0f9ff; padding: 7px 9px; margin-top: 6px; white-space: pre-wrap; }
    .agenda-field.decision, .topic-field.decision { border-left-color: #10b981; background: #ecfdf5; }
    .agenda-field.question, .topic-field.question { border-left-color: #f59e0b; background: #fffbeb; }
    .agenda-field.private, .topic-field.private { border-left-color: #8b5cf6; background: #f5f3ff; }
    .topic-field.client { border-left-color: #0ea5e9; background: #f0f9ff; }
    .agenda-field b, .topic-field b { display: block; margin-bottom: 3px; }
    .topic-list { margin-top: 12px; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
    .topic-block { margin: 8px 0; padding: 9px 10px; border: 1px solid #e2e8f0; border-radius: 8px; page-break-inside: avoid; }
    .topic-meta { margin-top: 7px; font-size: 9pt; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 7px; font-size: 9pt; }
    th { background: #e6fffb; color: #115e59; text-align: left; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .muted { color: #64748b; font-size: 8.5pt; margin-top: 2px; }
    .transcript-line { border-bottom: 1px solid #e2e8f0; padding: 5px 0; }
    .time { display: inline-block; width: 46px; color: #64748b; }
    footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 8.5pt; }
  </style>
</head>
<body>
  <header>
    <div class="brand">DIMPRO – Értekezleti Asszisztens</div>
    <h1>${escapeHtml(data.documentLabel)}</h1>
    <div>${escapeHtml(data.title)}</div>
    <div class="status">${escapeHtml(statusLabel(data.status))} · ${escapeHtml(data.minuteNumber || "Nincs sorszám")} · Snapshot v${data.closure.snapshotVersion}</div>
    <div class="meta">
      <div><b>Projekt:</b> ${escapeHtml(`${data.projectCode ? `${data.projectCode} · ` : ""}${data.projectName}`)}</div>
      <div><b>Értekezlet módja:</b> ${escapeHtml(data.meetingMode === "in_person" ? "Személyes értekezlet" : "Microsoft Teams értekezlet")}</div>
      <div><b>Kategória:</b> ${escapeHtml(`${data.meetingType} (${data.meetingTypeCode})`)}</div>
      <div><b>Helyszín:</b> ${escapeHtml(data.meetingLocation || "Online / Teams")}</div>
      <div><b>Meetingazonosító:</b> ${escapeHtml(data.meetingId)}</div>
      <div><b>Értekezletvezető:</b> ${escapeHtml(data.chairpersonName || "-")}</div>
      <div><b>Jegyzőkönyvvezető:</b> ${escapeHtml(data.minuteTakerName || data.organizerName)}</div>
      <div><b>Jóváhagyó:</b> ${escapeHtml(data.approverName || "-")}</div>
      <div><b>Jelenléti létszám:</b> ${data.attendees.filter((item) => item.status !== "invited_absent").length} fő</div>
      <div><b>Kezdés:</b> ${escapeHtml(formatDate(data.scheduledStart || data.createdAt))}</div>
      <div><b>Befejezés:</b> ${escapeHtml(formatDate(data.scheduledEnd || data.closure.closedAt || data.endedAt))}</div>
      <div><b>Dokumentum száma:</b> ${escapeHtml(data.minuteNumber || "-")}</div>
      <div><b>Dokumentumazonosító:</b> ${escapeHtml(data.documentId || "-")}</div>
    </div>
  </header>

  ${activeSummary ? `<h2>Közzétett összefoglaló – v${activeSummary.version}</h2><div class="summary">${escapeHtml(activeSummary.body)}</div><div class="box warning"><b>${escapeHtml(activeSummary.closingTitle)}</b><br>${escapeHtml(activeSummary.closingMessage)}<br><br>${escapeHtml(activeSummary.emailNotice)}</div>` : ""}

  <h2>Jelenléti ív</h2>
  ${attendance ? `<table><thead><tr><th>Név</th><th>Szervezet</th><th>Szerepkör</th><th>Részvétel</th><th>Státusz</th><th>Érkezés / távozás</th>${includePrivate ? "<th>Kapcsolat</th>" : ""}</tr></thead><tbody>${attendance}</tbody></table>` : `<div class="box">Nincs rögzített jelenlévő.</div>`}

  ${data.closure.note ? `<h2>Lezárási megjegyzés</h2><div class="box warning">${escapeHtml(data.closure.note)}</div>` : ""}
  ${includePrivate && data.privateNotes ? `<h2>Privát szervezői jegyzet</h2><div class="box">${escapeHtml(data.privateNotes)}</div>` : ""}
  <h2>Megosztott jegyzet</h2>
  <div class="box">${escapeHtml(data.sharedNote || "Nincs megosztott jegyzet.")}</div>

  <h2>Szöveges bejegyzések</h2>
  ${sharedEntries || `<div class="box">Nincs dokumentumba jelölt szöveges bejegyzés.</div>`}

  <h2>Napirend és részletes tartalom</h2>
  ${agenda || `<div class="box">Nincs exportálható napirendi pont.</div>`}

  <h2>Döntések, feladatok és határidők</h2>
  ${actions ? `<table><thead><tr><th>Típus</th><th>Napirendi pont</th><th>Megnevezés</th><th>Felelős</th><th>Határidő</th><th>Láthatóság</th></tr></thead><tbody>${actions}</tbody></table>` : `<div class="box">Nincs rögzített elem.</div>`}

  <h2>Mellékletek</h2>
  ${attachments ? `<table><thead><tr><th>Fájlnév</th><th>Napirendi pont</th><th>Leírás</th><th>Feltöltő</th><th>Státusz</th><th>Méret</th></tr></thead><tbody>${attachments}</tbody></table>` : `<div class="box">Nincs megjeleníthető melléklet.</div>`}

  ${data.nextMeeting.status !== "not_defined" ? `<h2>Következő egyeztetés</h2><div class="box"><b>Várható időpont:</b> ${escapeHtml(formatDate(data.nextMeeting.startsAt))}<br><b>Helyszín:</b> ${escapeHtml(data.nextMeeting.location || "-")}<br>${escapeHtml(data.nextMeeting.note || "")}</div>` : ""}

  <h2>Rögzített beszélgetés / Teams-átirat</h2>
  ${transcript || `<div class="box">Nincs exportálható átirat.</div>`}

  ${feedbackSummary}

  <footer>
    Generálva: ${escapeHtml(formatDate(new Date().toISOString()))}. A dokumentum a DIMPRO Értekezleti Asszisztensben rögzített adatok pillanatképe.
    ${includePrivate ? "Belső szervezői export – privát adatokat is tartalmazhat." : "Résztvevői export – csak megosztott tartalmak."}
  </footer>
</body>
</html>`;
}
