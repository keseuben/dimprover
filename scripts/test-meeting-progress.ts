import assert from "node:assert/strict";
import { calculateMeetingProgress } from "../app/lib/meeting-assistant/progress";
import { createDefaultMeetingWorkspace } from "../app/lib/meeting-assistant/types";

const empty = createDefaultMeetingWorkspace("progress-empty");
const emptyProgress = calculateMeetingProgress(empty);
assert.ok(emptyProgress.percent < 25, `Az üres munkatér túl magas készültséget kapott: ${emptyProgress.percent}%`);
assert.equal(emptyProgress.label, "Előkészítés alatt");
assert.ok(emptyProgress.issues.length >= 5);

const partial = createDefaultMeetingWorkspace("progress-partial");
partial.projectId = "project-1";
partial.projectCode = "P-001";
partial.projectName = "Tesztprojekt";
partial.scheduledStart = new Date().toISOString();
partial.chairpersonName = "Értekezletvezető";
partial.minuteTakerName = "Jegyzőkönyvvezető";
partial.attendees.push({
  id: "attendee-1",
  projectMemberId: "",
  name: "Teszt Résztvevő",
  organization: "DIMPRO",
  functionTitle: "Projektvezető",
  email: "teszt@example.com",
  phone: "",
  status: "present",
  participationMode: "online",
  arrivalTime: "",
  departureTime: "",
  external: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
partial.agenda[0].discussionNotes = "A résztvevők egyeztették a projekt indulásának feltételeit.";
partial.agenda[0].decisionSummary = "A projektindítás jóváhagyva.";
const partialProgress = calculateMeetingProgress(partial);
assert.ok(partialProgress.percent > emptyProgress.percent);
assert.ok(partialProgress.percent < 80);

const complete = structuredClone(partial);
for (const item of complete.agenda) {
  item.discussionNotes = `${item.title} részletesen megtárgyalva.`;
  item.decisionSummary = `${item.title} eredménye jóváhagyva.`;
  item.completed = true;
}
complete.actionItems.push({
  id: "action-1",
  agendaItemId: complete.agenda[0].id,
  topicBlockId: "",
  type: "task",
  title: "Következő feladat végrehajtása",
  detail: "",
  owner: "Teszt Felelős",
  dueDate: "2026-07-31",
  shared: true,
  createdAt: new Date().toISOString(),
});
complete.publishedSummaries.push({
  id: "summary-1",
  version: 1,
  source: "rules",
  title: "Összefoglaló",
  body: "Az értekezlet összefoglalója elkészült.",
  closingTitle: "Köszönjük a részvételt!",
  closingMessage: "Köszönjük a közös munkát.",
  emailNotice: "",
  emailDocumentType: "final_minutes",
  emailDeliveryMode: "organizer",
  reviewDeadline: "",
  nextMeetingAt: "2026-07-28T08:00:00.000Z",
  nextMeetingLocation: "Teams",
  createdAt: new Date().toISOString(),
  createdBy: "Szervező",
  publishedAt: new Date().toISOString(),
  revokedAt: "",
});
complete.activePublishedSummaryId = "summary-1";
complete.nextMeeting = {
  status: "confirmed",
  startsAt: "2026-07-28T08:00:00.000Z",
  endsAt: "2026-07-28T09:00:00.000Z",
  location: "Teams",
  note: "",
};
complete.status = "published";
const completeProgress = calculateMeetingProgress(complete);
assert.equal(completeProgress.percent, 100, `A teljes munkatér készültsége nem 100%: ${completeProgress.percent}%`);
assert.equal(completeProgress.status, "complete");
assert.equal(completeProgress.label, "Véglegesítve");

console.log("OK meeting progress: empty, partial and complete states");
