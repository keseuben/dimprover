import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, "scripts/developer-grid/build-candidate.sh");
const source = fs.readFileSync(file, "utf8");
let n = 0;
function check(ok, label) {
  n += 1;
  if (!ok) throw new Error(`FAIL ${String(n).padStart(2, "0")} ${label}`);
  console.log(`PASS ${String(n).padStart(2, "0")} ${label}`);
}
check(source.includes('EXPECTED_HOST="dimpro-dev"'), "canonical DEV host fixed");
check(source.includes('/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827'), "canonical worktree fixed");
check(source.includes('EXPECTED_BRANCH="feature/benjadmin-developer-grid-v1-20260827"'), "canonical branch fixed");
check(source.includes('/srv/dimpro-dev/repositories/dimprover.git'), "canonical repository fixed");
check(source.includes('SOURCE_BASELINE_MISMATCH'), "source mismatch fail-closed");
check(source.includes('SOURCE_WORKTREE_DIRTY'), "dirty source fail-closed");
check(source.includes('PROD_DENY'), "PROD denied");
check(source.includes('NEXT_DIST_DIR="$TARGET"'), "stale inherited distDir overridden");
check(source.includes('TARGET=".next"'), "default distDir avoids tsconfig custom-target mutation");
check(source.includes('next build --webpack'), "webpack low-memory build engine explicit");
check(source.includes('NEXT_BUILD_CPUS=1'), "single build CPU");
check(source.includes('--max-old-space-size=3400'), "bounded node heap");
check(source.includes('dimpro-coordinated-operation.sh" build'), "central exclusive build lock used");
check(source.includes('dimpro-dev-storage-prebuild.sh'), "storage preflight used");
check(source.includes('ensure-next-standalone-assets.cjs --force'), "standalone assets materialized");
check(!source.includes('build:raw'), "raw build forbidden");

check(source.includes("NEXT_PUBLIC_SUPABASE_URL") && source.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"), "required DEV public Supabase env explicit");
check(source.includes("dimpro-benjadmin-operator-ui-v2-dev") && source.includes("DEV_PUBLIC_ENV_UNAVAILABLE"), "DEV public env resolved fail-closed");
check(!source.includes("SUPABASE_SERVICE_ROLE_KEY") && !source.includes("DATABASE_URL"), "no privileged Supabase or database secret requested");
check(source.includes("MemoryHigh=4800M") && source.includes("MemoryMax=5500M"), "memory pressure ceiling tuned for canonical DEV");
check(source.includes("MemAvailable:") && source.includes("MIN_MEM_AVAILABLE_KIB"), "available memory preflight is explicit");
check(source.includes("SwapTotal:") && source.includes("MAX_SWAP_USED_PERCENT=85"), "swap pressure preflight is explicit");
check(source.includes("RESOURCE_MEMORY_PRESSURE") && source.includes("RESOURCE_SWAP_PRESSURE"), "resource pressure blocks fail-closed");
check(source.indexOf("RESOURCE_SWAP_PRESSURE") < source.indexOf('if [[ "${1:-}" == "--preflight-only" ]]'), "resource gate runs before preflight PASS");

console.log(`Developer Grid candidate build contract PASS · ${n}/${n}`);
