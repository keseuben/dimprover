const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
const page = read('app/drop/terep/page.tsx');
const legacyPage = read('app/field-capture/page.tsx');
const legacyLayout = read('app/field-capture/layout.tsx');
const health = read('app/api/field-capture/health/route.ts');
const types = read('app/lib/field-capture/types.ts');
const flags = read('app/lib/field-capture/featureFlags.ts');
const sensors = read('app/lib/field-capture/captureSensors.ts');
const image = read('app/lib/field-capture/captureImageEngine.ts');
const sharedImage = read('components/drop/dropUploadPreparation.ts');
const session = read('app/lib/field-capture/captureSessionService.ts');
const queue = read('app/lib/field-capture/offlineQueue.ts');
const destinations = read('app/lib/field-capture/destinationRouter.ts');
const launcher = read('components/field-capture/CameraLauncher.tsx');
const sheet = read('components/field-capture/PreCaptureOptionsSheet.tsx');
const shell = read('components/field-capture/FieldCaptureShell.tsx');
const card = read('components/field-capture/CapturePreviewCard.tsx');
const voice = read('components/field-capture/VoiceNotePanel.tsx');
const editor = read('components/image-editor/DimproImageMarkupEditor.tsx');
const gate = read('components/field-capture/TerepAccessGate.tsx');
const dropLayout = read('app/drop/layout.tsx');
const dropShell = read('components/drop/DropPwaShell.tsx');
const dropDock = read('components/drop/DropMobileDock.tsx');
const dropLanding = read('app/drop/page.tsx');
const dropManifest = read('public/drop.webmanifest');
const dropDevManifest = read('public/drop-dev.webmanifest');
const schema = read('supabase/DIMPRO_FIELD_CAPTURE_P0_P4_SCHEMA_DRAFT.sql');
const proxy = read('proxy.ts');
const dropPublicPageBlock = proxy.slice(proxy.indexOf('const isDropPublicPage ='), proxy.indexOf('const isDropIdentityPublicApiRoute'));
const dropPublicApiBlock = proxy.slice(proxy.indexOf('const isDropPublicApiRoute ='), proxy.indexOf('const isDropInternalPage'));
const generalPublicApiBlock = proxy.slice(proxy.indexOf('const isPublicApiRoute ='), proxy.indexOf('const isPublicAruterPage'));

const tests = [
  ['Kanonikus Drop /terep route', page.includes('TerepAccessGate') && flags.includes('route: "/terep"')],
  ['Terep külön Context Module marad', flags.includes('separateContextModule: true') && fs.existsSync('app/lib/field-capture/types.ts')],
  ['Régi /field-capture a Drop Terepre irányít', legacyPage.includes('drop.dev.dimpro.hu/terep') && legacyPage.includes('drop.dimpro.hu/terep')],
  ['Régi route már nem regisztrál külön PWA shellt', !legacyLayout.includes('FieldCapturePwaShell') && !legacyLayout.includes('field-capture-dev.webmanifest')],
  ['Drop PWA manifest kezeli a Terepet', dropLayout.includes('/drop-dev.webmanifest') && dropLayout.includes('/drop.webmanifest') && dropManifest.includes('"url": "/terep"') && dropDevManifest.includes('"url": "/terep"')],
  ['Drop PWA közös service worker marad', dropShell.includes('/drop-sw.js') && !dropShell.includes('field-capture-sw.js')],
  ['Drop landing felső Terep CTA', dropLanding.includes('href="/terep"') && dropLanding.includes('MapPinned')],
  ['Mobil Drop menüben Terep elérhető', dropDock.includes('href="/terep"') && dropDock.includes('MapPinned')],
  ['Drop host engedi a /terep oldalt', dropPublicPageBlock.includes('pathname === "/terep"')],
  ['Terep ugyanazt a Send Identity verify API-t használja', gate.includes('/api/dimpro-identity/send/verify') && gate.includes('dimpro.drop.sendCode.v1')],
  ['Külön Terep licenc nincs bevezetve', gate.includes('canUseStandardSend') && gate.includes('canUseQuickImageSend') && !gate.includes('canUseFieldCapture')],
  ['Send session token csak memóriában kerül a shellbe', gate.includes('sessionToken: identity.sendSession.token') && !queue.includes('sessionToken: string')],
  ['Közös Drop Image Engine újrahasználat', image.includes('prepareDropFiles') && image.includes('@/components/drop/dropUploadPreparation')],
  ['HEIC/HEIF a közös Image Engine-ből öröklődik', sharedImage.includes('heic-to/csp') && sharedImage.includes('image/heic') && sharedImage.includes('image/heif')],
  ['Képoptimalizálás shared medium capture profil', image.includes('getDropImageOptimizationOptions("medium", "strip")')],
  ['Maximum 200 terepi kép', types.includes('FIELD_CAPTURE_MAX_ITEMS = 200') && shell.includes('FIELD_CAPTURE_MAX_ITEMS')],
  ['Kamera environment capture', launcher.includes('capture="environment"') && launcher.includes('data-field-capture-camera-input')],
  ['Galéria több kép import', launcher.includes('data-field-capture-gallery-input') && launcher.includes('multiple')],
  ['Kamera/Galéria közvetlen user gesture-ből nyílik', shell.includes('if (source === "camera") launcherRef.current?.openCamera();') && shell.includes('else launcherRef.current?.openGallery();') && !shell.includes('window.setTimeout(() => source === "camera"')],
  ['GPS külön kapcsoló alapból OFF', sheet.includes('GPS helyadat') && types.includes('gpsEnabled: false')],
  ['Kamerairány külön kapcsoló alapból OFF', sheet.includes('Hátlapi kamera iránya') && types.includes('orientationEnabled: false')],
  ['GPS valós browser geolocation adapter', sensors.includes('navigator.geolocation.getCurrentPosition') && sensors.includes('enableHighAccuracy: true')],
  ['GPS webhelyengedély állapota lekérdezhető', sensors.includes('navigator.permissions.query') && sensors.includes('getFieldLocationPermissionState')],
  ['GPS külön felhasználói engedélykérés', sheet.includes('data-terep-location-permission-button') && sheet.includes('Helyhozzáférés engedélyezése') && sheet.includes('requestGpsPermission')],
  ['GPS engedély megtagadása nem blokkolja a képet', sheet.includes('A kép GPS nélkül is elkészíthető.') && sheet.includes('onChoose(draft, "camera")')],
  ['GPS pontosság és LOW_ACCURACY státusz', sensors.includes('LOW_ACCURACY_METERS') && sensors.includes('accuracyMeters') && sensors.includes('"LOW_ACCURACY"')],
  ['GPS timeout nem blokkolja a capture-t', sensors.includes('timeout: LOCATION_TIMEOUT_MS') && shell.indexOf('setItems((current) => [...current, ...created])') < shell.indexOf('captureFieldSensors(options)')],
  ['Tájolás DeviceOrientation adapter', sensors.includes('deviceorientationabsolute') && sensors.includes('deviceorientation') && sensors.includes('webkitCompassHeading')],
  ['iOS tájolási permission user gesture-ből kérhető', sheet.includes('requestFieldOrientationPermission') && sensors.includes('requestPermission')],
  ['Tájolás É/ÉK/K iránylabel', sensors.includes('["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"]')],
  ['Bizonytalan tájolás UNSTABLE', sensors.includes('"UNSTABLE"') && card.includes('bizonytalan')],
  ['GPS és heading strukturált FieldCaptureItem rekord', types.includes('FieldCaptureLocationRecord') && types.includes('FieldCaptureOrientationRecord') && types.includes('location: FieldCaptureLocationRecord') && types.includes('orientation: FieldCaptureOrientationRecord')],
  ['GPS/tájolás külön IndexedDB rekordként mentődik', queue.includes('location: item.location') && queue.includes('orientation: item.orientation')],
  ['Régi IndexedDB sor kompatibilisen visszaáll', queue.includes('row.location ||') && queue.includes('row.orientation ||')],
  ['GPS újramérés elérhető', card.includes('GPS újramérés') && shell.includes('remeasureLocation')],
  ['Kamerairány újramérés elérhető', card.includes('Kamerairány újramérés') && shell.includes('remeasureOrientation')],
  ['GPS UI ± méteres pontosság', card.includes('GPS ±') && card.includes('accuracyMeters')],
  ['Heading UI fok + égtáj', card.includes('headingDegrees') && card.includes('directionLabel')],
  ['Session default menthető', session.includes('preCaptureDefaults') && session.includes('saveFieldCaptureDefaults') && sheet.includes('Ezek legyenek az alapbeállítások')],
  ['Képenként saját opció snapshot', shell.includes('options: { ...options }')],
  ['Telefonra mentés közvetlen download', shell.includes('anchor.download = file.name') && !shell.includes('navigator.share') && shell.includes('file.originalFile')],
  ['Saját Drive és Projektkapu Drive külön cél', destinations.includes('USER_DRIVE') && destinations.includes('PROJECT_DRIVE')],
  ['P8/P9 Drive binding még nincs késznek jelölve', destinations.includes('ready: false') && health.includes('userDriveBinding: false') && health.includes('projectDriveBinding: false')],
  ['Külön Terep IndexedDB queue', queue.includes('dimpro-field-capture-v1') && queue.includes('captureItems')],
  ['Offline queue nem tárol tokent/PIN-t', queue.includes('rawSessionTokenStored: false') && queue.includes('uploadCapabilityStored: false') && !queue.includes('sendCode: string')],
  ['LOCAL_ONLY offline-first induló állapot', shell.includes('status: "LOCAL_ONLY"') && types.includes('"LOCAL_ONLY"')],
  ['Közös DIMPRO A-verziós Voice session', voice.includes('DimproBrowserVoiceSession') && voice.includes('@/components/drop/dropBrowserVoiceSession')],
  ['Mikrofonengedély shared helper', voice.includes('requestDropMicrophonePermission')],
  ['Képenként szerkeszthető megjegyzés', card.includes('Megjegyzés a képhez') && card.includes('onNoteChange')],
  ['Health P0-P6 és szenzor readiness true', flags.includes('phase: "P0-P6"') && health.includes('gpsAdapter: true') && health.includes('orientationAdapter: true')],
  ['Field Capture/Terep health Drop hoston is publikus', dropPublicApiBlock.includes('pathname === "/api/field-capture/health"') && generalPublicApiBlock.includes('pathname === "/api/field-capture/health"')],
  ["P7 session/item API Drop hoston elérhető", dropPublicApiBlock.includes(`pathname === "/api/field-capture/sessions"`) && dropPublicApiBlock.includes(`pathname.startsWith("/api/field-capture/sessions/")`) && generalPublicApiBlock.includes(`pathname === "/api/field-capture/sessions"`)],
  ['Külön capture schema draft megmarad', ['field_capture_sessions','field_capture_items','field_capture_asset_refs','field_capture_locations','field_capture_orientations','field_capture_voice_notes','field_capture_destinations','field_capture_events','field_capture_sync_queue'].every((name) => schema.includes(name))],
  ['Schema draft nincs automatikus migrációként deklarálva', schema.includes('NEM FUT LE AUTOMATIKUSAN')],
  ['GPS/heading source of truth nem EXIF', schema.includes('accuracy_meters') && schema.includes('heading_degrees') && shell.includes('nem EXIF')],
  ['Háromlépéses Terep workflow', shell.includes('Rögzítés') && shell.includes('Ellenőrzés') && shell.includes('Mentés') && shell.includes('Tovább az ellenőrzéshez') && shell.includes('Tovább a mentéshez')],
  ['Mentés lépés nem állít hamis szerveres szinkront', shell.includes('P7 szerveres DIMPRO szinkron') && shell.includes('nem állítja, hogy a képek felhőbe kerültek')],
  ['Közös DIMPRO Képjelölő komponens', editor.includes('DIMPRO Képjelölő') && editor.includes('pen') && editor.includes('arrow') && editor.includes('crop')],
  ['Terep képkártyán szerkesztés elérhető', card.includes('Kép szerkesztése / jelölése') && shell.includes('DimproImageMarkupEditor')],
  ['Szerkesztett munkapéldány újra optimalizálódik', shell.includes('saveEditedImage') && shell.includes('prepareFieldCaptureFiles([result.file]') && shell.includes('edited: true')],
  ['Szerkesztési állapot IndexedDB-ben megmarad', queue.includes('edited: item.edited') && queue.includes('editRevision: item.editRevision') && queue.includes('edited: Boolean(row.edited)')],
  ['Kamerairány a hátlapi -z vektorból számolódik', sensors.includes('Rz(alpha) * Rx(beta) * Ry(gamma) * [0, 0, -1]') && sensors.includes('cameraHeadingFromDeviceOrientation') && sensors.includes('horizontalProjection')],
  ['Kamerairány több szenzorminta körátlagából készül', sensors.includes('TARGET_ORIENTATION_SAMPLES') && sensors.includes('circularMean') && sensors.includes('absoluteSamples')],
  ["GPS tiltásnál böngésző engedélyezési útmutató látható", (card.includes("webhelyinformáció") || sheet.includes("webhelyinformáció")) && sheet.includes("Engedélyek") && sheet.includes("Hely") && sheet.includes("Engedélyezés")],
  ['Mobil workflow akciósáv a Drop dock fölött marad', shell.includes('data-terep-workflow-actions') && shell.includes('sticky z-[130]') && shell.includes('calc(84px + env(safe-area-inset-bottom))')],
];
let failed = 0;
tests.forEach(([name, ok], index) => { if (!ok) failed += 1; console.log(`${String(index + 1).padStart(2,'0')}. ${ok ? 'PASS' : 'FAIL'} - ${name}`); });
console.log(`SUMMARY: ${tests.length - failed}/${tests.length} PASS`);
process.exit(failed ? 1 : 0);
