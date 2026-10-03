import fs from "node:fs";
const s=fs.readFileSync("scripts/dimpro-drive-desktop-v015-apply-acceptance.ps1","utf8");
const checks=[
  ["explicit confirm gate",/ConfirmDevMutation/.test(s)&&/CONFIRM_DEV_MUTATION_REQUIRED/.test(s)],
  ["DEV host allowlist",/drive\.dev\.dimpro\.hu/.test(s)&&/DEV_SERVER_REQUIRED/.test(s)],
  ["Bridge auth only",/-AuthMode Bridge/.test(s)],
  ["exact upload new",/kind = 'UPLOAD_NEW'/.test(s)],
  ["exact download",/kind = 'DOWNLOAD'/.test(s)],
  ["D6 DEV project default",/d6-irodaepulet/.test(s)],
  ["archive folder default",/drive-folder-03148ec117a64388d88a/.test(s)],
  ["upload IDs chained",/documentId = \$documentId/.test(s)&&/versionId = \$versionId/.test(s)],
  ["source SHA",/Get-FileHash/.test(s)&&/sourceSha/.test(s)],
  ["download SHA equality",/DOWNLOAD_SHA_MISMATCH/.test(s)],
  ["explicit Apply gates",/-EnableApply/.test(s)&&/-AllowServerMutation/.test(s)&&/-AllowLocalMutation/.test(s)],
  ["no cursor mutation",!/nextCursor/.test(s)],
  ["no server delete operation",!/kind = 'DELETE'/.test(s)&&!/\/delete/.test(s)],
  ["no local cleanup delete",!/Remove-Item/.test(s)&&!/\[IO\.File\]::Delete/.test(s)],
  ["PASS marker",/DIMPRO_DRIVE_DESKTOP_V015_APPLY_ACCEPTANCE_PASS/.test(s)],
];
let fail=0;
checks.forEach(([name,ok],i)=>{console.log((ok?"PASS":"FAIL")+" "+String(i+1).padStart(2,"0")+" "+name);if(!ok)fail++;});
if(fail){console.error("DIMPRO Drive Desktop V0.1.5 Apply Acceptance contract FAIL "+fail+"/"+checks.length);process.exit(1);}
console.log("DIMPRO Drive Desktop V0.1.5 Apply Acceptance contract PASS "+checks.length+"/"+checks.length);
