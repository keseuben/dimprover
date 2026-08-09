import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(file:string)=>readFileSync(file,"utf8");
const transfer=read("components/drop/DropPublicTransferClient.tsx");
const uploader=read("components/drop/DropPublicHexUploader.tsx");
const manager=read("components/drop/DropPublicWorkflowManager.tsx");
const rules=read("components/drop/DropUploadRulesDialog.tsx");
const preview=read("app/lib/drop/public/dropPublicEmailPreview.ts");
const email=read("app/lib/drop/public/dropPublicEmailTemplate.ts");
const finalize=read("app/lib/drop/public/dropPublicFinalizeService.ts");
const identity=read("app/lib/identity-core/repository.ts");
const contacts=read("app/api/dimpro-identity/send/contacts/route.ts");
const workflow=read("app/lib/drop/public/dropPublicWorkflowService.ts");
const zip=read("app/lib/drop/download/dropPackageZip.ts");
const download=read("app/lib/drop/download/dropDownloadService.ts");
const secure=read("components/drop/DropSecureDownloadPanel.tsx");
const drive=read("app/lib/drop/archive/dropDriveArchiveService.ts");
const migration=read("supabase/DIMPRO_DROP_125_SEND_UX_REPORTS.sql");
const pdf=read("app/lib/drop/report/dropFinalReportRenderer.ts");
const txt=read("app/lib/drop/report/dropPackageTextReport.ts");
const fileRoute=read("app/api/drop/downloads/file/[fileId]/route.ts");
const proxy=read("proxy.ts");
const reportRoute=read("app/api/drop/downloads/package/report/route.ts");
const textRoute=read("app/api/drop/downloads/package/text/route.ts");

const checks:[string,()=>void][]=[
 ["email-30-preview",()=>{assert.match(preview,/DEFAULT_MAX_PREVIEWS = 30/);assert.match(preview,/HARD_MAX_PREVIEWS = 30/);assert.match(preview,/3 \* 1024 \* 1024/)}],
 ["email-recipient-summary",()=>{assert.match(email,/Címzettek:/);assert.match(email,/allRecipients/);assert.match(email,/showRecipients/)}],
 ["email-clickable-thumbnail",()=>{assert.match(email,/directUrl/);assert.match(email,/target="_blank"/);assert.match(finalize,/api\/drop\/downloads\/file/);assert.match(fileRoute,/issueDropFileInline/)}],
 ["saved-code-hold-delete",()=>{assert.match(transfer,/Tartsa nyomva 2 mp-ig/);assert.match(transfer,/2000/);assert.match(transfer,/bg-rose-50/)}],
 ["quick-five-extra-recipients",()=>{assert.match(transfer,/Math\.min\(5, Math\.max\(0, maxRecipients/);assert.match(transfer,/Math\.min\(5/);assert.match(transfer,/további címzett rögzíthető/)}],
 ["self-recipient",()=>{assert.match(transfer,/Automatikus alapcímzett/);assert.match(transfer,/Alapból Ön kapja meg a küldeményt/)}],
 ["editable-contact-book",()=>{assert.match(contacts,/export async function POST/);assert.match(contacts,/export async function DELETE/);assert.match(identity,/upsertDimproSendContact/);assert.match(identity,/maxSavedContacts/);assert.match(transfer,/Saját DIMPRO címjegyzék/);assert.match(proxy,/pathname === "\/api\/dimpro-identity\/send\/contacts"/)}],
 ["contact-book-license-limit",()=>{assert.match(migration,/max_saved_contacts integer not null default 10/);assert.match(manager,/Mentett címjegyzék-limit/)}],
 ["rules-first-three",()=>{assert.match(migration,/upload_rules_acceptance_count/);assert.match(workflow,/uploadRulesAcceptanceCount < 3/);assert.match(identity,/Math\.min\(3, currentCount \+ 1\)/);assert.match(rules,/első három használatakor/)}],
 ["rules-always-readable",()=>{assert.match(transfer,/Szabályok megtekintése/);assert.match(rules,/onMouseEnter/);assert.match(rules,/Kattintással megnyitható és elfogadható/)}],
 ["logical-group-selector",()=>{assert.match(uploader,/Logikai képcsoportok/);assert.match(uploader,/Következő képek csoportja/);assert.match(uploader,/Megjelenített képek/);assert.match(uploader,/Összes · \{queue\.length\}/)}],
 ["camera-group-switch",()=>{assert.match(uploader,/Kamera \/ Galéria célcsoport/);assert.match(uploader,/Következő feltöltés:/)}],
 ["global-group-photo-naming",()=>{assert.match(uploader,/composePhotoLabel/);assert.match(uploader,/Csoport fájlnév-utótagja/);assert.match(uploader,/appendGroupNameToFilename/);assert.match(uploader,/F0001/)}],
 ["optional-folder-export",()=>{assert.match(migration,/export_groups_as_folders boolean not null default false/);assert.match(uploader,/Külön csoportmappák ZIP \/ Drive exportban/);assert.match(drive,/exportGroupsAsFolders !== true/)}],
 ["pdf-report",()=>{assert.match(pdf,/Tokenhivatkozás/);assert.match(pdf,/Üzenet/);assert.match(reportRoute,/application\/pdf/);assert.match(download,/issueDropPackagePdfReportDownload/)}],
 ["txt-report",()=>{assert.match(txt,/Rendezett fájlnév/);assert.match(txt,/Eredeti fájlnév/);assert.match(txt,/Megjegyzés/);assert.match(textRoute,/text\/plain/)}],
 ["download-report-buttons",()=>{assert.match(secure,/PDF-riport/);assert.match(secure,/TXT export/);assert.match(secure,/automatikusan bekerül a ZIP-be/)}],
 ["zip-includes-reports",()=>{assert.match(download,/supplementalFiles/);assert.match(download,/pdfReport\.buffer/);assert.match(download,/textReport\.buffer/);assert.match(zip,/supplementalFiles/)}],
 ["zip-logical-or-folder",()=>{assert.match(download,/workflow\?\.exportGroupsAsFolders/);assert.match(zip,/archiveFolder/);assert.match(zip,/createFolders: Boolean/)}],
 ["masked-token-only",()=>{assert.match(download,/safeTokenReference/);assert.match(pdf,/maszkolt referencia/);assert.match(txt,/teljes hozzáférési token biztonsági okból nem kerül/)}],
 ["drop-v125-version",()=>{assert.match(read("app/lib/drop/dropRuntime.ts"),/DROP 1\.2\.5/);assert.doesNotMatch(read("components/drop/DropPublicTransferClient.tsx"),/DROP 1\.2\.4/)}],
];
let passed=0;
for(const [name,fn] of checks){try{fn();passed++;console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}`,error);process.exitCode=1;}}
console.log(`${passed}/${checks.length} PASS`);
