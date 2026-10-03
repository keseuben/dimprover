#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const shell = read("components/drive/DriveShell.tsx");
const rail = read("components/drive/DriveNavigationRail.tsx");
const board = read("components/drive/FloatingProjectBoard.tsx");
const buildInfo = read("components/drive/driveBuildInfo.ts");
const workspace = read("components/drive/DriveWorkspace.tsx");
const grid = read("components/drive/FileGridPanel.tsx");
const css = read("components/drive/DriveWorkspace.module.css");
const schema = read("app/lib/drive-core/schema.ts");
const favoritesRepo = read("app/lib/drive-core/favoriteRepository.ts");
const favoritesRoute = read("app/api/projects/[projectId]/drive/favorites/route.ts");
const migration = read("supabase/migrations/20261003_drive_user_favorites_v092.sql");
const migrationGate = read("scripts/drive-user-favorites-v092-migration-gate.mjs");

let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log("PASS " + String(pass).padStart(2, "0") + " " + label); };

check("Drive development version has one shared source", () => {
  assert.match(buildInfo, /DRIVE_DEVELOPMENT_VERSION = "0\.9\.\d+"/);
  assert.match(rail, /DRIVE_VERSION_DISPLAY/);
  assert.match(board, /DRIVE_VERSION_DISPLAY/);
  assert.doesNotMatch(rail, /DRIVE 1\.0 RC/);
});

check("standalone board is Drive-only and no longer routes to Projektkapu", () => {
  assert.doesNotMatch(board, /href="\/projektkapu"/);
  assert.doesNotMatch(board, />Projektkapu</);
  assert.doesNotMatch(board, />Projektmunka</i);
  assert.ok(board.includes("Dokumentumtár"));
  assert.ok(board.includes("Kedvencek"));
  assert.ok(board.includes("Beérkező Drop"));
  assert.ok(board.includes("CsomagBOX"));
});

check("future Drive views are visible but disabled instead of fake navigation", () => {
  for (const label of ["Kezdőlap", "Legutóbbi", "Kiadások", "Lomtár"]) assert.ok(board.includes(label));
  assert.match(board, /boardNavDisabled/);
  assert.match(board, /hamarosan/);
});

check("board closes on outside pointer click and Escape", () => {
  assert.match(shell, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(shell, /target\?\.closest\('\[data-drive-navigation-surface="true"\]'\)/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /setBoardPinned\(false\)[\s\S]*?setBoardOpen\(false\)/);
});

check("rail and board identify their interactive surface for outside-click logic", () => {
  assert.match(rail, /data-drive-navigation-surface="true"/);
  assert.match(board, /data-drive-navigation-surface="true"/);
});

check("board storage is sourced from real project storage API", () => {
  assert.match(shell, /\/drive\/storage/);
  assert.match(shell, /setStorageQuota\(payload\.storage\)/);
  assert.match(board, /storageQuota\.occupiedBytes/);
  assert.match(board, /storageQuota\.quotaBytes/);
  assert.match(board, /storageQuota\.usagePercent/);
  assert.doesNotMatch(board, /68\.4 GB \/ 250 GB/);
  assert.doesNotMatch(css, /\.storageBarFill \{ width: 27%/);
});

check("Drive Core marker remains stable at 0.9.1", () => {
  assert.match(schema, /DRIVE_CORE_SCHEMA_VERSION = "0\.9\.1"/);
  assert.match(schema, /DRIVE_CORE_MIGRATION_COUNT = 8/);
  assert.match(schema, /drive-core-v091-folder-trash-20261003/);
  assert.doesNotMatch(schema, /drive_core_user_favorites/);
});

check("favorites migration is additive, separately versioned and user scoped", () => {
  assert.match(migration, /create table if not exists public\.drive_favorites_schema_meta/);
  assert.match(migration, /create table if not exists public\.drive_core_user_favorites/);
  assert.match(migration, /primary key \(project_id, user_id, entity_type, entity_id\)/);
  assert.match(migration, /entity_type in \('DOCUMENT','FOLDER'\)/);
  assert.match(migration, /'drive-favorites', '0\.1\.0', 1, 'drive-favorites-v010-20261003'/);
  assert.doesNotMatch(migration, /update public\.drive_core_schema_meta/);
});

check("favorites migration gate is DEV-only with verified core 0.9.1 predecessor and backup", () => {
  assert.match(migrationGate, /productionAccess:"DENY"/);
  assert.match(migrationGate, /schemaVersion==="0\.9\.1"/);
  assert.match(migrationGate, /drive-favorites-v010-20261003/);
  assert.match(migrationGate, /pg_dump/);
  assert.match(migrationGate, /DRIVE_USER_FAVORITES_V010_MIGRATION_APPROVED/);
});

check("favorite repository keys state by project and actor user", () => {
  assert.match(favoritesRepo, /\.eq\("project_id", projectId\)/);
  assert.match(favoritesRepo, /\.eq\("user_id", userId\)/);
  assert.match(favoritesRepo, /entity_type/);
  assert.match(favoritesRepo, /setDriveUserFavorite/);
});

check("favorite API requires readable Drive access and validates the document", () => {
  assert.match(favoritesRoute, /requireProjectPermission\(request, projectId, "document\.read"\)/);
  assert.match(favoritesRoute, /requireDriveDocumentAccess\(projectId, documentId, access\.access\)/);
  assert.match(favoritesRoute, /access\.actor\.userId/);
  assert.match(favoritesRoute, /listDriveTreeForAccess/);
});

check("workspace loads and persists personal favorites", () => {
  assert.match(workspace, /\/drive\/favorites/);
  assert.match(workspace, /setFavoriteDocumentIds/);
  assert.match(workspace, /async function toggleFavorite/);
  assert.match(workspace, /favoriteOnly/);
  assert.match(workspace, /navigationRequest\.target === "favorites"/);
});

check("favorite star is present in all three document row renderers", () => {
  const usages = (grid.match(/<FavoriteToggle /g) || []).length;
  assert.equal(usages, 3);
  assert.match(grid, /favoriteSet\.has/);
  assert.match(css, /\.favoriteToggleActive[\s\S]*?color: #f0b400/);
  assert.match(css, /\.favoriteToggleActive svg \{ fill: currentColor; \}/);
});

check("favorite marker precedes BOX marker in all three views", () => {
  const snippets = grid.match(/<FavoriteToggle[\s\S]{0,320}?<BoxInlineMarker/g) || [];
  assert.equal(snippets.length, 3);
});

check("all three icon columns are widened for star + BOX markers", () => {
  assert.equal((grid.match(/statusIcons", defaultWidth: 132, minWidth: 124/g) || []).length, 3);
  assert.match(css, /\.statusIconColumn \{[\s\S]*?min-width: 124px/);
});

check("Favorites, incoming Drop and CsomagBOX use real workspace navigation", () => {
  assert.match(buildInfo, /"documents" \| "favorites" \| "incoming" \| "boxes"/);
  assert.match(shell, /handleDriveNavigation/);
  assert.match(workspace, /navigationRequest\.target === "incoming"/);
  assert.match(workspace, /navigationRequest\.target === "boxes"/);
  assert.match(workspace, /setBoxShelfOpen\(true\)/);
});

check("production access remains denied by development policy", () => {
  assert.doesNotMatch(shell + board + rail + workspace + grid + migration, /PROD ALLOW/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.9.7 Standalone Navigation + Real Storage + Personal Favorites",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
