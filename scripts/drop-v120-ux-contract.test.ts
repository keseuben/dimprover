import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildDropPhotoDisplayName,
  sanitizeDropOriginalFileName,
} from "../components/drop/dropUploadPreparation";

async function main() {
  const source = async (file: string) => readFile(file, "utf8");
  const [transfer, workflow, mailProfiles, dropEmail, downloadPanel, downloadService, zipRoute, dock, licenseCenter, identityAdmin] = await Promise.all([
    source("components/drop/DropPublicTransferClient.tsx"),
    source("app/lib/drop/public/dropPublicWorkflowService.ts"),
    source("app/lib/license/mail-profiles.ts"),
    source("app/lib/drop/dropEmail.ts"),
    source("components/drop/DropSecureDownloadPanel.tsx"),
    source("app/lib/drop/download/dropDownloadService.ts"),
    source("app/api/drop/downloads/package/zip/route.ts"),
    source("components/drop/DropMobileDock.tsx"),
    source("app/admin/licenckozpont/page.tsx"),
    source("app/lib/identity-core/admin.ts"),
  ]);
  
  const tests: Array<[string, () => void]> = [
    ["standardized-original-name", () => assert.equal(
      sanitizeDropOriginalFileName("Helyszíni fotó #12 (Északi oldal).JPG", false),
      "Helyszini_foto_12_Eszaki_oldal.jpg",
    )],
    ["preserved-original-name", () => assert.equal(
      sanitizeDropOriginalFileName("Helyszíni fotó #12 (Északi oldal).JPG", true),
      "Helyszíni fotó #12 (Északi oldal).jpg",
    )],
    ["ordered-photo-name", () => assert.equal(
      buildDropPhotoDisplayName({
        originalName: "IMG_1234.JPG",
        outputExtension: "jpg",
        capturedAt: new Date(2026, 7, 7, 23, 59, 0),
        uploadedAt: new Date(2026, 7, 8, 12, 34, 56),
        sequenceNumber: 1,
        customLabel: "helyszíni fotó",
      }),
      "260807_2359_260808_F0001_helyszini_foto.jpg",
    )],
    ["send-code-local-storage", () => {
      assert.match(transfer, /dimpro\.drop\.sendCode\.v1/);
      assert.match(transfer, /localStorage\.setItem\(DROP_SEND_CODE_STORAGE_KEY/);
      assert.match(transfer, /localStorage\.removeItem\(DROP_SEND_CODE_STORAGE_KEY/);
      assert.match(transfer, /Mentett Send-kód törlése/);
    }],
    ["quick-multi-recipient-ui", () => {
      assert.match(transfer, /Alapból Ön kapja meg a küldeményt/);
      assert.match(transfer, /recipients: quickRecipients/);
      assert.match(transfer, /Kinek küldené még el\?/);
    }],
    ["quick-multi-recipient-server", () => {
      assert.match(workflow, /const selfRecipient: DropRecipientInput/);
      assert.match(workflow, /return \[selfRecipient, \.\.\.requestedExtras\]/);
      assert.match(workflow, /slice\(0, context\.entitlement\.maxRecipients\)/);
    }],
    ["manual-send-code-only", () => {
      assert.match(identityAdmin, /normalizeDimproSendCode\(input\.sendCode\)/);
      assert.match(identityAdmin, /A Send-kód megadása kötelező/);
      assert.match(licenseCenter, /Automatikus generálás nincs/);
      assert.match(licenseCenter, /Saját Send-kód aktiválása/);
    }],
    ["license-max-recipients", () => {
      assert.match(licenseCenter, /Max\. címzett/);
      assert.match(licenseCenter, /maxRecipients/);
    }],
    ["drop-mail-profile", () => {
      assert.match(mailProfiles, /id: "drop"[\s\S]*address: "ertesites\.drop@dimpro\.hu"/);
      assert.match(mailProfiles, /id: "drive"[\s\S]*address: "ertesites\.drive@dimpro\.hu"/);
      assert.match(dropEmail, /profileId: "drop"/);
    }],
    ["album-layout", () => {
      assert.match(downloadPanel, /grid-cols-2[\s\S]*md:grid-cols-3[\s\S]*xl:grid-cols-4/);
      assert.match(downloadPanel, /target="_blank"/);
      assert.match(downloadPanel, /Képre kattintva a teljes kép új böngészőfülön nyílik meg/);
      assert.match(downloadPanel, /"Letöltés"/);
      assert.match(downloadService, /createDropS3InlineUrl/);
    }],
    ["zip-brand-prefix", () => {
      assert.match(downloadPanel, /DIMPRO_ előtag a ZIP nevéhez/);
      assert.match(zipRoute, /brandPrefix/);
      assert.match(downloadService, /brandPrefix \? "DIMPRO_" : ""/);
    }],
    ["mobile-dock-layout", () => {
      assert.match(dock, /h-\[76px\][\s\S]*items-center/);
      assert.match(dock, /h-\[66px\] w-\[66px\]/);
      assert.doesNotMatch(dock, /items-end gap-1/);
    }],
  ];
  
  let passed = 0;
  for (const [name, run] of tests) {
    try {
      run();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}:`, error);
      process.exitCode = 1;
    }
  }
  console.log(`${passed}/${tests.length} PASS`);
  if (passed !== tests.length) process.exitCode = 1;

}

main().catch((error) => { console.error(error); process.exitCode = 1; });
