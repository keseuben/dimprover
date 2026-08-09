import {
  type PlanIssueDiscipline,
  type PlanIssueMarker,
  planMarkerSeverityOptions,
} from "@/components/viewers/PlanMarkerTypes";

export type PropertySurveyIssueStatus = "Nyitott" | "Folyamatban" | "Ellenőrzésre vár" | "Lezárt";
export type PropertySurveyIssuePhotoKind = "Helyszíni fotó" | "Jelölt fotó";
export type PropertySurveyIssuePlacementMode = "create" | "move" | null;

export type PropertySurveyIssue = {
  id: string;
  serial: string;
  title: string;
  description: string;
  roomId: string;
  xPercent: number;
  yPercent: number;
  discipline: PlanIssueDiscipline;
  severity: typeof planMarkerSeverityOptions[number];
  status: PropertySurveyIssueStatus;
  recordedAt: string;
  recordedBy: string;
  photoKind: PropertySurveyIssuePhotoKind;
  photoName?: string;
  photoDataUrl?: string;
  photoNote: string;
  createdAt: string;
  updatedAt: string;
};

export const propertySurveyIssueStatuses: PropertySurveyIssueStatus[] = [
  "Nyitott",
  "Folyamatban",
  "Ellenőrzésre vár",
  "Lezárt",
];

export const propertySurveyIssuePhotoKinds: PropertySurveyIssuePhotoKind[] = [
  "Helyszíni fotó",
  "Jelölt fotó",
];

export function getNextPropertySurveyIssueSerial(issues: PropertySurveyIssue[]) {
  const nextNumber = issues.reduce((maximum, issue) => {
    const match = issue.serial.match(/(\d+)$/);
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 0) + 1;
  return `HJ-${String(nextNumber).padStart(3, "0")}`;
}

export function createPropertySurveyIssue(input: {
  issues: PropertySurveyIssue[];
  roomId: string;
  xPercent: number;
  yPercent: number;
}) {
  const now = new Date().toISOString();
  return {
    id: `property-issue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serial: getNextPropertySurveyIssueSerial(input.issues),
    title: "Új hiba",
    description: "",
    roomId: input.roomId,
    xPercent: input.xPercent,
    yPercent: input.yPercent,
    discipline: "architecture" as const,
    severity: "Javítandó hiba" as const,
    status: "Nyitott" as const,
    recordedAt: now.slice(0, 10),
    recordedBy: "",
    photoKind: "Helyszíni fotó" as const,
    photoNote: "",
    createdAt: now,
    updatedAt: now,
  } satisfies PropertySurveyIssue;
}

export function propertySurveyIssueToPlanMarker(issue: PropertySurveyIssue, roomName?: string): PlanIssueMarker {
  return {
    id: issue.id,
    markerKind: "issue",
    sourceType: "image",
    issueId: issue.id,
    issueSerial: issue.serial,
    issueTitle: issue.title,
    issueLocation: roomName,
    issueDescription: issue.description,
    issueSeverity: issue.severity,
    issueStatus: issue.status,
    issueNote: issue.photoNote,
    serial: issue.serial.replace(/^HJ-/i, ""),
    title: issue.title,
    note: issue.description || issue.photoNote,
    status: issue.status,
    discipline: issue.discipline,
    xPercent: issue.xPercent,
    yPercent: issue.yPercent,
    showLetter: true,
    paperSize: "A4",
    orientation: "landscape",
    photoName: issue.photoName,
    photoNote: issue.photoNote,
    photoPreviewUrl: issue.photoDataUrl,
  };
}
