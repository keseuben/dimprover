import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const wrapper = fs.readFileSync(path.join(root, "scripts/developer-grid/package-windows.sh"), "utf8");
const marker = fs.readFileSync(path.join(root, "scripts/developer-grid/write-windows-artifact-marker.mjs"), "utf8");
let n = 0;
function check(ok, label) { n += 1; if (!ok) throw new Error(`FAIL ${String(n).padStart(2, "0")} ${label}`); console.log(`PASS ${String(n).padStart(2, "0")} ${label}`); }

check(wrapper.includes('EXPECTED_HOST="dimpro-dev"'), "canonical host fixed");
check(wrapper.includes('EXPECTED_ROOT="/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905"'), "canonical worktree fixed");
check(wrapper.includes('EXPECTED_BRANCH="feature/benjadmin-developer-grid-v013-outminai-20260905"'), "canonical branch fixed");
check(wrapper.includes('SOURCE_BASELINE_MISMATCH') && wrapper.includes('SOURCE_WORKTREE_DIRTY'), "source gates fail closed");
check(wrapper.includes('PROD_DENY'), "PROD denied");
check(wrapper.includes('.dimpro-release.json') && wrapper.includes('BUILD_ID'), "web build provenance required before Windows package");
check(wrapper.includes('npm run check') && wrapper.includes('live-client-contract.mjs') && wrapper.includes('npm audit'), "desktop gates run before packaging");
check(wrapper.includes('dimpro-coordinated-operation.sh" build'), "Windows packaging uses exclusive build lock");
check(wrapper.includes('npm run dist:win'), "electron Windows build invoked");
check(wrapper.includes('write-windows-artifact-marker.mjs'), "artifact marker written inside coordinated operation");
check(marker.includes('WINDOWS_MARKER_SOURCE_MISMATCH') && marker.includes('WINDOWS_MARKER_BUILD_PROVENANCE_MISMATCH'), "marker source/build provenance fail closed");
check(marker.includes('.dimpro-windows-artifact.json') && marker.includes('sha256(exeFile)') && marker.includes('productionAccess: "DENY"'), "marker stores hash and DEV/PROD identity");
check(marker.includes('fs.renameSync(temp, markerFile)') && marker.includes('0o600'), "marker write is atomic and mode 600");
check(!wrapper.includes('build:raw'), "raw build forbidden");
console.log(`Developer Grid Windows package contract PASS · ${n}/${n}`);
