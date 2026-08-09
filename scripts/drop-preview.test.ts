import assert from "node:assert/strict";
import { buildDropPackagePreview } from "../app/lib/drop/dropPackagePreview";
import { parseDropCreatePackageInput } from "../app/lib/drop/dropValidation";

const normalized = parseDropCreatePackageInput({
  mode: "mixed",
  title: "  Kooperációs csomag  ",
  description: "Tervek és képek",
  projectName: "Mintaprojekt",
  uploaderName: "Teszt Elek",
  uploaderEmail: "TESZT@EXAMPLE.HU",
  retentionDays: 7,
  recipients: [
    { name: "Első címzett", email: "first@example.hu" },
    { name: "Második címzett", email: "second@example.hu", receiveFinalReport: false },
  ],
  groups: [
    { name: "Helyszíni fotók" },
    { name: "Kiviteli tervek", sequenceStart: 20 },
  ],
});

const now = new Date("2026-08-01T08:00:00.000Z");
const preview = buildDropPackagePreview(normalized, now);

assert.equal(preview.title, "Kooperációs csomag");
assert.equal(preview.uploader.email, "teszt@example.hu");
assert.equal(preview.counts.recipients, 2);
assert.equal(preview.counts.invitationRecipients, 2);
assert.equal(preview.counts.finalReportRecipients, 1);
assert.equal(preview.counts.groups, 2);
assert.equal(preview.groups[0]?.code, "helyszini-fotok");
assert.equal(preview.groups[1]?.sequenceStart, 20);
assert.equal(preview.schedule.expiresAt, "2026-08-08T08:00:00.000Z");
assert.equal(preview.schedule.graceExpiresAt, "2026-08-11T08:00:00.000Z");
assert.equal(preview.security.pinSource, "automatic");
assert.deepEqual(preview.security.capabilityPurposes, ["upload", "view", "download", "report"]);
assert.equal(preview.commit.databaseRequired, true);
assert.equal(preview.commit.filesPersisted, false);
assert.equal(preview.commit.uploadEnabled, false);
assert.equal("pin" in preview, false);
const serialized = JSON.stringify(preview);
assert.equal(serialized.includes("rawToken"), false, "Az előnézet nem tartalmazhat rawToken mezőt.");
assert.equal(serialized.includes("tokenHash"), false, "Az előnézet nem tartalmazhat tokenHash mezőt.");

console.log("DROP 0.2.0 package preview tests: PASS");
