import fs from "node:fs";
import assert from "node:assert/strict";
const source = fs.readFileSync(new URL("./dimpro-drive-desktop-v018-windows-acceptance.ps1", import.meta.url), "utf8");
const checks = [
  ["parses handler and manager", /Parser\]::ParseFile/],
  ["prints handler SHA", /HANDLER_SHA256=/],
  ["prints manager SHA", /MANAGER_SHA256=/],
  ["checks partial semantics", /partialSemantics/],
  ["checks no auto delete", /noAutoDelete/],
  ["checks per-user protocol", /perUserProtocol/],
  ["can run installed self check", /RunInstalledSelfCheck/],
  ["has PASS marker", /DIMPRO_DRIVE_DESKTOP_V018_WINDOWS_OPEN_HANDLER_ACCEPTANCE_PASS/],
];
let pass=0;
for (const [name,re] of checks) {
  try { assert.match(source,re); pass++; console.log(`PASS ${String(pass).padStart(2,"0")} ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode=1; }
}
if (!process.exitCode) console.log(`DIMPRO Drive Desktop V0.1.8 Windows acceptance contract PASS ${pass}/${checks.length}`);
