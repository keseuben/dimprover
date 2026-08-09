import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  shell: read("components/drop/DropPwaShell.tsx"),
  dock: read("components/drop/DropMobileDock.tsx"),
  events: read("components/drop/dropMobileEvents.ts"),
  zone: read("components/drop/DropHexUploadZone.tsx"),
  publicUploader: read("components/drop/DropPublicHexUploader.tsx"),
  packageUploader: read("components/drop/DropPackageQuarantineUpload.tsx"),
  capabilityUploader: read("components/drop/DropCapabilityQuarantineUpload.tsx"),
  runtime: read("app/lib/drop/dropRuntime.ts"),
  flags: read("app/lib/drop/dropFeatureFlags.ts"),
  manifest: read("public/drop.webmanifest"),
  serviceWorker: read("public/drop-sw.js"),
};
let checks = 0;
function has(name, source, pattern) { checks += 1; assert.match(source, pattern, name); }
function lacks(name, source, pattern) { checks += 1; assert.doesNotMatch(source, pattern, name); }

has("dock-five-columns", files.dock, /grid-cols-5/);
has("dock-home", files.dock, /href: "\/", label: "Kezdőlap"/);
has("dock-open", files.dock, /href: "\/open", label: "Megnyitás"/);
has("dock-send", files.dock, /href: "\/send", label: "Send"/);
has("dock-menu", files.dock, />Menü</);
has("dock-center-upload", files.dock, /Feltöltési gyorsmenü/);
has("dock-hex-clip", files.dock, /polygon\(25% 2%,75% 2%,98% 50%/);
has("dock-safe-bottom", files.dock, /env\(safe-area-inset-bottom\)/);
has("dock-safe-left", files.dock, /env\(safe-area-inset-left\)/);
has("dock-safe-right", files.dock, /env\(safe-area-inset-right\)/);
has("dock-keyboard-viewport", files.dock, /window\.visualViewport/);
has("dock-keyboard-threshold", files.dock, /> 180/);
has("dock-external-modal", files.dock, /:not\(\[data-drop-mobile-sheet\]\)/);
has("dock-token-routes-hidden", files.dock, /"\/d\/", "\/u\/", "\/p\/", "\/report\/", "\/join\/"/);
has("dock-gallery", files.dock, /trigger\("gallery"\)/);
has("dock-camera", files.dock, /trigger\("camera"\)/);
has("dock-file", files.dock, /trigger\("file"\)/);
has("dock-wake-toggle", files.dock, /Képernyő maradjon bekapcsolva/);
has("dock-install", files.dock, /DIMPRO Drop telepítése/);

has("events-file", files.events, /dimpro-drop-mobile-open-file/);
has("events-gallery", files.events, /dimpro-drop-mobile-open-gallery/);
has("events-camera", files.events, /dimpro-drop-mobile-open-camera/);
has("events-wake", files.events, /dimpro-drop-wake-lock/);
has("events-hook", files.events, /useDropAutomaticWakeLock/);
has("events-cleanup", files.events, /dispatchDropWakeLock\(reason, false\)/);

has("shell-wake-preference", files.shell, /dimpro_drop_keep_awake_v097/);
has("shell-wake-request", files.shell, /wakeLock\.request\("screen"\)/);
has("shell-wake-release", files.shell, /sentinel\.release\(\)/);
has("shell-visibility", files.shell, /visibilitychange/);
has("shell-pageshow", files.shell, /pageshow/);
has("shell-reacquire", files.shell, /requestWakeLockRef\.current/);
has("shell-standalone-default", files.shell, /storedPreference === null \? isStandalone/);
has("shell-local-storage", files.shell, /localStorage\.setItem\(WAKE_PREFERENCE_KEY/);
has("shell-auto-reasons", files.shell, /wakeReasons\.length > 0/);
has("shell-unsupported", files.shell, /"unsupported"/);
has("shell-denied", files.shell, /"denied"/);
has("shell-dataset-active", files.shell, /dataset\.dropWakeLock = "active"/);
has("shell-mobile-padding", files.shell, /safe-area-inset-bottom/);
has("shell-service-worker", files.shell, /register\("\/drop-sw\.js"/);

has("zone-global-file-listener", files.zone, /DROP_MOBILE_OPEN_FILE_EVENT/);
has("zone-global-gallery-listener", files.zone, /DROP_MOBILE_OPEN_GALLERY_EVENT/);
has("zone-global-camera-listener", files.zone, /DROP_MOBILE_OPEN_CAMERA_EVENT/);
has("zone-visible-check", files.zone, /getBoundingClientRect/);
has("zone-data-root", files.zone, /data-drop-upload-zone="true"/);
has("zone-file-data", files.zone, /data-drop-file-input/);
has("zone-gallery-data", files.zone, /data-drop-gallery-input/);
has("zone-camera-data", files.zone, /data-drop-camera-input/);

has("zone-camera-file-snapshot", files.zone, /const snapshot = Array\.from\(files \|\| \[\]\)/);
has("zone-camera-session-key", files.zone, /data-drop-camera-session=\{cameraInputKey\}/);
has("zone-camera-session-increment", files.zone, /setCameraInputKey\(\(current\) => current \+ 1\)/);
has("zone-camera-repeat-label", files.zone, /"Újabb fotó"/);
has("zone-camera-repeat-count", files.zone, /capturedPhotoCount/);

has("public-uploader-wake", files.publicUploader, /useDropAutomaticWakeLock\(`public-uploader:/);
has("public-uploader-wake-busy", files.publicUploader, /preparing \|\| running \|\| finalizing/);
has("package-uploader-wake", files.packageUploader, /useDropAutomaticWakeLock\(`package-uploader:/);
has("package-uploader-wake-busy", files.packageUploader, /preparing \|\| running/);
has("capability-uploader-wake", files.capabilityUploader, /useDropAutomaticWakeLock\(`capability-uploader:/);

has("runtime-version", files.runtime, /version: "DROP 1\.2\.10"/);
has("flags-version", files.flags, /version: "DROP 1\.2\.10"/);
has("runtime-dock", files.runtime, /mobileBottomDock: true/);
has("runtime-wake", files.runtime, /screenWakeLock: true/);
has("runtime-reacquire", files.runtime, /screenWakeLockReacquireOnVisibility: true/);
has("runtime-safe-fallback", files.runtime, /unsupportedWakeLockSafeFallback: true/);

has("runtime-repeated-camera", files.runtime, /repeatedMobileCameraCapture: true/);
has("runtime-camera-input-recreated", files.runtime, /cameraInputRecreatedAfterCapture: true/);

const manifest = JSON.parse(files.manifest);
checks += 1; assert.equal(manifest.display, "standalone", "manifest-standalone");
checks += 1; assert.equal(manifest.shortcuts.length, 3, "manifest-three-shortcuts");
checks += 1; assert.deepEqual(manifest.shortcuts.map((item) => item.url), ["/send", "/open", "/bekuldes"], "manifest-shortcut-urls");
has("service-worker-v098", files.serviceWorker, /dimpro-drop-static-v1210/);
lacks("service-worker-no-private-api-cache", files.serviceWorker, /cache\.put\([^\n]*\/api\//);

console.log(JSON.stringify({ ok: true, version: "DROP 1.2.10", checks }, null, 2));
