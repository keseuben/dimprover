#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const switcher = readFileSync("components/drive/ViewLayoutSwitcher.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const projectGate = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");

let pass=0;
const check=(name,ok)=>{assert.ok(ok,name);pass++;console.log(`PASS ${String(pass).padStart(2,"0")} ${name}`);};

const split=switcher.indexOf('value: "split"');
const full=switcher.indexOf("onToggleTableFullscreen &&");
const commander=switcher.indexOf("onChange(commanderMode.value)", full);
check("fullscreen table button sits between Split and Commander", split>=0 && full>split && commander>full);
check("fullscreen table uses dedicated visual class", switcher.includes("layoutTableSpecial") && css.includes(".layoutTableSpecial"));
check("fullscreen table active state is visually distinct", css.includes(".layoutTableSpecialActive"));
check("Escape/fullscreen exit remains wired in main Drive", workspace.includes('event.key === "Escape"') && workspace.includes('fullscreenchange'));
check("Escape/fullscreen exit remains wired in Projectkapu Drive", projectGate.includes('event.key === "Escape"') && projectGate.includes('fullscreenchange'));
check("full table keeps Simple/Engineering/Review view switcher", grid.includes("Egyszerű nézet") && grid.includes("Mérnöki nézet") && grid.includes("Tervellenőrzés"));
check("Drive canonical smallest font token is 10px", css.includes("--drive-font-xs: 10px;"));
check("no explicit 8px fonts remain in Drive workspace CSS", !/font-size:\s*8px/.test(css));
check("no explicit 9px fonts remain in Drive workspace CSS", !/font-size:\s*9px/.test(css));
check("review filters retain discipline topic and workflow state", grid.includes('aria-label="Szakág"') && grid.includes('aria-label="Témakör"') && grid.includes('aria-label="Workflow állapot"'));
check("review table retains clickable detail symbols", grid.includes("reviewSymbol") && grid.includes("onOpenReviewDetail"));
console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.6.3 UI polish",pass,fail:0},null,2));
