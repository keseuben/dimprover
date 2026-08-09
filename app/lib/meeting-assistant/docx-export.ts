import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { createExportWorkspace } from "./export";
import type { MeetingTopicBlock, MeetingWorkspace } from "./types";

function text(value: unknown) {
  return String(value ?? "").trim() || "-";
}

function date(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("hu-HU");
}

function cell(value: unknown, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: text(value), bold })] })],
  });
}

function simpleTable(rows: Array<Array<string | number>>, header = true) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
    },
    rows: rows.map((row, rowIndex) => new TableRow({
      children: row.map((value) => cell(value, header && rowIndex === 0)),
    })),
  });
}

function heading(value: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) {
  return new Paragraph({ text: value, heading: level, spacing: { before: 260, after: 120 } });
}

function contentBlock(label: string, value: string, privateBlock = false) {
  if (!value.trim()) return [];
  return [
    new Paragraph({
      children: [new TextRun({ text: label, bold: true, color: privateBlock ? "6D28D9" : "0F766E" })],
      spacing: { before: 100, after: 40 },
    }),
    new Paragraph({ text: value, spacing: { after: 100 } }),
  ];
}

function topicBlockParagraphs(topic: MeetingTopicBlock, includePrivate: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: `${topic.order}. ${topic.title}`, bold: true, size: 22, color: "334155" })],
      spacing: { before: 160, after: 60 },
    }),
  ];
  paragraphs.push(...contentBlock("Előzmény / problémafelvetés", topic.background));
  paragraphs.push(...contentBlock("Egyeztetés tartalma", topic.discussion));
  paragraphs.push(...contentBlock("Döntés / eredmény", topic.decision));
  paragraphs.push(...contentBlock("Nyitott kérdések", topic.openQuestions));
  paragraphs.push(...contentBlock("Megrendelői vélemény / jóváhagyás", topic.clientOpinion));
  paragraphs.push(...contentBlock("Tervezői álláspont", topic.designerOpinion));
  paragraphs.push(...contentBlock("Kivitelezői álláspont", topic.contractorOpinion));
  if (topic.owner || topic.dueDate) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: `Felelős: ${topic.owner || "-"}`, bold: true }),
        new TextRun({ text: ` · Határidő: ${topic.dueDate || "-"}` }),
      ],
      spacing: { after: 80 },
    }));
  }
  if (includePrivate) paragraphs.push(...contentBlock("Privát szervezői megjegyzés", topic.privateNotes, true));
  return paragraphs;
}

export async function renderMeetingDocx(workspace: MeetingWorkspace, includePrivate: boolean) {
  const data = createExportWorkspace(workspace, includePrivate);
  const activeSummary = data.publishedSummaries.find((item) => item.id === data.activePublishedSummaryId && !item.revokedAt);
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: "DIMPRO – ÉRTEKEZLETI ASSZISZTENS", bold: true, color: "0F766E", size: 20 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      text: data.documentLabel,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      text: data.title,
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
    }),
    simpleTable([
      ["Projekt", data.projectName, "Projektkód", data.projectCode],
      ["Kategória", `${data.meetingType} (${data.meetingTypeCode})`, "Helyszín", data.meetingLocation || "Online / Teams"],
      ["Értekezletvezető", data.chairpersonName, "Jegyzőkönyvvezető", data.minuteTakerName || data.organizerName],
      ["Jóváhagyó", data.approverName, "Dokumentum száma", data.minuteNumber],
      ["Kezdés", date(data.scheduledStart), "Befejezés", date(data.scheduledEnd || data.endedAt)],
      ["Dokumentumazonosító", data.documentId, "Meeting ID", data.meetingId],
    ], false),
  ];

  if (activeSummary) {
    children.push(
      heading(`Közzétett összefoglaló – v${activeSummary.version}`),
      new Paragraph({ text: activeSummary.body, spacing: { after: 140 } }),
      new Paragraph({ children: [new TextRun({ text: activeSummary.closingTitle, bold: true, color: "B45309" })] }),
      new Paragraph(activeSummary.closingMessage),
      new Paragraph({ text: activeSummary.emailNotice, spacing: { after: 160 } }),
    );
  }

  children.push(heading("Jelenléti ív"));
  if (data.attendees.length > 0) {
    children.push(simpleTable([
      ["Név", "Szervezet", "Szerepkör", "Részvétel", "Státusz", ...(includePrivate ? ["Kapcsolat"] : [])],
      ...data.attendees.map((item) => [
        item.name,
        item.organization,
        item.functionTitle,
        item.participationMode === "in_person" ? "Személyes" : "Online",
        item.status,
        ...(includePrivate ? [[item.email, item.phone].filter(Boolean).join(" · ")] : []),
      ]),
    ]));
  } else {
    children.push(new Paragraph("Nincs rögzített jelenlévő."));
  }

  if (includePrivate && data.privateNotes) {
    children.push(heading("Privát szervezői jegyzet"), new Paragraph(data.privateNotes));
  }
  children.push(heading("Megosztott jegyzet"), new Paragraph(data.sharedNote || "Nincs megosztott jegyzet."));
  children.push(heading("Napirend és részletes tartalom"));

  data.agenda.slice().sort((a, b) => a.order - b.order).forEach((item) => {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${item.completed ? "✓" : "○"} ${item.order}. ${item.title}`, bold: true, size: 24 })],
      spacing: { before: 180, after: 80 },
    }));
    children.push(...contentBlock("Téma leírása / előkészítés", item.description));
    children.push(...contentBlock("Egyeztetés tartalma", item.discussionNotes));
    children.push(...contentBlock("Döntés / eredmény", item.decisionSummary));
    children.push(...contentBlock("Nyitott kérdések", item.openQuestions));
    if (includePrivate) children.push(...contentBlock("Privát szervezői megjegyzés", item.privateNotes, true));
    if (item.topicBlocks.length > 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Rögzített témakörök", bold: true, color: "0F766E" })], spacing: { before: 140, after: 60 } }));
      item.topicBlocks.slice().sort((a, b) => a.order - b.order).forEach((topic) => children.push(...topicBlockParagraphs(topic, includePrivate)));
    }
  });

  children.push(heading("Döntések, feladatok és határidők"));
  if (data.actionItems.length > 0) {
    children.push(simpleTable([
      ["Típus", "Napirendi pont", "Megnevezés", "Felelős", "Határidő"],
      ...data.actionItems.map((item) => [
        item.type,
        data.agenda.find((agenda) => agenda.id === item.agendaItemId)?.title || "-",
        item.title,
        item.owner,
        item.dueDate,
      ]),
    ]));
  } else {
    children.push(new Paragraph("Nincs rögzített feladat vagy döntés."));
  }

  children.push(heading("Mellékletek"));
  if (data.attachments.length > 0) {
    children.push(simpleTable([
      ["Fájlnév", "Napirendi pont", "Leírás", "Feltöltő", "Státusz"],
      ...data.attachments.map((item) => [
        item.originalName,
        data.agenda.find((agenda) => agenda.id === item.agendaItemId)?.title || "-",
        item.caption,
        item.uploadedBy,
        item.status,
      ]),
    ]));
  } else {
    children.push(new Paragraph("Nincs megjeleníthető melléklet."));
  }

  if (data.nextMeeting.status !== "not_defined") {
    children.push(
      heading("Következő egyeztetés"),
      simpleTable([
        ["Várható kezdés", date(data.nextMeeting.startsAt), "Helyszín", data.nextMeeting.location],
        ["Várható befejezés", date(data.nextMeeting.endsAt), "Státusz", data.nextMeeting.status],
      ], false),
    );
    if (data.nextMeeting.note) children.push(new Paragraph({ text: data.nextMeeting.note, spacing: { before: 80 } }));
  }

  children.push(heading("Rögzített beszélgetés / Teams-átirat"));
  if (data.transcript.length > 0) {
    data.transcript.forEach((item) => children.push(new Paragraph({
      children: [
        new TextRun({ text: `${item.at} ${item.speaker}: `, bold: true }),
        new TextRun(item.text),
      ],
      spacing: { after: 60 },
    })));
  } else {
    children.push(new Paragraph("Nincs exportálható átirat."));
  }

  if (includePrivate && data.feedback.length > 0) {
    children.push(heading("Résztvevői visszajelzések"));
    children.push(simpleTable([
      ["Résztvevő", "Típus", "Megjegyzés", "Státusz", "Időpont"],
      ...data.feedback.map((item) => [
        item.anonymous ? "Névtelen" : item.participantName,
        item.type,
        item.comment || item.quote,
        item.status,
        date(item.createdAt),
      ]),
    ]));
  }

  children.push(new Paragraph({
    children: [new TextRun({
      text: `Generálva: ${new Date().toLocaleString("hu-HU")} · ${includePrivate ? "Belső szervezői export" : "Résztvevői export"}`,
      color: "64748B",
      size: 16,
    })],
    spacing: { before: 300 },
  }));

  const document = new Document({ sections: [{ properties: {}, children }] });
  return Buffer.from(await Packer.toBuffer(document));
}
