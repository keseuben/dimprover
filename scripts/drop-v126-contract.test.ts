import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDropPublicDeliveryEmailContent } from "../app/lib/drop/public/dropPublicEmailTemplate";

const read = (file: string) => readFileSync(file, "utf8");
const proxy = read("proxy.ts");
const uploader = read("components/drop/DropPublicHexUploader.tsx");
const transfer = read("components/drop/DropPublicTransferClient.tsx");
const secure = read("components/drop/DropSecureDownloadPanel.tsx");
const groupsRoute = read("app/api/drop/access/groups/route.ts");
const groupService = read("app/lib/drop/dropGroupService.ts");
const report = read("app/lib/drop/report/dropFinalReportRenderer.ts");
const download = read("app/lib/drop/download/dropDownloadService.ts");
const zipRoute = read("app/api/drop/downloads/package/zip/route.ts");
const preview = read("app/lib/drop/public/dropPublicEmailPreview.ts");
const email = read("app/lib/drop/public/dropPublicEmailTemplate.ts");
const identity = read("app/lib/identity-core/repository.ts");
const identityAdmin = read("app/lib/identity-core/admin.ts");
const manager = read("components/drop/DropPublicWorkflowManager.tsx");
const workflow = read("app/lib/drop/public/dropPublicWorkflowService.ts");
const runtime = read("app/lib/drop/dropRuntime.ts");
const coreSql = read("supabase/migrations/20260731143500_drop_core.sql");

const checks: Array<[string, () => void]> = [
  ["v126-runtime", () => assert.match(runtime, /version: "DROP 1\.2\.6"/)],
  ["pdf-route-proxy", () => assert.match(proxy, /pathname === "\/api\/drop\/downloads\/package\/report"/)],
  ["txt-route-proxy", () => assert.match(proxy, /pathname === "\/api\/drop\/downloads\/package\/text"/)],
  ["email-max-20", () => { assert.match(preview, /DEFAULT_MAX_PREVIEWS = 20/); assert.match(preview, /HARD_MAX_PREVIEWS = 20/); assert.match(email, /input\.files\.slice\(0, 20\)/); }],
  ["email-top-bottom-cta", () => { assert.match(email, /const openButton/); assert.equal((email.match(/\$\{openButton\}/g) || []).length, 2); }],
  ["email-recipient-lines", () => { assert.match(email, /Címzettek:/); assert.match(email, /join\("<br>"\)/); }],
  ["no-auto-finalize-after-upload", () => { assert.doesNotMatch(uploader, /if \(allSucceeded\) window\.setTimeout\(\(\) => void finalizeDelivery/); assert.match(uploader, /csak a külön, 2 másodperces véglegesítés után/); }],
  ["hold-upload-2s", () => { assert.match(uploader, /window\.setTimeout\(\(\) => \{/); assert.match(uploader, /\}, 2000\)/); assert.match(uploader, /Fájlok feltöltése · 2 mp/); }],
  ["hold-finalize-2s", () => assert.match(uploader, /Küldemény véglegesítése · 2 mp/)],
  ["continue-upload-workflow", () => { assert.match(uploader, /További feltöltés ide/); assert.match(uploader, /Másik csoport \/ kezelés/); assert.match(uploader, /Aktív csoport:/); }],
  ["floating-group-manager", () => { assert.match(uploader, /fixed bottom-24 right-4/); assert.match(uploader, /Váltás és csoportkezelés/); }],
  ["group-update-delete-api", () => { assert.match(groupsRoute, /export async function PATCH/); assert.match(groupsRoute, /export async function DELETE/); assert.match(groupService, /updateDropPackageGroup/); assert.match(groupService, /deleteDropPackageGroup/); }],
  ["group-delete-preserves-files", () => assert.match(coreSql, /group_id uuid references public\.drop_groups\(id\) on delete set null/)],
  ["pdf-layouts-1-2-4-6", () => { assert.match(report, /DropReportImagesPerPage = 1 \| 2 \| 4 \| 6/); assert.match(secure, /Részletes · 1 kép \/ oldal/); assert.match(secure, /Kompakt · 2 kép \/ oldal/); assert.match(secure, /Áttekintő · 4 kép \/ oldal/); assert.match(secure, /Gyors · 6 kép \/ oldal/); }],
  ["pdf-image-optimization", () => { assert.match(report, /sharp\(source/); assert.match(report, /jpeg\(\{ quality/); assert.match(report, /resize\(\{ width: maxEdge/); }],
  ["zip-report-selectable", () => { assert.match(secure, /zipIncludePdf/); assert.match(secure, /zipIncludeTxt/); assert.match(zipRoute, /includePdf = false/); assert.match(zipRoute, /includeTxt = true/); assert.match(download, /reportPdfIncluded: includePdf/); assert.match(download, /reportTxtIncluded: includeTxt/); }],
  ["download-recipients-stacked", () => assert.match(secure, /space-y-1 font-semibold text-slate-900/)],
  ["voice-license-module", () => { assert.match(identity, /DROP_QUICK_VOICE_NOTE/); assert.match(identityAdmin, /DROP_QUICK_VOICE_NOTE/); assert.match(manager, /Gyors hangos megjegyzés licencmodul/); }],
  ["voice-max-60", () => { assert.match(identity, /Math\.max\(10, Math\.min\(60/); assert.match(uploader, /Math\.max\(10, Math\.min\(60, quickVoiceSecondsPerNote\)\)/); }],
  ["voice-no-audio-storage", () => { assert.match(uploader, /A DIMPRO nem rögzít hangfájlt/); assert.match(manager, /device\/böngésző diktálással/); }],
  ["voice-warning-countdown", () => { assert.match(uploader, /voiceSecondsLeft <= 15/); assert.match(uploader, /15 mp-en belül automatikusan leáll/); assert.match(uploader, /voiceSecondsLeft <= 5/); }],
  ["voice-workflow-license-gated", () => { assert.match(workflow, /context\.entitlement\.canUseQuickVoiceNote/); assert.match(transfer, /allowQuickVoiceNote=\{Boolean\(created\.workflow\.allowQuickVoiceNote\)\}/); }],
  ["no-nonexistent-voice-columns", () => { assert.doesNotMatch(identity, /can_use_quick_voice_note|max_quick_voice_seconds_per_note/); assert.doesNotMatch(identityAdmin, /can_use_quick_voice_note|max_quick_voice_seconds_per_note/); }],
];

const files = Array.from({ length: 25 }, (_, index) => ({
  id: `file-${index + 1}`,
  name: `fajl_${index + 1}.jpg`,
  sizeBytes: 100_000 + index,
  comments: [`Megjegyzés ${index + 1}`],
  mimeType: "image/jpeg",
  isImage: true,
  storageKey: `test/${index + 1}.jpg`,
}));
const mail = buildDropPublicDeliveryEmailContent({
  recipientName: "Teszt",
  allRecipients: [{ name: "Első", email: "elso@example.hu" }, { name: "Második", email: "masodik@example.hu" }],
  showRecipients: true,
  uploaderName: "Feladó",
  uploaderEmail: "felado@example.hu",
  subject: "Teszt tárgy",
  senderMessage: "Teszt üzenet",
  packageNote: "Megjegyzés",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  files,
  downloadUrl: "https://drop.dimpro.hu/d/test",
  downloadPin: null,
  previewBundle: { previews: [], attachments: [], eligibleCount: 25, attemptedCount: 0, skippedCount: 25, errors: [], totalBytes: 0 },
});
checks.push(["email-runtime-25-files", () => {
  assert.equal((mail.html.match(/class="drop-card"/g) || []).length, 20);
  assert.equal((mail.html.match(/>Fájlok megnyitása<\/a>/g) || []).length, 2);
  assert.match(mail.html, /További 5 fájl/);
  assert.match(mail.text, /Címzettek:\n- Első <elso@example\.hu>\n- Második <masodik@example\.hu>/);
}]);

let passed = 0;
for (const [name, run] of checks) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`, error); process.exitCode = 1; }
}
console.log(`${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
