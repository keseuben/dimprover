import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const pngSize = (file) => {
  const data = fs.readFileSync(file);
  assert.equal(data.toString("ascii", 1, 4), "PNG", `${file} nem PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
};
const checks = [];
const contains = (name, source, value) => { assert.ok(source.includes(value), `${name}: hiányzik: ${value}`); checks.push(name); };
const excludes = (name, source, value) => { assert.ok(!source.includes(value), `${name}: tiltott: ${value}`); checks.push(name); };

const manifest = JSON.parse(read("public/drop.webmanifest"));
const sw = read("public/drop-sw.js");
const shell = read("components/drop/DropPwaShell.tsx");
const uploader = read("components/drop/DropPackageQuarantineUpload.tsx");
const capabilityUploader = read("components/drop/DropCapabilityQuarantineUpload.tsx");
const clientId = read("components/drop/dropClientRandomId.ts");
const prep = read("components/drop/dropUploadPreparation.ts");
const groups = read("app/lib/drop/dropGroupService.ts");
const groupApi = read("app/api/drop/spaces/packages/[packageId]/groups/route.ts");
const runtime = read("app/lib/drop/dropRuntime.ts");
const uploadService = read("app/lib/drop/storage/dropUploadService.ts");
const reportRepository = read("app/lib/drop/report/dropReportRepository.ts");
const reportRenderer = read("app/lib/drop/report/dropFinalReportRenderer.ts");
const flags = read("app/lib/drop/dropFeatureFlags.ts");

assert.equal(manifest.display, "standalone"); checks.push("manifest-standalone");
assert.equal(manifest.start_url, "/"); checks.push("manifest-root-start");
assert.equal(manifest.scope, "/"); checks.push("manifest-root-scope");
assert.equal(manifest.icons.length, 2); checks.push("manifest-icons");
for (const [file, expected] of [["public/drop-icon-192.png", 192], ["public/drop-icon-512.png", 512]]) {
  assert.ok(fs.existsSync(file), `${file} hiányzik`);
  const size = pngSize(file);
  assert.equal(size.width, expected); assert.equal(size.height, expected); checks.push(`icon-${expected}`);
}
contains("sw-api-exclusion", sw, 'url.pathname.startsWith("/api/")');
contains("sw-download-exclusion", sw, 'url.pathname.startsWith("/drop/d/")');
contains("sw-upload-exclusion", sw, 'url.pathname.startsWith("/drop/u/")');
contains("sw-report-exclusion", sw, 'url.pathname.startsWith("/drop/report/")');
excludes("sw-no-navigation-cache", sw, 'request.mode === "navigate"');
contains("pwa-drop-host-only", shell, 'window.location.hostname === "drop.dimpro.hu"');
contains("pwa-android-install", shell, "beforeinstallprompt");
contains("pwa-ios-guidance", shell, "Főképernyőhöz adás");
contains("mobile-gallery", uploader, 'accept="image/*"');
contains("mobile-camera", uploader, 'capture="environment"');
contains("multiple-selection", uploader, 'ref={galleryInputRef} type="file" multiple');
contains("simple-advanced-details", uploader, "Haladó beállítások");
contains("group-selector", uploader, "selectedGroupId");
contains("group-create", uploader, "createGroup");
contains("upload-group-id", uploader, "groupId: item.groupId");
contains("sticky-mobile-upload", uploader, "sticky bottom-2");
contains("random-id-fallback", clientId, "getRandomValues");
contains("space-uploader-random-fallback", uploader, "createDropClientRandomId");
contains("capability-uploader-random-fallback", capabilityUploader, "createDropClientRandomId");
contains("client-optimization", prep, "maxLongEdge");
contains("metadata-removal", prep, "EXIF- és GPS-metaadatok eltávolítva");
contains("heic-attempt", prep, "HEIC/HEIF konvertálva");
contains("decode-fallback", prep, "az eredeti kép kerül feltöltésre");
contains("group-access-control", groups, "assertDropSpacePackageUploadAccess");
contains("group-database", groups, '.from("drop_groups")');
contains("group-audit", groups, 'eventType: "mobile.group_created"');
contains("group-api-session", groupApi, "DROP_SPACE_SESSION_COOKIE");
contains("group-api-version", groupApi, 'version: "DROP 0.9.0"');
contains("runtime-mobile-pwa", runtime, "mobilePwa");
contains("runtime-no-private-cache", runtime, "pwaCachesPrivateApiResponses: false");
contains("source-metric-audit", uploadService, "sourceOriginalSizeBytes");
contains("files-api-metric", uploadService, "optimization_saved_percent");
contains("received-file-metric-ui", uploader, "méretmegtakarítás");
contains("report-metric-bundle", reportRepository, "fileSourceMetrics");
contains("report-original-size", reportRenderer, "Mobil eredeti");
contains("report-saved-percent", reportRenderer, "Méretcsökkentés");
contains("release-version", flags, 'version: "DROP 0.9.0"');

console.log(JSON.stringify({ ok: true, version: "DROP 0.9.0", checks: checks.length, names: checks }, null, 2));
