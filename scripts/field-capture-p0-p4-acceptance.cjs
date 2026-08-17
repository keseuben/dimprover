const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
const page = read('app/field-capture/page.tsx');
const layout = read('app/field-capture/layout.tsx');
const health = read('app/api/field-capture/health/route.ts');
const types = read('app/lib/field-capture/types.ts');
const flags = read('app/lib/field-capture/featureFlags.ts');
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
const pwaShell = read('components/field-capture/FieldCapturePwaShell.tsx');
const manifest = read('public/field-capture-dev.webmanifest');
const sw = read('public/field-capture-sw.js');
const schema = read('supabase/DIMPRO_FIELD_CAPTURE_P0_P4_SCHEMA_DRAFT.sql');

const tests = [
  ['Külön /field-capture route', page.includes('FieldCaptureShell') && flags.includes('route: "/field-capture"')],
  ['Saját FIELD_CAPTURE_ENABLED feature flag', flags.includes('process.env.FIELD_CAPTURE_ENABLED') && page.includes('getFieldCaptureFeatureState')],
  ['Külön Context Module contract', flags.includes('separateContextModule: true')],
  ['Közös Drop Image Engine újrahasználat', image.includes('prepareDropFiles') && image.includes('@/components/drop/dropUploadPreparation')],
  ['HEIC/HEIF a közös Image Engine-ből öröklődik', sharedImage.includes('heic-to/csp') && sharedImage.includes('image/heic') && sharedImage.includes('image/heif')],
  ['Képoptimalizálás shared medium capture profil', image.includes('getDropImageOptimizationOptions("medium", "strip")')],
  ['Maximum 200 terepi kép', types.includes('FIELD_CAPTURE_MAX_ITEMS = 200') && shell.includes('FIELD_CAPTURE_MAX_ITEMS')],
  ['Kamera environment capture', launcher.includes('capture="environment"') && launcher.includes('data-field-capture-camera-input')],
  ['Galéria több kép import', launcher.includes('data-field-capture-gallery-input') && launcher.includes('multiple')],
  ['Fényképezés előtti bottom sheet', sheet.includes('Fényképezés előtti beállítások') && sheet.includes('Mit rögzítsen ehhez a képhez?')],
  ['GPS külön kapcsoló', sheet.includes('GPS helyadat') && types.includes('gpsEnabled: boolean')],
  ['Tájolás külön kapcsoló', sheet.includes('Telefon iránya / tájolás') && types.includes('orientationEnabled: boolean')],
  ['GPS/tájolás alapból OFF', types.includes('gpsEnabled: false') && types.includes('orientationEnabled: false')],
  ['P0-P4 alatt nincs valódi szenzormérés', !shell.includes('navigator.geolocation') && !shell.includes('DeviceOrientationEvent') && health.includes('gpsAdapter: false') && health.includes('orientationAdapter: false')],
  ['Session default menthető', session.includes('preCaptureDefaults') && session.includes('saveFieldCaptureDefaults') && sheet.includes('Ezek legyenek az alapbeállítások')],
  ['Képenként saját opció snapshot', shell.includes('options: { ...options }')],
  ['Telefonra mentés közvetlen download', shell.includes('anchor.download = file.name') && !shell.includes('navigator.share') && shell.includes('file.originalFile')],
  ['Saját Drive és Projektkapu Drive külön cél', destinations.includes('USER_DRIVE') && destinations.includes('PROJECT_DRIVE')],
  ['P8/P9 célok még nem állítják magukról hogy készek', destinations.includes('ready: false') && health.includes('userDriveBinding: false') && health.includes('projectDriveBinding: false')],
  ['Külön Field Capture IndexedDB queue', queue.includes('dimpro-field-capture-v1') && queue.includes('captureItems')],
  ['Offline queue nem tárol tokent/PIN-t', queue.includes('rawSessionTokenStored: false') && queue.includes('uploadCapabilityStored: false') && !queue.includes('sendCode: string')],
  ['LOCAL_ONLY offline-first induló állapot', shell.includes('status: "LOCAL_ONLY"') && types.includes('"LOCAL_ONLY"')],
  ['Közös DIMPRO A-verziós Voice session', voice.includes('DimproBrowserVoiceSession') && voice.includes('@/components/drop/dropBrowserVoiceSession')],
  ['Mikrofonengedély shared helper', voice.includes('requestDropMicrophonePermission')],
  ['Képenként szerkeszthető megjegyzés', card.includes('Megjegyzés a képhez') && card.includes('onNoteChange')],
  ['Külön DEV PWA manifest', layout.includes('/field-capture-dev.webmanifest') && manifest.includes('DIMPRO Terepi Gyorsrögzítő DEV') && manifest.includes('"scope": "/field-capture/"')],
  ['Külön scoped Service Worker', pwaShell.includes('/field-capture-sw.js') && pwaShell.includes('scope: "/field-capture/"') && sw.includes('dimpro-field-capture-static-v010')],
  ['Service Worker nem cache-el capture/API választ', !sw.includes('addEventListener("fetch"') && sw.includes('IndexedDB queue')],
  ['Health endpoint explicit readiness', health.includes('localCapture: true') && health.includes('sharedImageEngine: true') && health.includes('serverCaptureSchema: false')],
  ['Külön capture schema draft', ['field_capture_sessions','field_capture_items','field_capture_asset_refs','field_capture_locations','field_capture_orientations','field_capture_voice_notes','field_capture_destinations','field_capture_events','field_capture_sync_queue'].every((name) => schema.includes(name))],
  ['Schema draft nincs automatikus migrációként deklarálva', schema.includes('NEM FUT LE AUTOMATIKUSAN')],
  ['GPS/heading strukturált rekord és nem EXIF source of truth', schema.includes('accuracy_meters') && schema.includes('heading_degrees') && shell.includes('nem EXIF')],
  ['PWA regisztráció DEV hostra korlátozott', pwaShell.includes('window.location.hostname === "dev.dimpro.hu"')],
];
let failed = 0;
tests.forEach(([name, ok], index) => { if (!ok) failed += 1; console.log(`${String(index + 1).padStart(2,'0')}. ${ok ? 'PASS' : 'FAIL'} - ${name}`); });
console.log(`SUMMARY: ${tests.length - failed}/${tests.length} PASS`);
process.exit(failed ? 1 : 0);
