import { createHash } from "node:crypto";
import { once } from "node:events";
import JSZip from "jszip";
import { createDropPackageZipStream, createUniqueDropZipNames } from "../app/lib/drop/download/dropPackageZip";

function sha(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function main() {
const contentA = Buffer.from("DIMPRO ZIP A – magyar ékezetek\n", "utf8");
const contentB = Buffer.from("DIMPRO ZIP B\n", "utf8");
const contentC = Buffer.from([0, 1, 2, 3, 4, 5, 255]);
const files = [
  { id: "a", displayName: "fotó.jpg", sizeBytes: contentA.length, mimeType: "image/jpeg", sha256: sha(contentA), storageKey: "a", comments: ["Első kép megjegyzése."] },
  { id: "b", displayName: "fotó.jpg", sizeBytes: contentB.length, mimeType: "image/jpeg", sha256: sha(contentB), storageKey: "b", comments: [] },
  { id: "c", displayName: "../../veszélyes?.bin", sizeBytes: contentC.length, mimeType: "application/octet-stream", sha256: sha(contentC), storageKey: "c", comments: ["Bináris fájl."] },
];
const source = new Map([["a", contentA], ["b", contentB], ["c", contentC]]);
const names = createUniqueDropZipNames(files);
assert(names.get("a") === "fotó.jpg", "Az első fájlnév nem maradt meg.");
assert(names.get("b") === "fotó (2).jpg", "Az azonos fájlnév nem kapott sorszámot.");
assert(names.get("c") === "veszélyes_.bin", "Az útvonalbejárási név nincs biztonságosan tisztítva.");

const archive = createDropPackageZipStream({
  title: "DIMPRO tesztcsomag",
  publicCode: "ZIP-TEST",
  files,
  openFile: async (file) => ({ body: (async function* () { yield source.get(file.id)!; })() }),
});
const chunks: Buffer[] = [];
archive.stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
await once(archive.stream, "end");
const buffer = Buffer.concat(chunks);
assert(buffer.length > contentA.length + contentB.length + contentC.length, "A ZIP kimenet túl kicsi.");
const zip = await JSZip.loadAsync(buffer);
const keys = Object.keys(zip.files).sort();
assert(keys.includes("fotó.jpg"), "Az első kép hiányzik a ZIP-ből.");
assert(keys.includes("fotó (2).jpg"), "A második, sorszámozott kép hiányzik.");
assert(keys.includes("veszélyes_.bin"), "A tisztított bináris fájl hiányzik.");
assert(keys.includes("DIMPRO_DROP_fajllista.txt"), "A manifest hiányzik.");
assert(!keys.some((key) => key.includes("..") || key.startsWith("/") || key.includes("\\")), "Tiltott útvonal került a ZIP-be.");
assert(Buffer.compare(await zip.file("fotó.jpg")!.async("nodebuffer"), contentA) === 0, "Az első fájl tartalma módosult.");
assert(Buffer.compare(await zip.file("fotó (2).jpg")!.async("nodebuffer"), contentB) === 0, "A második fájl tartalma módosult.");
assert(Buffer.compare(await zip.file("veszélyes_.bin")!.async("nodebuffer"), contentC) === 0, "A bináris fájl tartalma módosult.");
const manifest = await zip.file("DIMPRO_DROP_fajllista.txt")!.async("string");
assert(manifest.includes("DIMPRO tesztcsomag"), "A csomagnév hiányzik a manifestből.");
assert(manifest.includes("ZIP-TEST"), "A csomagkód hiányzik a manifestből.");
assert(manifest.includes(sha(contentA)) && manifest.includes(sha(contentB)) && manifest.includes(sha(contentC)), "SHA-256 érték hiányzik a manifestből.");
assert(manifest.includes("Első kép megjegyzése.") && manifest.includes("Bináris fájl."), "Fájlmegjegyzés hiányzik a manifestből.");
assert(archive.persistentArchiveCreated === false, "A ZIP tartós másolatot jelzett.");
assert(archive.originalFilesRecompressed === false, "Az eredeti fájlokat újratömörítettként jelölte.");
console.log(JSON.stringify({ ok: true, fileCount: archive.fileCount, sourceBytes: archive.totalBytes, zipBytes: buffer.length, keys, manifestBytes: Buffer.byteLength(manifest) }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
