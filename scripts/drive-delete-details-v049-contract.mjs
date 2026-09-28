#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const details = readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const main = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const project = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const rollback = readFileSync("supabase/rollback/DRIVE_DOCUMENT_SOFT_DELETE_V050_ROLLBACK.sql", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("DetailsPanel exposes document delete capability", () => {
  assert.match(details, /canDelete\?: boolean/);
  assert.match(details, /onDelete\?: \(\) => Promise<void>/);
});
check("DetailsPanel exposes a visible Lomtárba action", () => {
  assert.match(details, /Lomtárba/);
  assert.match(details, /smallDanger/);
});
check("main Drive wires single-document delete", () => {
  assert.match(main, /onDelete=\{async \(\) => \{ if \(selectedDocument\) await deleteDocuments\(\[selectedDocument\.id\]\); \}\}/);
});
check("Projectkapu Drive wires single-document delete", () => {
  assert.match(project, /deleteDocuments\(\[selectedDocument\.id\]\)/);
});
check("rollback drops RPC and restores Drive Core V0.3 marker", () => {
  assert.match(rollback, /drop function if exists public\.drive_core_soft_delete_documents_atomic/);
  assert.match(rollback, /schema_version = '0\.3\.0'/);
  assert.match(rollback, /bootstrap_id = 'drive-core-v030-20260802'/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
