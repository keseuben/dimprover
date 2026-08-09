import { readFile } from "node:fs/promises";

const files = {
  zip: await readFile("app/lib/drop/download/dropPackageZip.ts", "utf8"),
  service: await readFile("app/lib/drop/download/dropDownloadService.ts", "utf8"),
  route: await readFile("app/api/drop/downloads/package/zip/route.ts", "utf8"),
  panel: await readFile("components/drop/DropSecureDownloadPanel.tsx", "utf8"),
  email: await readFile("app/lib/drop/public/dropPublicEmailTemplate.ts", "utf8"),
  runtime: await readFile("app/lib/drop/dropRuntime.ts", "utf8"),
  proxy: await readFile("proxy.ts", "utf8"),
};
const checks = [];
function has(name, source, pattern) { const ok = pattern.test(source); checks.push({ name, ok }); if (!ok) throw new Error(`Hiányzó ZIP-szerződés: ${name}`); }
function lacks(name, source, pattern) { const ok = !pattern.test(source); checks.push({ name, ok }); if (!ok) throw new Error(`Tiltott ZIP-szerződés: ${name}`); }

has("jszip-stream-engine", files.zip, /generateNodeStream/);
has("stream-files", files.zip, /streamFiles: true/);
has("store-original-files", files.zip, /compression: "STORE"/);
has("max-files-500", files.zip, /DROP_PACKAGE_ZIP_MAX_FILES = 500/);
has("max-bytes-2gb", files.zip, /DROP_PACKAGE_ZIP_MAX_BYTES = 2 \* 1024 \* 1024 \* 1024/);
has("s3-lazy-open", files.zip, /async function\* \(\)[\s\S]*openFile\(file\)/);
has("safe-basename", files.zip, /path\.basename/);
has("path-traversal-clean", files.zip, /replace\(\/\\\.\{2,\}\/g/);
has("duplicate-numbering", files.zip, /const suffix = ` \(\$\{counter\}\)`/);
has("manifest-file", files.zip, /DIMPRO_DROP_fajllista\.txt/);
has("manifest-sha", files.zip, /SHA-256: \$\{file\.sha256\}/);
has("manifest-comments", files.zip, /Megjegyzés: \$\{comment\}/);
has("no-persistent-archive", files.zip, /persistentArchiveCreated: false/);
has("no-recompression", files.zip, /originalFilesRecompressed: false/);

has("download-token-validation", files.service, /validateDropAccessToken\(\{ rawToken: input\.rawToken, expectedPurpose: "download"/);
has("pin-proof-required", files.service, /DROP_DOWNLOAD_PIN_PROOF_REQUIRED/);
has("clean-file-filter", files.service, /security_status !== "clean"[\s\S]*virus_scan_status !== "clean"/);
has("sha-required", files.service, /!file\.sha256/);
has("s3-required", files.service, /file\.storage_provider !== "s3-compatible"/);
has("zip-file-limit", files.service, /DROP_PACKAGE_ZIP_FILE_LIMIT/);
has("zip-size-limit", files.service, /DROP_PACKAGE_ZIP_SIZE_LIMIT/);
has("per-file-audit", files.service, /Promise\.all\(files\.map\(\(file\) => createDropFileDownloadRecord/);
has("ip-user-agent-binding", files.service, /ipHash[\s\S]*userAgentSummary/);
has("zip-started-event", files.service, /package\.download_zip\.started/);
has("zip-completed-event", files.service, /package\.download_zip\.completed/);
has("zip-failed-event", files.service, /package\.download_zip\.failed/);
has("zip-safe-filename", files.service, /safeZipFilename/);

has("proxy-public-allowlist", files.proxy, /pathname === "\/api\/drop\/downloads\/package\/zip"/);
has("post-only-route", files.route, /export async function POST/);
has("host-allowlist", files.route, /ALLOWED_HOSTS/);
has("form-token", files.route, /request\.formData\(\)/);
has("json-token-test-support", files.route, /application\/json/);
has("zip-content-type", files.route, /application\/zip/);
has("content-disposition", files.route, /content-disposition/);
has("no-store-header", files.route, /cache-control.*private, no-store/);
has("nosniff", files.route, /x-content-type-options.*nosniff/);
has("stream-response", files.route, /NodeReadable\.toWeb/);
has("token-not-in-query", files.route, /formData\(\)\)\.get\("token"\)/);
lacks("no-get-route", files.route, /export async function GET/);

has("zip-button", files.panel, /Összes letöltése ZIP-ben/);
has("zip-only-for-multiple", files.panel, /files\.length > 1/);
has("post-form", files.panel, /method="post" action="\/api\/drop\/downloads\/package\/zip"/);
has("hidden-token", files.panel, /type="hidden" name="token" value=\{rawToken\}/);
has("individual-download-remains", files.panel, /Biztonságos letöltés/);
has("source-size", files.panel, /Forrásméret/);
has("persistent-copy-notice", files.panel, /tartós másolat nélkül/);

has("email-zip-notice", files.email, /egyetlen ZIP-csomagban/);
has("runtime-zip-ready", files.runtime, /packageZipDownload: true/);
has("runtime-streaming", files.runtime, /packageZipStreaming: true/);
has("runtime-no-persistent", files.runtime, /packageZipPersistentStorage: false/);
has("runtime-security-block", files.runtime, /requiresCleanFiles: true[\s\S]*requiresDownloadPinProofWhenConfigured: true/);

console.log(JSON.stringify({ ok: true, passed: checks.length, total: checks.length, checks }, null, 2));
