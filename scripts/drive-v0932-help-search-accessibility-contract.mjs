#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const help=read("components/drive/DriveHelpCenter.tsx");
const css=read("components/drive/DriveHelpCenter.module.css");
const build=read("components/drive/driveBuildInfo.ts");
let pass=0;
const check=(name,fn)=>{fn();pass++;console.log("PASS "+String(pass).padStart(2,"0")+" "+name)};
check("Drive version is 0.9.32",()=>assert.match(build,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.32"/));
check("help dialog has labelled accessible dialog semantics",()=>{assert.match(help,/aria-labelledby="drive-help-title"/);assert.match(help,/aria-describedby="drive-help-context"/);assert.match(help,/id="drive-help-title"/);assert.match(help,/id="drive-help-context"/)});
check("search input has an explicit accessible label",()=>assert.match(help,/aria-label="Keresés a DIMPRO Drive Súgóban"/));
check("modal restores focus after closing",()=>{assert.match(help,/previousFocus/);assert.match(help,/previousFocus\?\.isConnected/);assert.match(help,/previousFocus\.focus\(\)/)});
check("modal traps Tab and Shift+Tab inside dialog",()=>{assert.match(help,/event\.key!=="Tab"/);assert.match(help,/dialog\.querySelectorAll<HTMLElement>/);assert.match(help,/event\.shiftKey/);assert.match(help,/last\.focus\(\)/);assert.match(help,/first\.focus\(\)/)});
check("Escape still closes through stable callback ref",()=>{assert.match(help,/event\.key==="Escape"/);assert.match(help,/onCloseRef\.current\(\)/)});
check("search summary counts topics and controls",()=>{assert.match(help,/filteredTopics\.length} témakör/);assert.match(help,/actions\.length} vezérlő/)});
check("topic-only search results are actionable",()=>{assert.match(help,/Talált súgótémák/);assert.match(help,/className=\{styles\.topicResultCard\}/);assert.match(help,/Vezérlőtalálat nincs; válassz a fenti súgótémák közül/)});
check("topic result cards have responsive and dark-theme styling",()=>{assert.match(css,/\.topicResults\{/);assert.match(css,/\.topicResultCard\{/);assert.match(css,/topicResultCard:focus-visible/);assert.match(css,/data-drive-theme="dark"/)});
console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.32 Help search + accessibility UX",pass,fail:0,productionAccess:"DENY"},null,2));
