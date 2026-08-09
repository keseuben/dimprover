import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildDropPublicDeliveryEmailContent } from "../app/lib/drop/public/dropPublicEmailTemplate";
import { createDropPackageZipStream } from "../app/lib/drop/download/dropPackageZip";

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function main() {
  const files = Array.from({ length: 14 }, (_, index) => ({
    id: `file-${index + 1}`,
    name: `260808_1129_260808_F${String(index + 1).padStart(4, "0")}_helyszini_gepeszet.jpg`,
    sizeBytes: 120_000 + index,
    comments: [`Megjegyzés ${index + 1}`],
    mimeType: "image/jpeg",
    isImage: true,
    storageKey: `test/${index + 1}.jpg`,
    storageBucket: "test",
    directUrl: `https://drop.dimpro.hu/api/drop/downloads/file/${index + 1}?token=test&inline=1`,
  }));
  const previews = files.map((file, index) => ({
    fileId: file.id,
    cid: `image-${index + 1}@dimpro.hu`,
    filename: `preview-${index + 1}.jpg`,
    content: Buffer.from([index + 1]),
    contentType: "image/jpeg" as const,
    width: 180,
    height: 120,
    sizeBytes: 1,
  }));
  const mail = buildDropPublicDeliveryEmailContent({
    recipientName: "Keserű Benjámin",
    allRecipients: [
      { name: "Keserű Benjámin", email: "keseru.benjamin@nagisz.hu" },
      { name: "Csató Ferenc", email: "csato.ferenc@nagisz.hu" },
    ],
    showRecipients: true,
    uploaderName: "Keserű Benjámin",
    uploaderEmail: "keseru.benjamin@nagisz.hu",
    subject: "Mobilfotók – 2026. aug. 8. 11:29",
    senderMessage: "Próba fotó küldés.",
    packageNote: "",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    files,
    downloadUrl: "https://drop.dimpro.hu/d/test",
    downloadPin: null,
    previewBundle: { previews, attachments: [], eligibleCount: 14, attemptedCount: 14, skippedCount: 0, errors: [], totalBytes: 14 },
  });
  assert.match(mail.html, /14 kép kis előnézete beágyazva/);
  assert.equal((mail.html.match(/src="cid:image-/g) || []).length, 14);
  assert.equal((mail.html.match(/Kép megnyitása új ablakban/g) || []).length, 14);
  assert.match(mail.html, /Keserű Benjámin/);
  assert.match(mail.html, /Csató Ferenc/);
  assert.match(mail.html, /Próba fotó küldés/);
  console.log("PASS email-14-of-14-previews-clickable-summary");

  const sourceFiles = [
    { id: "a", displayName: "F0001_gepeszet.jpg", sizeBytes: 3, mimeType: "image/jpeg", sha256: "a".repeat(64), storageKey: "a", archiveFolder: null },
    { id: "b", displayName: "F0002_villamos.jpg", sizeBytes: 3, mimeType: "image/jpeg", sha256: "b".repeat(64), storageKey: "b", archiveFolder: null },
  ];
  const openFile = async (file: { id: string }) => ({ body: (async function*(){ yield Buffer.from(file.id.repeat(3)); })() });
  const flat = createDropPackageZipStream({
    title: "Teszt",
    publicCode: "DMP-TEST",
    files: sourceFiles,
    supplementalFiles: [{ name: "DIMPRO_DROP_csomagriport.pdf", data: Buffer.from("PDF") }, { name: "DIMPRO_DROP_megjegyzesek.txt", data: "TXT" }],
    openFile,
  });
  const flatZip = await JSZip.loadAsync(await streamToBuffer(flat.stream));
  const flatNames = Object.keys(flatZip.files).sort();
  assert.ok(flatNames.includes("F0001_gepeszet.jpg"));
  assert.ok(flatNames.includes("F0002_villamos.jpg"));
  assert.ok(flatNames.includes("DIMPRO_DROP_csomagriport.pdf"));
  assert.ok(flatNames.includes("DIMPRO_DROP_megjegyzesek.txt"));
  assert.ok(flatNames.includes("DIMPRO_DROP_fajllista.txt"));
  assert.equal(flat.sourceFileCount, 2);
  assert.equal(flat.supplementalFileCount, 2);
  assert.equal(flat.fileCount, 5);
  console.log("PASS zip-flat-with-pdf-txt-manifest");

  const grouped = createDropPackageZipStream({
    title: "Teszt",
    publicCode: "DMP-TEST",
    files: [
      { ...sourceFiles[0], archiveFolder: "Gépészet" },
      { ...sourceFiles[1], archiveFolder: "Villamos" },
    ],
    supplementalFiles: [{ name: "DIMPRO_DROP_csomagriport.pdf", data: Buffer.from("PDF") }, { name: "DIMPRO_DROP_megjegyzesek.txt", data: "TXT" }],
    openFile,
  });
  const groupedZip = await JSZip.loadAsync(await streamToBuffer(grouped.stream));
  const groupedNames = Object.keys(groupedZip.files).sort();
  assert.ok(groupedNames.includes("Gépészet/F0001_gepeszet.jpg"));
  assert.ok(groupedNames.includes("Villamos/F0002_villamos.jpg"));
  assert.ok(groupedNames.includes("DIMPRO_DROP_csomagriport.pdf"));
  assert.ok(groupedNames.includes("DIMPRO_DROP_megjegyzesek.txt"));
  console.log("PASS zip-optional-group-folders-reports-at-root");
}

main().catch((error) => { console.error(error); process.exit(1); });
