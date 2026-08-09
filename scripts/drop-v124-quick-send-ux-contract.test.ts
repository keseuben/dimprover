import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const source = async (file: string) => readFile(file, "utf8");
  const [uploader, transfer, workflow, downloadPanel, validatedPage, postgres, types, proxy, preparation, migration] = await Promise.all([
    source("components/drop/DropPublicHexUploader.tsx"),
    source("components/drop/DropPublicTransferClient.tsx"),
    source("app/lib/drop/public/dropPublicWorkflowService.ts"),
    source("components/drop/DropSecureDownloadPanel.tsx"),
    source("components/drop/DropValidatedAccessPage.tsx"),
    source("app/lib/drop/public/dropPublicPostgresRepository.ts"),
    source("app/lib/drop/public/dropPublicTypes.ts"),
    source("proxy.ts"),
    source("components/drop/dropUploadPreparation.ts"),
    source("supabase/DIMPRO_DROP_124_QUICK_SEND_UX.sql"),
  ]);

  const tests: Array<[string, () => void]> = [
    ["ordered-photo-default", () => {
      assert.match(uploader, /useState<DropFileNameRule>\("dimpro_photo"\)/);
      assert.match(uploader, /DIMPRO rendezett fotónév · ajánlott/);
      assert.match(preparation, /photoLabel\?: string/);
      assert.match(preparation, /`F\$\{String\(Math\.max\(1, Math\.floor\(input\.sequenceNumber\)\)\)\.padStart\(4, "0"\)\}`/);
      assert.doesNotMatch(uploader, /000001_helyszini/);
      assert.match(uploader, /F0001_helyszini_bej/);
    }],
    ["global-photo-label", () => {
      assert.match(uploader, /Alap megnevezés az összes fotóhoz/);
      assert.match(uploader, /globalPhotoLabel/);
      assert.match(uploader, /photoLabel: fileNameRule === "dimpro_photo" \? effectivePhotoLabel/);
    }],
    ["group-photo-label", () => {
      assert.match(uploader, /Aktív csoport megnevezése · opcionális felülírás/);
      assert.match(uploader, /groupPhotoLabels/);
      assert.match(uploader, /applyGroupPhotoLabel/);
    }],
    ["per-photo-override", () => {
      assert.match(uploader, /Megnevezés a rendezett fotónév végére/);
      assert.match(uploader, /updatePhotoLabel/);
    }],
    ["collapsed-comment", () => {
      assert.match(uploader, /Megjegyzés azonnal, a kártya megnyitása nélkül/);
      assert.match(uploader, /allowFileComments/);
    }],
    ["queue-undo", () => {
      assert.match(uploader, /Legutóbbi hozzáadás visszavonása/);
      assert.match(uploader, /undoLastAdd/);
    }],
    ["drag-trash", () => {
      assert.match(uploader, /draggable=\{!running && pendingStatus\(item.status\)\}/);
      assert.match(uploader, /Húzza ide a képkártyát a törléshez/);
      assert.match(uploader, /onDrop=/);
    }],
    ["quick-send-self-recipient", () => {
      assert.match(transfer, /Alapértelmezett címzett · saját e-mail/);
      assert.match(transfer, /Kinek küldené még el\? · opcionális/);
      assert.match(workflow, /name: context\.user\.fullName/);
      assert.match(workflow, /email: context\.user\.email\.toLowerCase\(\)/);
      assert.match(workflow, /return \[selfRecipient, \.\.\.requestedExtras\]/);
    }],
    ["quick-message", () => {
      assert.match(transfer, /Üzenet a képek mellé · opcionális/);
      assert.match(transfer, /senderMessage,/);
      assert.doesNotMatch(workflow, /const senderMessage = quickImageSend \? ""/);
    }],
    ["post-send-actions", () => {
      assert.match(uploader, /A képek elküldve/);
      assert.match(uploader, /Új képfeltöltés \/ Send/);
      assert.match(uploader, /Bezárás \/ kezdőlap/);
      assert.match(transfer, /resetForNewTransfer/);
    }],
    ["download-recipient-visibility", () => {
      assert.match(types, /showRecipientsOnDownload\?: boolean/);
      assert.match(postgres, /show_recipients_on_download/);
      assert.match(migration, /default true/);
      assert.match(transfer, /Címzettek megjelenítése a letöltőoldalon/);
      assert.match(validatedPage, /showRecipients: downloadWorkflow\.showRecipientsOnDownload !== false/);
      assert.match(downloadPanel, /Címzettek:/);
    }],
    ["download-summary", () => {
      assert.match(downloadPanel, /fájlokat küldött Önnek/);
      assert.match(downloadPanel, /Tárgy:/);
      assert.match(downloadPanel, /Üzenet:/);
    }],
    ["preview-csp", () => {
      assert.match(proxy, /img-src 'self' data: blob:\$\{dropObjectStorageOrigin/);
    }],
    ["zip-save-before-server", () => {
      const picker = downloadPanel.indexOf("await picker(");
      const fetch = downloadPanel.indexOf('fetch("/api/drop/downloads/package/zip"');
      assert.ok(picker >= 0 && fetch > picker, "A mentési helyet a szerverhívás előtt kell kiválasztani.");
      assert.match(downloadPanel, /A ZIP szerveroldali elkészítése nem indult el/);
      assert.match(downloadPanel, /ZIP letöltés megszakítása/);
      assert.match(downloadPanel, /AbortController/);
    }],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    try { run(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { console.error(`FAIL ${name}:`, error); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} PASS`);
  if (passed !== tests.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
