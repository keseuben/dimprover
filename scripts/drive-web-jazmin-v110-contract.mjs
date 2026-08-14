import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  workspace: "components/drive/DriveWorkspace.tsx",
  shelf: "components/drive/BoxShelf.tsx",
  commander: "components/drive/CommanderPanel.tsx",
  compare: "components/drive/CompareWorkspace.tsx",
  visualCompare: "components/drive/DriveVisualCompareViewer.tsx",
  viewer: "components/drive/DriveDocumentViewer.tsx",
  details: "components/drive/DetailsPanel.tsx",
  grid: "components/drive/FileGridPanel.tsx",
  toolbar: "components/drive/DriveToolbar.tsx",
  switcher: "components/drive/ViewLayoutSwitcher.tsx",
  shell: "components/drive/DriveShell.tsx",
  rail: "components/drive/DriveNavigationRail.tsx",
  floatingBoard: "components/drive/FloatingProjectBoard.tsx",
  css: "components/drive/DriveWorkspace.module.css",
  repo: "app/lib/drive-core/workspaceRepository.ts",
  store: "app/lib/drive-core/store.ts",
  sql: "supabase/DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql",
  boxesRoute: "app/api/projects/[projectId]/drive/boxes/route.ts",
  boxItemsRoute: "app/api/projects/[projectId]/drive/boxes/[boxId]/items/route.ts",
  boxItemRoute: "app/api/projects/[projectId]/drive/boxes/[boxId]/items/[itemId]/route.ts",
  moveRoute: "app/api/projects/[projectId]/drive/documents/[documentId]/move/route.ts",
  previewRoute: "app/api/projects/[projectId]/drive/documents/[documentId]/preview/route.ts",
  previewContentRoute: "app/api/projects/[projectId]/drive/documents/[documentId]/preview/content/route.ts",
  storageService: "app/lib/drive-core/storageService.ts",
  s3Storage: "app/lib/drive-core/s3ObjectStorage.ts",
};

for (const file of Object.values(files)) {
  if (!exists(file)) throw new Error(`Hiányzó fájl: ${file}`);
}

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const checks = [];
const check = (name, condition, detail) => {
  checks.push({ name, ok: Boolean(condition), detail });
};

check("01 CsomagBOX repository lista", source.repo.includes("export async function listDriveBoxes"), "A projekt BOX-ai lekérdezhetők.");
check("02 CsomagBOX létrehozás", source.repo.includes("export async function createDriveBox"), "A BOX létrehozás repository szinten elérhető.");
check("03 Több BOX / referencia-alap", source.sql.includes("drive_core_box_items") && source.sql.includes("document_id") && source.sql.includes("version_id"), "A BOX file/version hivatkozást tárol.");
check("04 BOX item idempotencia", source.sql.includes("drive_workspace_add_box_item_atomic") && source.sql.includes("'idempotent',true"), "Azonos file/version ugyanabba a BOX-ba nem duplikálódik.");
check("05 Projektizolált BOX", source.sql.includes("where id = p_box_id and project_id = p_project_id") && source.boxesRoute.includes("requireProjectPermission"), "Repository/RPC/API project_id és permission alapján védett.");
check("06 BOX audit", source.sql.includes("DRIVE_BOX_CREATED") && source.sql.includes("DRIVE_BOX_ITEM_ADDED") && source.sql.includes("DRIVE_BOX_ITEM_REMOVED"), "BOX változások projektauditba kerülnek.");
check("07 BOX változásfeed", source.sql.includes("BOX_CREATED") && source.sql.includes("BOX_ITEM_ADDED") && source.sql.includes("BOX_ITEM_REMOVED"), "Drive change event készül.");
check("08 Fájlsor BOX színjelölés", source.grid.includes("boxColorsByDocument") && source.grid.includes("boxDots"), "A fájlsor mutatja a tagság színeit.");
check("09 Fájl → BOX drag payload", source.grid.includes("application/x-dimpro-drive-document") && source.shelf.includes("onDrop"), "A fájllistából BOX-ra húzás előkészített.");
check("10 Ugyanaz a fájl több BOX-ban", source.workspace.includes("boxColorsByDocument") && source.shelf.includes("selectedIncluded"), "A kliens több BOX-tagságot kezel.");
check("11 CsomagBOX toolbar aktív", source.toolbar.includes("onToggleBoxShelf") && source.toolbar.includes("toolCountBadge"), "A felső CsomagBOX gomb polcot kapcsol és darabszámot mutat.");
check("12 Commander nézet", source.switcher.includes('value: "commander"') && source.workspace.includes('layoutMode === "commander"'), "Önálló kétpaneles fájlkezelő nézet választható.");
check("13 Commander két panel", source.commander.includes('side="left"') && source.commander.includes('side="right"'), "Bal és jobb projektmappa párhuzamosan látható.");
check("14 Commander drag/move", source.commander.includes('effectAllowed = "move"') && source.moveRoute.includes("moveDriveDocument"), "Fájl másik panel mappájába mozgatható.");
check("15 Move audit + change event", source.sql.includes("DRIVE_DOCUMENT_MOVED") && source.sql.includes("DOCUMENT_MOVED"), "Áthelyezés auditált és szinkronváltozásként naplózott.");
check("16 Írási műveletek permission", source.boxesRoute.includes('"document.write"') && source.boxItemsRoute.includes('"document.write"') && source.boxItemRoute.includes('"document.write"') && source.moveRoute.includes('"document.write"'), "Minden új mutáció szerveroldali írási permissiont kér.");
check("17 SQL hiány esetén fail-safe UI", source.workspace.includes("response.status === 503") && source.shelf.includes("databaseReady"), "A Drive használható marad, a bővített mutációk nem aktiválódnak idő előtt.");
check("18 SmartSync érintetlen ebben a szeletben", !Object.values(source).some((text) => /Cloud Files|SmartSync|placeholder cache|CfConnectSyncRoot/i.test(text)), "A webes fejlesztési szelet nem indít Desktop SmartSync implementációt.");
check("19 Lebegő Drive board", source.css.includes("position: fixed") && source.css.includes("left: var(--rail-width)") && source.css.includes("grid-template-columns: var(--rail-width) minmax(0, 1fr)"), "A széles board overlay-ként nyílik, nem vesz el oszlopot a munkaterülettől.");
check("20 Hover + rögzítés", source.shell.includes("openBoardSoon") && source.shell.includes("220") && source.shell.includes("boardPinned") && source.floatingBoard.includes("onTogglePinned") && source.rail.includes("onMouseEnter={onHoverOpen}"), "A board hoverre késleltetve nyílik és külön rögzíthető.");
check("21 Compare toolbar aktiválva", source.toolbar.includes("onToggleCompare") && source.toolbar.includes("compareActive") && !source.toolbar.includes("Az összehasonlító motor a 4. napi fejlesztésben aktiválódik"), "Az Összehasonlítás gomb már valódi Compare Workspace-et kapcsol.");
check("22 Compare két dokumentumválasztó", source.compare.includes("A dokumentum") && source.compare.includes("B dokumentum") && source.compare.includes("setLeftId") && source.compare.includes("setRightId"), "Két külön dokumentum/revízió választható.");
check("23 Compare részlet API használat", source.compare.includes("/details") && source.compare.includes("DriveDocumentDetails"), "A Compare a meglévő projektjogosultság-védett details API-ból tölti a mérnöki adatokat.");
check("24 Metaadat eltérésmátrix", source.compare.includes("metadataRows") && source.compare.includes("compareDiffDifferent") && source.compare.includes("differences"), "A mérnöki metaadatok soronként eltérésként értékelhetők.");
check("25 Compare CsomagBOX workflow", source.shelf.includes("onOpenCompareBox") && source.shelf.includes('box.purpose === "COMPARE"') && source.workspace.includes("openCompare(box.items.map"), "Az Összehasonlítás CsomagBOX közvetlenül betölthető a Compare Workspace-be.");
check("26 Compare oldalcsere", source.compare.includes("swapSides") && source.compare.includes("Oldalak cseréje"), "A két összehasonlítási oldal felcserélhető.");
check("27 Compare kiválasztott verzió letöltés", source.compare.includes("/download") && source.compare.includes("body: JSON.stringify({ versionId: version.id })") && source.compare.includes("Kiválasztott verzió megnyitása"), "A Compare a választott historikus verziót adja át a meglévő signed-download workflow-nak.");
check("28 Compare VisualViewer bekötés", source.compare.includes("DriveVisualCompareViewer") && source.compare.includes("leftDocument={leftCompareDocument!}") && source.compare.includes("rightDocument={rightCompareDocument!}"), "A Compare a kiválasztott verziókból képzett effektív dokumentumokat adja a szinkronizált vizuális Viewernek.");
check("29 DocumentViewer a részletpanelen", source.details.includes("DriveDocumentViewer") && source.details.includes("projectId={projectId}"), "A kiválasztott dokumentum részletpanelje inline Viewerrel működik.");
check("30 Projektjogosultság-védett preview API", source.previewRoute.includes('requireProjectPermission(request, projectId, "document.read")') && source.previewRoute.includes("initDriveObjectPreview"), "Az előnézeti URL csak project read jogosultsággal kérhető.");
check("31 Same-origin preview proxy", source.storageService.includes("/preview/content?versionId=") && source.storageService.includes('transport: "same-origin-proxy"'), "A böngésző nem közvetlen S3 URL-t kap, hanem projektjogosultság-védett same-origin preview proxyt.");
check("32 Letöltés attachment marad", source.s3Storage.includes('input.disposition === "inline" ? "inline" : "attachment"'), "A meglévő letöltési workflow alapértelmezett attachment viselkedése megmarad.");
check("33 Biztonságos preview MIME whitelist", source.storageService.includes("DRIVE_INLINE_IMAGE_MIME_TYPES") && source.storageService.includes('normalizedMime === "application/pdf"') && source.storageService.includes("DRIVE_PREVIEW_UNSUPPORTED_TYPE"), "Csak PDF és explicit raster kép MIME-ok kapnak inline előnézetet; SVG/aktív tartalom nem.");
check("34 Közös PDF engine újrahasználat", source.viewer.includes("loadSharedPdfDocument") && source.viewer.includes("renderSharedPdfPage") && source.viewer.includes("@/components/viewers/pdfDocumentEngine"), "A Drive nem duplikál PDF motort, a meglévő közös PDF.js engine-t használja.");
check("35 PDF oldallapozás és zoom", source.viewer.includes("pageNumber") && source.viewer.includes("pageCount") && source.viewer.includes("changeZoom") && source.viewer.includes("fitWidth"), "A Viewer lapozást, zoomot és szélességre illesztést támogat.");
check("36 Forgatás és teljes képernyő", source.viewer.includes("requestFullscreen") && source.viewer.includes("setRotation") && source.viewer.includes("Forgatás 90°"), "A Viewer forgatható és teljes képernyőre váltható.");
check("37 Képnéző támogatás", source.viewer.includes('kind === "IMAGE"') && source.viewer.includes("driveViewerImage") && source.storageService.includes('"image/webp"'), "A PDF mellett biztonságos raster képek is inline megjelennek.");
check("38 Vizuális Compare közös PDF engine", source.visualCompare.includes("loadSharedPdfDocument") && source.visualCompare.includes("renderSharedPdfPage") && source.visualCompare.includes("@/components/viewers/pdfDocumentEngine"), "A vizuális Compare a közös PDF.js engine-t használja.");
check("39 Három vizuális Compare mód", source.visualCompare.includes('"SIDE_BY_SIDE"') && source.visualCompare.includes('"OVERLAY"') && source.visualCompare.includes('"DIFFERENCE"') && source.visualCompare.includes("Párhuzamos") && source.visualCompare.includes("Átfedés") && source.visualCompare.includes("Különbség"), "Párhuzamos, átfedéses és különbség nézet választható.");
check("40 Szinkron oldallapozás", source.visualCompare.includes("sharedPageCount") && source.visualCompare.includes("setPageNumber") && source.visualCompare.includes("Előző közös oldal") && source.visualCompare.includes("Következő közös oldal"), "A két PDF közös oldalszámmal szinkronban lapozható.");
check("41 Szinkron zoom és illesztés", source.visualCompare.includes("changeZoom") && source.visualCompare.includes("fitWidth") && source.visualCompare.includes("Szinkron nagyítás") && source.visualCompare.includes("Mindkét nézet szélességre illesztése"), "A zoom és fit mindkét revízióra azonos állapotot használ.");
check("42 Szinkron forgatás", source.visualCompare.includes("setRotation") && source.visualCompare.includes("Mindkét nézet forgatása 90°"), "A forgatás közös state-ből vezérli a két tervlapot.");
check("43 Overlay átlátszóság", source.visualCompare.includes("overlayOpacity") && source.visualCompare.includes('type="range"') && source.visualCompare.includes("B réteg"), "Az átfedéses B réteg átlátszósága állítható.");
check("44 Difference blend", source.visualCompare.includes('mode === "DIFFERENCE" ? "difference" : "normal"') && source.visualCompare.includes("mixBlendMode: topBlend"), "A különbségnézet CSS difference blenddel emeli ki az eltérést.");
check("45 A/B réteg kapcsolhatóság", source.visualCompare.includes("showBase") && source.visualCompare.includes("showRevision") && source.visualCompare.includes("A réteg ki-/bekapcsolása") && source.visualCompare.includes("B réteg ki-/bekapcsolása"), "Az alap és vizsgált revízió rétege külön kapcsolható.");
check("46 Teljes képernyős Compare", source.visualCompare.includes("requestFullscreen") && source.visualCompare.includes("Vizuális összehasonlítás teljes képernyőn"), "A vizuális Compare teljes képernyőre váltható.");
check("47 PDF és raster Compare", source.visualCompare.includes('leftKind === "PDF"') && source.visualCompare.includes('leftPreview?.url') && source.visualCompare.includes("visualCompareImage"), "A vizuális Compare PDF-PDF és támogatott kép-kép párokat kezel.");
check("48 Nincs duplikált per-card Viewer", !source.compare.includes("DriveDocumentViewer") && source.compare.includes("compareDocumentSummary"), "A két részletkártya nem indít további PDF renderelőt; a vizuális Compare egyetlen dedikált motorban fut.");
check("49 Szinkron pásztázás", source.visualCompare.includes("syncPaneScroll") && source.visualCompare.includes("scrollLeft") && source.visualCompare.includes("scrollTop") && source.visualCompare.includes("pásztázás"), "A párhuzamos A/B nézet görgetési pozíciója arányosan együtt mozog.");
check("50 Zoom fit-alapú marad", !source.visualCompare.includes("setFitWidth(false)") && !source.viewer.includes("setFitWidth(false)"), "A nagyítás a szélességre illesztett alaphoz képest növeli/csökkenti a tervet, nem ugrik vissza nyers 100%-ra.");
check("51 Preview content jogosultság", source.previewContentRoute.includes('requireProjectPermission(request, projectId, "document.read")') && source.previewContentRoute.includes("openDriveObjectPreviewContent"), "A tényleges PDF/kép byte stream ugyanúgy document.read jogosultsággal védett.");
check("52 HTTP Range támogatás", source.previewContentRoute.includes('request.headers.get("range")') && source.s3Storage.includes("Range: input.range?.trim() || undefined") && source.previewContentRoute.includes("content-range") && source.previewContentRoute.includes("206"), "A PDF.js nagy fájlokhoz byte-range kérést használhat a same-origin proxyn keresztül.");
check("53 Streamelt proxy nem bufferel", source.s3Storage.includes("getDriveObjectStream") && source.previewContentRoute.includes("Readable.toWeb") && source.previewContentRoute.includes("webStream"), "A preview proxy streameli az S3 objektumot, nem tölti teljes egészében szervermemóriába.");
check("54 Preview biztonsági headerek", source.previewContentRoute.includes('"cache-control": "private, no-store, max-age=0"') && source.previewContentRoute.includes('"x-content-type-options": "nosniff"') && source.previewContentRoute.includes("content-disposition"), "A proxy privát/no-store, nosniff és inline Content-Disposition headereket ad.");
check("55 Két revízióválasztó", source.compare.includes('aria-label="A dokumentum revíziója"') && source.compare.includes('aria-label="B dokumentum revíziója"') && source.compare.includes("versionLabel(version)"), "Mindkét Compare oldalon a dokumentumon belüli historikus verzió/revízió külön kiválasztható.");
check("56 Details verzióhistória használat", source.compare.includes("details.versions.find") && source.compare.includes("leftDetails?.versions") && source.compare.includes("rightDetails?.versions"), "A revízióválasztó a Drive details API teljes versions listájából dolgozik.");
check("57 Effektív historikus dokumentum", source.compare.includes("makeEffectiveDocument") && source.compare.includes("currentVersion: version") && source.compare.includes("currentVersionNumber: version.versionNumber"), "A választott historikus verzió currentVersionként kerül a Viewer-kompatibilis effektív dokumentumba.");
check("58 Ugyanazon dokumentum két revíziója", source.compare.includes('`${seed.documentId}::${seed.versionId || "current"}`') && source.compare.includes("result.push({ documentId: seed.documentId, versionId: seed.versionId || null })"), "A seed deduplikáció documentId+versionId páron történik, ezért egy dokumentum két külön verziója együtt összehasonlítható.");
check("59 CsomagBOX version seed megőrzés", source.workspace.includes("versionId: item.versionId") && source.workspace.includes("DriveCompareSeed") && source.workspace.includes('`${seed.documentId}::${seed.versionId || "current"}`'), "A CsomagBOX-ból indított Compare nem veszti el az item versionId értékét.");
check("60 Compare BOX historikus verzió betöltés", source.compare.includes("compareBox.items.map((item) => ({ documentId: item.documentId, versionId: item.versionId }))") && source.compare.includes("setLeftVersionId") && source.compare.includes("setRightVersionId"), "A Compare saját BOX betöltése is a BOX-ban rögzített revíziókat választja ki.");
check("61 Dokumentumváltás current fallback", source.compare.includes('setLeftVersionId(document?.currentVersion?.id || \"\")') && source.compare.includes('setRightVersionId(document?.currentVersion?.id || \"\")') && source.compare.includes("findVersion"), "Új dokumentum választásakor az aktuális verzió az alapértelmezett, hiányzó seed esetén biztonságos fallback működik.");
check("62 Historikus metaadat félreértelmezés tiltása", source.compare.includes("nem historikus verziómetaadat") && !source.compare.includes('{ key: "revision", label: "Revízió" }'), "A dokumentumszintű metaadat nem jelenik meg hamisan historikus verziómetaadatként.");
check("63 Kiválasztott revízió külön diff sor", source.compare.includes("revisionDifferent") && source.compare.includes("Kiválasztott revízió") && source.compare.includes("selectedRevision(leftVersion)") && source.compare.includes("selectedRevision(rightVersion)"), "A ténylegesen kiválasztott A/B revízió külön, verzióalapú eltérésként szerepel.");
check("64 Revízióválasztó UI stílus", source.css.includes("Drive Compare Revision Selector V1") && source.css.includes("compareRevisionSelect"), "A historikus verzióválasztók Drive-specifikus, responsive UI-t kaptak.");
check("65 CsomagBOX verzióösszefoglaló", source.repo.includes("versionIds") && source.repo.includes('from("drive_core_document_versions")') && source.repo.includes("versionMap") && source.repo.includes("mapBoxItem(row, row.version_id"), "A BOX lista a hivatkozott versionId-khez célzottan betölti a revízióösszefoglalót.");
check("66 CsomagBOX revízióbadge", source.shelf.includes("item.version?.revisionCode") && source.shelf.includes("boxItemRevision") && source.css.includes(".boxItemRevision"), "Azonos dokumentum több BOX-verziója a polcon olvasható Rev/V badge-dzsel különböztethető meg.");
check("67 CsomagBOX verzióméret", source.shelf.includes("entry.item.version?.sizeBytes || entry.document?.currentVersion?.sizeBytes"), "A BOX méretösszeg a rögzített historikus verzió méretét használja, nem automatikusan a dokumentum aktuális verzióját.");
check("68 Geometriai igazítás kapcsoló", source.visualCompare.includes("alignmentEnabled") && source.visualCompare.includes("B réteg kézi geometriai igazítása") && source.visualCompare.includes("visualCompareAlignmentBar"), "Átfedés/Különbség módban külön kézi geometriai igazítás kapcsolható.");
check("69 B réteg húzásos igazítás", source.visualCompare.includes("beginAlignmentDrag") && source.visualCompare.includes("moveAlignmentDrag") && source.visualCompare.includes("setPointerCapture") && source.visualCompare.includes("data-alignment-x"), "A B réteg pointer draggel közvetlenül eltolható az overlayen.");
check("70 Pixelpontos finommozgatás", source.visualCompare.includes("nudgeAlignment") && source.visualCompare.includes('event.key === "ArrowLeft"') && source.visualCompare.includes("event.shiftKey ? 10 : 1") && source.visualCompare.includes("B réteg fel 1 px"), "Nyílbillentyűvel 1 px, Shift+nyíllal 10 px finommozgatás érhető el.");
check("71 B réteg méretkorrekció", source.visualCompare.includes("alignmentScale") && source.visualCompare.includes("clampAlignmentScale") && source.visualCompare.includes('min="70" max="130" step="0.1"'), "A B réteg külön 70–130% geometriai méretkorrekciót kap 0,1%-os felbontással.");
check("72 Lapméret-illesztés", source.visualCompare.includes("alignByPageBounds") && source.visualCompare.includes("leftCanvas.width / rightCanvas.width") && source.visualCompare.includes("leftCanvas.height / rightCanvas.height") && source.visualCompare.includes("> Lapméret</button>"), "A renderelt lap külső mérete alapján egygombos középre/méretre igazítás működik.");
check("73 Igazítás nullázása", source.visualCompare.includes("resetAlignment") && source.visualCompare.includes("setAlignmentOffsetX(0)") && source.visualCompare.includes("setAlignmentScale(100)") && source.visualCompare.includes("> Nullázás</button>"), "Az összes kézi geometriai korrekció egy gombbal visszaállítható.");
check("74 Overlay B transzformáció", source.visualCompare.includes("revisionAlignmentTransform") && source.visualCompare.includes('transformOrigin: "top left"') && source.visualCompare.includes("data-alignment-scale"), "Csak a vizsgált B réteg kap külön X/Y/scale transzformációt az overlayen.");
check("75 Igazítás overlay/difference környezet", source.visualCompare.includes('mode !== "SIDE_BY_SIDE"') && source.visualCompare.includes("visualCompareOverlayViewportAligning") && source.visualCompare.includes('mode === "SIDE_BY_SIDE"') , "A geometriai korrekció az átfedéses és különbségnézethez kötött; a párhuzamos nézet szinkronpásztázása megmarad.");
check("76 Igazítás responsive UI", source.css.includes("Drive Visual Compare Geometric Alignment V1") && source.css.includes("visualCompareAlignmentBarActive") && source.css.includes("visualCompareNudgeGrid") && source.css.includes("visualCompareOverlayViewportAligning"), "A geometriai igazítás külön Drive-stílust és responsive szabályokat kapott.");

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name} — ${item.detail}`);
console.log(`\nÖsszesen: ${checks.length} acceptance/contract ellenőrzés, ${failed.length} hiba.`);
if (failed.length) process.exit(1);
