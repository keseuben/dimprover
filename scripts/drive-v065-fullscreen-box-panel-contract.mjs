import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const bar = read("components/drive/TableFullscreenBar.tsx");
const box = read("components/drive/BoxShelf.tsx");
const drive = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/DriveWorkspace.tsx");
const css = read("components/drive/DriveWorkspace.module.css");

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS ${String(pass + fail).padStart(2, "0")} ${name}`); }
  else { fail += 1; console.error(`FAIL ${String(pass + fail).padStart(2, "0")} ${name}`); }
}

check("fullscreen bar exposes CsomagBOX toggle", bar.includes("onToggleBoxPanel") && bar.includes("PackageCheck"));
check("fullscreen bar exposes BOX count", bar.includes("boxCount") && bar.includes("CsomagBOX{boxCount"));
check("BoxShelf has panel variant", box.includes("variant?: \"shelf\" | \"panel\"") && box.includes("styles.boxShelfPanel"));
check("main Drive renders fullscreen BOX panel", drive.includes("styles.fullTableBoxPanel") && drive.includes("variant=\"panel\""));
check("Projectkapu Drive renders fullscreen BOX panel", gate.includes("richStyles.fullTableBoxPanel") && gate.includes("variant=\"panel\""));
check("main Drive side inspector and BOX panel are exclusive", drive.includes("fullTableInspectorLayout === \"side\"") && drive.includes("setBoxShelfOpen(false)"));
check("Projectkapu side inspector and BOX panel are exclusive", gate.includes("fullTableInspectorLayout === \"side\"") && gate.includes("setBoxShelfOpen(false)"));
check("bottom inspector may coexist with BOX panel", drive.includes("if (next && fullTableInspectorLayout === \"side\")") && gate.includes("if (next && fullTableInspectorLayout === \"side\")"));
check("fullscreen body allocates panel instead of overlaying table", css.includes(".fullTableBoxPanel") && css.includes("flex: 0 0 clamp(300px, 28vw, 420px)"));
check("panel BoxShelf overrides fixed shelf positioning", css.includes(".boxShelfPanel") && css.includes("position: relative") && css.includes("max-height: none"));
check("panel cards are vertical and scrollable", css.includes(".boxShelfPanel .boxCards") && css.includes("grid-template-columns: 1fr") && css.includes("overflow-y: auto"));
check("fullscreen BOX uses existing create/add/remove handlers", drive.includes("onCreateBox={createBox}") && drive.includes("onAddDocument={addDocumentToBox}") && drive.includes("onRemoveItem={removeBoxItem}"));
check("Projectkapu BOX uses existing create/add/remove handlers", gate.includes("onCreateBox={createBox}") && gate.includes("onAddDocument={addDocumentToBox}") && gate.includes("onRemoveItem={removeBoxItem}"));

const result = { ok: fail === 0, contract: "DIMPRO Drive V0.6.5 fullscreen CsomagBOX panel", pass, fail };
console.log(JSON.stringify(result, null, 2));
if (fail) process.exit(1);
