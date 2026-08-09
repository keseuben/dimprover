import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function assertNoConflictingDynamicSiblings(rootDir) {
  const children = readdirSync(rootDir);
  const dynamicChildren = children.filter((name) => /^\[[^\]]+\]$/.test(name));
  assert.ok(
    dynamicChildren.length <= 1,
    `${rootDir}: eltérő dinamikus útvonaltestvérek ütköznek: ${dynamicChildren.join(", ")}`,
  );
  for (const child of children) {
    const childPath = path.join(rootDir, child);
    if (statSync(childPath).isDirectory()) assertNoConflictingDynamicSiblings(childPath);
  }
}

assertNoConflictingDynamicSiblings("app/api/drop");

const routes = [
  "app/api/drop/admin/packages/preview/route.ts",
  "app/api/drop/admin/packages/[packageId]/status/route.ts",
  "app/api/drop/admin/packages/[packageId]/tokens/[purpose]/reissue/route.ts",
  "app/api/drop/admin/packages/[packageId]/tokens/by-id/[tokenId]/revoke/route.ts",
];

for (const routePath of routes) {
  const source = readFileSync(routePath, "utf8");
  assert.match(source, /isLicenseAdminAuthorized\(request\.headers\)/, `${routePath}: hiányzó licencadmin ellenőrzés.`);
  assert.match(source, /dropNoStoreHeaders\(\)/, `${routePath}: hiányzó no-store válaszfejléc.`);
  assert.doesNotMatch(source, /pin_hash|pin_salt|token_hash\s*:/i, `${routePath}: belső biztonsági mező szivároghat a válaszba.`);
}

const statusRoute = readFileSync(routes[1], "utf8");
assert.match(statusRoute, /assertDropFeatureEnabled\("packageEngineEnabled"\)/);
assert.match(statusRoute, /parseDropPackageStatus\(body\.targetStatus\)/);
assert.match(statusRoute, /transitionDropPackageStatus/);
assert.doesNotMatch(statusRoute, /package:\s*result\.package[,}]/, "A teljes adatbázissor nem küldhető vissza.");

const reissueRoute = readFileSync(routes[2], "utf8");
assert.match(reissueRoute, /parseDropAccessPurposeStrict/);
assert.match(reissueRoute, /reissueDropPackageToken/);
assert.match(reissueRoute, /csak ebben a válaszban jelenik meg/i);
assert.match(reissueRoute, /status:\s*201/);

const revokeRoute = readFileSync(routes[3], "utf8");
assert.match(revokeRoute, /parseDropTokenId/);
assert.match(revokeRoute, /revokeDropPackageToken/);

const previewRoute = readFileSync(routes[0], "utf8");
assert.match(previewRoute, /buildDropPackagePreview/);
assert.doesNotMatch(previewRoute, /createDropPackage|issueDropAccessToken|supabaseDrop/i, "Az előnézet nem használhat adatbázist vagy tokengenerálást.");

const manager = readFileSync("components/drop/DropPackageManager.tsx", "utf8");
assert.match(manager, /canCommit=\{coreReady\}/);
assert.match(manager, /disabled=\{!valid \|\| submitting \|\| !canCommit\}/);
assert.match(manager, /Ellenőrző előnézet/);
assert.match(manager, /HoldActionButton/);
assert.match(manager, /durationMs=\{2000\}/);
assert.doesNotMatch(manager, /window\.confirm/, "A visszafordíthatatlan Drop műveletek nem használhatnak egyszerű confirm ablakot.");
const holdActionCount = (manager.match(/<HoldActionButton/g) || []).length;
assert.ok(holdActionCount >= 5, `Legalább 5 nyomva tartásos Drop művelet szükséges, jelenleg: ${holdActionCount}.`);

const proxy = readFileSync("proxy.ts", "utf8");
assert.match(proxy, /pathname\.startsWith\("\/api\/drop\/admin\/"\)/, "Az alkalmazási proxy nem engedi át a védett admin API-kat.");

console.log("DROP 0.2.0 admin API contract tests: PASS");
