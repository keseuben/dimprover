import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const details = read("components/drive/DetailsPanel.tsx");
const css = read("components/drive/DriveWorkspace.module.css");
const standalone = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/DriveWorkspace.tsx");
const handle = read("components/drive/BottomInspectorResizeHandle.tsx");

let pass = 0;
let fail = 0;

function check(name, fn) {
  const index = String(pass + fail + 1).padStart(2, "0");
  try {
    fn();
    pass += 1;
    console.log(`PASS ${index} ${name}`);
  } catch (error) {
    fail += 1;
    console.error(`FAIL ${index} ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

check("Bottom inspector defaults to 50 percent", () => assert.match(css, /\.fullTableInspectorBottom[\s\S]*?flex:\s*0\s+0\s+50%/));
check("Bottom inspector keeps a practical minimum height", () => assert.match(css, /\.fullTableInspectorBottom[\s\S]*?min-height:\s*230px/));
check("Bottom inspector has a vertical resize handle", () => assert.match(css, /\.fullTableInspectorResizeHandle[\s\S]*?cursor:\s*ns-resize/));
check("Resize handle disables touch scrolling during drag", () => assert.match(css, /\.fullTableInspectorResizeHandle[\s\S]*?touch-action:\s*none/));
check("Resize handle uses pointer events", () => assert.match(handle, /onPointerDown=/));
check("Resize handle clamps minimum panel height", () => assert.match(handle, /MIN_PANEL_HEIGHT\s*=\s*230/));
check("Resize handle preserves minimum table height", () => assert.match(handle, /MIN_TABLE_HEIGHT\s*=\s*190/));
check("Double click resets panel to 50 percent", () => assert.match(handle, /panel\.style\.flexBasis\s*=\s*"50%"/));
check("Standalone fullscreen Drive renders resize handle", () => assert.match(standalone, /fullTableInspectorLayout === "bottom" && <BottomInspectorResizeHandle \/>/));
check("ProjectGate fullscreen Drive renders resize handle", () => assert.match(gate, /fullTableInspectorLayout === "bottom" && <BottomInspectorResizeHandle \/>/));
check("Details tab uses structured body mode", () => assert.match(details, /tab === "details" \? styles\.detailsBodyStructured/));
check("Details preview has a dedicated pane", () => assert.match(details, /className=\{styles\.detailsPreviewPane\}/));
check("Details fields have a dedicated pane", () => assert.match(details, /className=\{styles\.detailsFieldsPane\}/));
check("PDF and image viewer is inside preview pane", () => assert.match(details, /detailsPreviewPane[\s\S]*?<DriveDocumentViewer/));
check("Structured details body cannot scroll as one large surface", () => assert.match(css, /\.detailsBody\.detailsBodyStructured[\s\S]*?overflow:\s*hidden/));
check("Data fields pane has its own vertical scrollbar", () => assert.match(css, /\.detailsFieldsPane[\s\S]*?overflow-y:\s*auto/));
check("Data fields pane reserves scrollbar gutter", () => assert.match(css, /\.detailsFieldsPane[\s\S]*?scrollbar-gutter:\s*stable/));
check("Preview pane prevents viewer from covering data pane", () => assert.match(css, /\.detailsPreviewPane[\s\S]*?overflow:\s*hidden/));
check("Bottom Adatok B uses horizontal preview plus data split", () => assert.match(css, /\.detailsSplitCard \.detailsWorkspace[\s\S]*?grid-template-columns:\s*minmax\(320px,\s*1fr\)\s+minmax\(320px,\s*1fr\)/));
check("Narrow screens stack preview and data vertically", () => assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.detailsSplitCard \.detailsWorkspace[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/));
check("Preview viewer fills its dedicated pane", () => assert.match(css, /\.detailsPreviewPane \.driveViewer[\s\S]*?height:\s*100%/));
check("Preview stage grows inside its own pane", () => assert.match(css, /\.detailsPreviewPane \.driveViewerStage[\s\S]*?flex:\s*1\s+1\s+auto/));

console.log(JSON.stringify({ ok: fail === 0, contract: "DIMPRO Drive V0.7.0 resizable Adatok B + structured preview", pass, fail }, null, 2));
if (fail) process.exit(1);
