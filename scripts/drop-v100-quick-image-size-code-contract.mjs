import { readFile } from "node:fs/promises";

const files = {
  preparation: await readFile("components/drop/dropUploadPreparation.ts", "utf8"),
  sizeSelector: await readFile("components/drop/DropImageSizeSelector.tsx", "utf8"),
  metadataSelector: await readFile("components/drop/DropImageMetadataSelector.tsx", "utf8"),
  publicUploader: await readFile("components/drop/DropPublicHexUploader.tsx", "utf8"),
  packageUploader: await readFile("components/drop/DropPackageQuarantineUpload.tsx", "utf8"),
  transfer: await readFile("components/drop/DropPublicTransferClient.tsx", "utf8"),
  workflow: await readFile("app/lib/drop/public/dropPublicWorkflowService.ts", "utf8"),
  codeInput: await readFile("components/drop/DropSixDigitCodeInput.tsx", "utf8"),
  openForm: await readFile("components/drop/DropOpenForm.tsx", "utf8"),
  downloadGate: await readFile("components/drop/DropDownloadPinGate.tsx", "utf8"),
};

const checks = [];
function has(name, source, pattern) {
  const ok = pattern.test(source);
  checks.push({ name, ok });
  if (!ok) throw new Error(`Hiányzó szerződés: ${name}`);
}
function lacks(name, source, pattern) {
  const ok = !pattern.test(source);
  checks.push({ name, ok });
  if (!ok) throw new Error(`Tiltott szerződés: ${name}`);
}

has("large-profile", files.preparation, /large:[\s\S]*label: "Nagy"[\s\S]*maxLongEdge: 3200[\s\S]*quality: 0\.9/);
has("medium-profile", files.preparation, /medium:[\s\S]*label: "Közepes"[\s\S]*maxLongEdge: 2560[\s\S]*quality: 0\.82/);
has("small-profile", files.preparation, /small:[\s\S]*label: "Kicsi"[\s\S]*maxLongEdge: 1600[\s\S]*quality: 0\.74/);
has("original-profile", files.preparation, /original:[\s\S]*label: "Eredeti felbontás"/);
has("metadata-policy-type", files.preparation, /DropImageMetadataPolicy = "strip" \| "preserve"/);
has("strip-default", files.preparation, /metadataPolicy: DropImageMetadataPolicy = "strip"/);
has("preserve-original", files.preparation, /metadataPolicy === "preserve"[\s\S]*enabled: false[\s\S]*maxLongEdge: 0/);
has("strip-reencode", files.preparation, /shouldReencode = options\.metadataPolicy === "strip"/);
has("strip-note", files.preparation, /EXIF- és GPS-metaadatok eltávolítva/);
has("preserve-note", files.preparation, /GPS- és EXIF-metaadatok változatlanul benne maradnak/);

has("size-order", files.sizeSelector, /\["large", "medium", "small", "original"\]/);
has("recommended-prop", files.sizeSelector, /recommendedPreset/);
has("recommended-label", files.sizeSelector, />Ajánlott</);
has("preserve-lock", files.sizeSelector, /preserveMetadata && preset !== "original"/);
has("gps-delete", files.metadataSelector, /GPS-adatok törlése/);
has("gps-delete-recommended", files.metadataSelector, /recommended: true/);
has("gps-preserve", files.metadataSelector, /GPS-adatok megőrzése/);
has("gps-preserve-limit", files.metadataSelector, /méretcsökkentés nem alkalmazható biztonságosan/);

has("public-size-selector", files.publicUploader, /<DropImageSizeSelector/);
has("quick-small-recommended", files.publicUploader, /recommendedPreset=\{imageOnly \? "small" : "medium"\}/);
has("public-metadata-selector", files.publicUploader, /<DropImageMetadataSelector/);
has("preserve-forces-original-public", files.publicUploader, /if \(next === "preserve"\) setImageSizePreset\("original"\)/);
has("gallery-reminder", files.publicUploader, /Törlési emlékeztető/);
has("native-delete-disabled", files.publicUploader, /Automatikus galériatörlés[\s\S]*natív mobilapp/);
has("image-only-accept", files.publicUploader, /imageOnly \? acceptedImageExtensions : acceptedExtensions/);

has("package-size-selector", files.packageUploader, /<DropImageSizeSelector/);
has("package-medium-recommended", files.packageUploader, /recommendedPreset="medium"/);
has("package-metadata-selector", files.packageUploader, /<DropImageMetadataSelector/);
has("preserve-forces-original-package", files.packageUploader, /if \(next === "preserve"\) setImageSizePreset\("original"\)/);
lacks("legacy-one-size-state", files.packageUploader, /setMaxLongEdge|setQuality|optimizeImages/);

has("quick-send-mode", files.transfer, /sendMode[\s\S]*quick_image/);
has("quick-send-only-email", files.transfer, /Cél e-mail-cím/);
has("quick-send-camera-gallery", files.transfer, /Galéria \/ Kamera/);
has("quick-send-small-copy", files.transfer, /Kicsi képméret az ajánlott alap/);
has("quick-uploader-props", files.transfer, /imageOnly=\{Boolean\(created\.workflow\.quickImageSend\)\}[\s\S]*defaultImageSizePreset=\{created\.workflow\.quickImageSend\?"small":"medium"\}/);
has("quick-backend-flag", files.workflow, /quickImageSend = workflowType === "send" && input\.body\.quickImageSend === true/);
has("quick-email-validation", files.workflow, /quickRecipientEmail/);
has("quick-image-mode", files.workflow, /mode: quickImageSend \? "image" : "mixed"/);
has("quick-no-pin", files.workflow, /requireDownloadPin = quickImageSend \? false/);
has("quick-resume", files.workflow, /quickImageSend: workflow\.workflowType === "send" && packageRow\.mode === "image"/);

has("single-code-input", files.codeInput, /slice\(0, 6\)/);
has("code-paste", files.codeInput, /onPaste/);
has("code-auto-complete", files.codeInput, /next\.length === 6[\s\S]*onComplete/);
has("code-one-time", files.codeInput, /autoComplete="one-time-code"/);
has("send-auto-code", files.transfer, /onComplete=\{\(code\)=>void startSendSession\(code\)\}/);
has("open-auto-code", files.openForm, /lastAutoCredentialRef[\s\S]*void submit\(pin\)/);
has("download-auto-code", files.downloadGate, /onComplete=\{\(value\) => void verify\(value\)\}/);
lacks("send-split-code", files.transfer, /Első három számjegy|Utolsó három számjegy|codeLeft|codeRight/);
lacks("open-split-pin", files.openForm, /PIN első három számjegye|PIN utolsó három számjegye|pinLeft|pinRight/);
lacks("download-split-pin", files.downloadGate, /Első három számjegy|Utolsó három számjegy|const \[left|const \[right/);

console.log(JSON.stringify({ ok: true, passed: checks.length, total: checks.length, checks }, null, 2));
