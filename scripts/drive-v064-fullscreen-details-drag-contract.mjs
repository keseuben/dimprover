import fs from "node:fs";

const ROOT = process.cwd();
const read = (path) => fs.readFileSync(`${ROOT}/${path}`, "utf8");

const bar = read("components/drive/TableFullscreenBar.tsx");
const drive = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/DriveWorkspace.tsx");
const grid = read("components/drive/FileGridPanel.tsx");
const shelf = read("components/drive/BoxShelf.tsx");
const css = read("components/drive/DriveWorkspace.module.css");

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) {
    pass += 1;
    console.log(`PASS ${String(pass).padStart(2, "0")} ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}`);
  }
}

check("fullscreen data panel exposes side layout icon", bar.includes("PanelRightOpen") && bar.includes('onInspectorLayoutChange("side")'));
check("fullscreen data panel exposes bottom layout icon", bar.includes("PanelBottomOpen") && bar.includes('onInspectorLayoutChange("bottom")'));
check("fullscreen bar tracks side/bottom inspector layout", bar.includes('inspectorLayout?: "side" | "bottom"'));
check("main Drive stores fullscreen inspector layout", drive.includes('fullTableInspectorLayout') && drive.includes('useState<"side" | "bottom">("side")'));
check("Projectkapu Drive stores fullscreen inspector layout", gate.includes('fullTableInspectorLayout') && gate.includes('useState<"side" | "bottom">("side")'));
check("main Drive switches bottom inspector class", drive.includes("fullTableInspectorBottom") && drive.includes("fullTableOverlayBottomInspector"));
check("Projectkapu Drive switches bottom inspector class", gate.includes("fullTableInspectorBottom") && gate.includes("fullTableOverlayBottomInspector"));
check("bottom inspector reuses horizontal details layout", drive.includes("detailsSplitCard") && gate.includes("detailsSplitCard") && css.includes(".fullTableInspectorPanelBottom.detailsSplitCard"));
check("bottom inspector defaults to one half workspace height", css.includes("flex: 0 0 50%"));
check("table keeps existing pan gesture", grid.includes("handlePanPointerDown") && grid.includes("dragPanEnabled") && css.includes(".tablePanEnabled"));
check("whole table rows are no longer draggable", !grid.includes("draggable={!dragPanEnabled}"));
check("file icon is the drag handle", (grid.match(/styles\.fileDragHandle/g) || []).length >= 3 && (grid.match(/\bdraggable\b/g) || []).length >= 3);
check("file icon drag does not trigger table pan", (grid.match(/onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/g) || []).length >= 3);
check("drag payload keeps canonical MIME", grid.includes('application/x-dimpro-drive-document') && shelf.includes('application/x-dimpro-drive-document'));
check("drag payload supports selected document group", grid.includes("documentIds") && grid.includes("selectedIds.length > 1"));
check("CsomagBOX accepts selected document group", shelf.includes("documentIds?: string[]") && shelf.includes("sourceIds"));
check("CsomagBOX ignores already included documents", shelf.includes("existingIds") && shelf.includes("uniqueIds"));
check("CsomagBOX adds dropped documents sequentially", shelf.includes("for (const documentId of uniqueIds)") && shelf.includes("await onAddDocument(boxId, document)"));
check("file drag handle has dedicated visual affordance", css.includes(".fileDragHandle") && css.includes("cursor: grab"));
check("fullscreen v0.2 marker active in both workspaces", drive.includes('data-drive-full-table="0.2.0"') && gate.includes('data-project-gate-drive-full-table="0.2.0"'));

console.log(JSON.stringify({ ok: fail === 0, contract: "DIMPRO Drive V0.6.4 fullscreen details + CsomagBOX icon drag", pass, fail }, null, 2));
if (fail) process.exit(1);
