import assert from "node:assert/strict";
import fs from "node:fs";
const shell = fs.readFileSync("components/drive/DriveShell.tsx","utf8");
const board = fs.readFileSync("components/drive/FloatingProjectBoard.tsx","utf8");
const buildInfo = fs.readFileSync("components/drive/driveBuildInfo.ts","utf8");
let pass=0; const check=(label,fn)=>{fn();pass+=1;console.log("PASS "+String(pass).padStart(2,"0")+" "+label);};
check("V0.9.8 development version is active",()=>assert.match(buildInfo,/DRIVE_DEVELOPMENT_VERSION = "0\.9\.8"/));
check("storage quota callback is stable",()=>{
  assert.match(shell,/const handleStorageQuotaChange = useCallback\(/);
  assert.match(shell,/onStorageQuotaChange=\{handleStorageQuotaChange\}/);
  assert.doesNotMatch(shell,/onStorageQuotaChange=\{\(quota\) =>/);
});
check("provisioning version is explicitly labeled as environment schema",()=>{
  assert.match(board,/Környezet séma/);
  assert.doesNotMatch(board,/<span>Verzió<\/span>/);
});
check("production access remains denied by policy",()=>assert.doesNotMatch(shell+board+buildInfo,/PROD ALLOW/));
console.log(JSON.stringify({ok:true,contract:"DIMPRO Drive V0.9.8 P0 reload-loop hotfix",pass,fail:0,productionAccess:"DENY"},null,2));