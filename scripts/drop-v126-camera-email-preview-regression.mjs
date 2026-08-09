import assert from "node:assert/strict";
import fs from "node:fs";

const source = {
  zone: fs.readFileSync("components/drop/DropHexUploadZone.tsx", "utf8"),
  publicUploader: fs.readFileSync("components/drop/DropPublicHexUploader.tsx", "utf8"),
  packageUploader: fs.readFileSync("components/drop/DropPackageQuarantineUpload.tsx", "utf8"),
  capabilityUploader: fs.readFileSync("components/drop/DropCapabilityQuarantineUpload.tsx", "utf8"),
  mailProfiles: fs.readFileSync("app/lib/license/mail-profiles.ts", "utf8"),
  preview: fs.readFileSync("app/lib/drop/public/dropPublicEmailPreview.ts", "utf8"),
  email: fs.readFileSync("app/lib/drop/public/dropPublicEmail.ts", "utf8"),
  emailTemplate: fs.readFileSync("app/lib/drop/public/dropPublicEmailTemplate.ts", "utf8"),
  finalize: fs.readFileSync("app/lib/drop/public/dropPublicFinalizeService.ts", "utf8"),
  runtime: fs.readFileSync("app/lib/drop/dropRuntime.ts", "utf8"),
};

let checks = 0;
const names = [];
function has(name, value, pattern) { checks += 1; names.push(name); assert.match(value, pattern, name); }
function lacks(name, value, pattern) { checks += 1; names.push(name); assert.doesNotMatch(value, pattern, name); }

has("camera-file-array-contract", source.zone, /onFiles: \(files: File\[\]\)/);
has("camera-filelist-snapshot", source.zone, /const snapshot = Array\.from\(files \|\| \[\]\)/);
has("camera-reset-before-click", source.zone, /input\.value = "";\s*input\.click\(\)/);
has("camera-input-key-state", source.zone, /cameraInputKey/);
has("camera-input-key-render", source.zone, /key=\{`camera-\$\{cameraInputKey\}`\}/);
has("camera-session-marker", source.zone, /data-drop-camera-session=\{cameraInputKey\}/);
has("camera-session-increment", source.zone, /setCameraInputKey\(\(current\) => current \+ 1\)/);
has("camera-capture-counter", source.zone, /capturedPhotoCount/);
has("camera-new-photo-label", source.zone, /"Újabb fotó"/);
has("camera-repeat-hint", source.zone, /kamerakép hozzáadva/);
has("camera-native-environment", source.zone, /capture="environment"/);
has("camera-mobile-event", source.zone, /DROP_MOBILE_OPEN_CAMERA_EVENT/);
has("camera-public-uploader-array", source.publicUploader, /FileList \| File\[\]/);
has("camera-package-uploader-array", source.packageUploader, /FileList \| File\[\]/);
has("camera-capability-uploader-array", source.capabilityUploader, /FileList \| File\[\]/);

has("mail-attachment-cid-type", source.mailProfiles, /cid\?: string/);
has("mail-inline-disposition-type", source.mailProfiles, /contentDisposition\?: "inline" \| "attachment"/);
has("mail-sender-attachment-type", source.mailProfiles, /attachments\?: DimproMailAttachment\[\]/);
has("preview-sharp", source.preview, /import sharp from "sharp"/);
has("preview-private-s3-read", source.preview, /openDropS3Object/);
has("preview-default-twenty", source.preview, /DEFAULT_MAX_PREVIEWS = 20/);
has("preview-hard-twenty", source.preview, /HARD_MAX_PREVIEWS = 20/);
has("preview-source-limit", source.preview, /DEFAULT_MAX_SOURCE_BYTES/);
has("preview-total-limit", source.preview, /DEFAULT_MAX_TOTAL_PREVIEW_BYTES/);
has("preview-jpeg-output", source.preview, /\.jpeg\(\{ quality: 72/);
has("preview-size-180", source.preview, /THUMBNAIL_WIDTH = 180/);
has("preview-size-120", source.preview, /THUMBNAIL_HEIGHT = 120/);
has("preview-cid-domain", source.preview, /@dimpro\.hu/);
has("preview-inline-attachment", source.preview, /contentDisposition: "inline"/);
has("preview-per-file-fallback", source.preview, /catch \(error\)/);
has("preview-no-public-url", source.preview, /openDropS3Object/);
lacks("preview-no-signed-url", source.preview, /createDropS3InlineUrl|createDropS3DownloadUrl/);

has("email-build-preview-once", source.email, /const previewBundle = await buildDropPublicEmailPreviews/);
has("email-preview-fallback", source.email, /\.catch\(\(\) => emptyPreviewBundle\(\)\)/);
has("email-cid-image", source.emailTemplate, /src="cid:\$\{escapeHtml\(preview\.cid\)\}"/);
has("email-width-180", source.emailTemplate, /width="180" height="120"/);
has("email-all-files", source.email, /input\.files\.map/);
has("email-file-card-table", source.emailTemplate, /role="presentation"/);
has("email-comments", source.emailTemplate, /Megjegyzés:/);
has("email-secure-link-remains", source.emailTemplate, /Letöltési link: \$\{input\.downloadUrl\}/);
has("email-inline-attachments", source.email, /attachments: previewBundle\.attachments\.length \? previewBundle\.attachments/);
lacks("email-original-files-not-attached", source.email, /attachments:\s*input\.files|content:\s*file\./);
has("email-preview-summary", source.emailTemplate, /teljes csomag a biztonságos Drop-linken/);
has("email-preview-metrics", source.email, /previewCount: previewBundle\.previews\.length/);

has("finalize-select-mime", source.finalize, /mime_type,detected_mime_type,is_image/);
has("finalize-select-storage", source.finalize, /storage_provider,storage_bucket,storage_key/);
has("finalize-mail-mime", source.finalize, /mimeType: String\(file\.detected_mime_type/);
has("finalize-mail-image", source.finalize, /isImage: Boolean\(file\.is_image\)/);
has("finalize-mail-storage", source.finalize, /storageKey: String\(file\.storage_key/);
has("finalize-preview-audit", source.finalize, /emailPreviewCount: mail\.previewCount/);
has("finalize-no-original-attachment-audit", source.finalize, /originalFilesAttachedToEmail: false/);
has("finalize-preview-return", source.finalize, /emailPreviews: mail\.previewCount/);

has("runtime-repeated-camera", source.runtime, /repeatedMobileCameraCapture: true/);
has("runtime-email-previews", source.runtime, /emailInlineImagePreviews: true/);
has("runtime-cid-preview", source.runtime, /emailPreviewUsesCidAttachments: true/);
has("runtime-no-original-attachments", source.runtime, /originalFilesAttachedToDeliveryEmail: false/);
has("runtime-private-preview-source", source.runtime, /emailPreviewReadsPrivateObjectStorageServerSide: true/);
has("runtime-no-public-preview-url", source.runtime, /emailPreviewUsesPublicObjectUrl: false/);

console.log(JSON.stringify({ ok: true, version: "DROP 0.9.9", checks, names }, null, 2));
