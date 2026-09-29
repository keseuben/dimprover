import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const route = fs.readFileSync(path.join(root, "app/api/dev/grid/central-core/recovery/route.ts"), "utf8");
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));
let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("PASS", name); };

check("v0.1.95 desktop version", () => assert.equal(pkg.version, "0.1.95"));
check("v0.1.95 backend version", () => assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.95-dev"')));
check("Central Core route uses admin-only auth", () => assert.ok(route.includes("isDevCenterAuthorized(request.headers, false)")));
check("Central Core route exposes launch recovery", () => assert.ok(route.includes('action === "RECOVER_LAUNCH_EXECUTION"')));
check("Central Core route exposes pre-BOOT source retarget", () => assert.ok(route.includes('action === "RETARGET_PRE_BOOT_SOURCE"')));
check("Central Core route keeps PROD DENY response header", () => assert.ok(route.includes('"x-dimpro-production-access": "DENY"')));
check("Central Core route rejects unknown actions", () => assert.ok(route.includes("DEVELOPER_GRID_CENTRAL_CORE_ACTION_INVALID")));

console.log("Developer Grid v0.1.95 Central Core recovery contract PASS · " + n + "/" + n);
