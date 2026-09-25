#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const css = readFileSync("components/project-gate/DriveWorkspace.module.css", "utf8");
let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check("business filter contract exists", () => assert.match(ui, /type BusinessFilter = "all" \| "review" \| "valid" \| "issued" \| "rejected" \| "archived"/));
check("review queue covers incoming and pending", () => assert.match(ui, /businessStatus === "BEJOVO"[\s\S]*ELLENORZES_ALATT[\s\S]*reviewDecision === "PENDING"/));
check("valid filter requires approved", () => assert.match(ui, /filter === "valid"[\s\S]*businessStatus === "ERVENYES"[\s\S]*reviewDecision === "APPROVED"/));
check("issued filter recognizes formal issue", () => assert.match(ui, /filter === "issued"[\s\S]*issueStatus === "ISSUED"/));
check("rejected filter exists", () => assert.match(ui, /filter === "rejected"[\s\S]*reviewDecision === "REJECTED"/));
check("archive filter exists", () => assert.match(ui, /businessStatus === "ARCHIV"/));
check("base source-folder-search filters remain independent", () => assert.match(ui, /baseVisibleDocuments/) && assert.match(ui, /sourceFilter/) && assert.match(ui, /folderScope/) && assert.match(ui, /queryMatch/));
check("filter counts are derived from base visible documents", () => assert.match(ui, /businessFilterCounts/) && assert.match(ui, /baseVisibleDocuments\.length/));
check("status toolbar is rendered only with document flow", () => assert.match(ui, /documentFlowReady && <div className=\{styles\.statusFilterBar\}/));
check("status toolbar has stable marker", () => assert.match(ui, /data-drive-business-filter="0\.1\.0"/));
check("status toolbar CSS is horizontally scrollable", () => assert.match(css, /\.statusFilterBar \{[^}]*overflow-x: auto/s));

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
