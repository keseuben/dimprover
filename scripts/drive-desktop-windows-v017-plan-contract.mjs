import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v017.ps1',import.meta.url),'utf8');
const a=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v017-windows-acceptance.ps1',import.meta.url),'utf8');
const checks=[
['V017 version',/version = '0\.1\.7'/.test(s)&&/V0\.1\.7 DEV ONLY/.test(s)],
['real tree envelope',/Get-ObjectPropertyValue \$TreeEnvelope 'tree'/.test(s)&&/'folders'/.test(s)&&/'documents'/.test(s)],
['stable technical folder path mapping',/Get-ObjectPropertyValue \$folder 'path'/.test(s)&&/folderByPath/.test(s)&&/displayRelativePath/.test(s)],
['current version SHA mapping',/currentVersion/.test(s)&&/sha256/.test(s)&&/versionId/.test(s)],
['original filename mirror with Windows safety',/Get-RemoteMirrorFileName/.test(s)&&/Test-WindowsSafeLeafName/.test(s)&&/originalName/.test(s)&&/REMOTE_FILE_NAME_NOT_WINDOWS_SAFE/.test(s)],
['local only upload new',/kind = 'UPLOAD_NEW'/.test(s)&&/REMOTE_FOLDER_NOT_FOUND/.test(s)],
['remote only download',/kind = 'DOWNLOAD'/.test(s)&&/allowCreateParent = \$true/.test(s)],
['matched SHA unchanged',/unchanged\.Add/.test(s)&&/localSha -eq \$remoteSha/.test(s)],
['mismatch conflict fail closed',/CONTENT_MISMATCH_NO_BASELINE/.test(s)&&/Manual resolution required/.test(s)],
['no remote folder creation',/V0\.1\.7 Phase 1 uses the stable technical Drive folder path and does not create remote folders automatically/.test(s)],
['change pagination',/limit=250/.test(s)&&/V017_CHANGE_PAGINATION_LIMIT/.test(s)&&/V017_CHANGE_CURSOR_STALLED/.test(s)],
['prepared apply plan',/PreparedApplyPlanPath/.test(s)&&/DIMPRO_DRIVE_DESKTOP_MANUAL_SYNC_V017/.test(s)],
['conflict blocks prepared plan',/applyBlocked/.test(s)&&/manualPlan\.conflicts\.Count -gt 0/.test(s)],
['conflict blocks apply',/V017_APPLY_PLAN_CONFLICTS_PRESENT/.test(s)],
['reviewed SHA required',/V017_REVIEWED_PLAN_SHA256_REQUIRED/.test(s)&&/ReviewedPlanSha256/.test(s)],
['reviewed SHA mismatch gate',/V017_REVIEWED_PLAN_SHA256_MISMATCH/.test(s)&&/Get-FileHash -LiteralPath \$Path -Algorithm SHA256/.test(s)],
['download parent controlled creation',/allowCreateParent/.test(s)&&/New-Item -ItemType Directory/.test(s)],
['no delete operation',!/kind.{0,8}DELETE/i.test(s)&&!/\/delete/.test(s)],
['JSON strict UTF8 retained',/RawContentStream/.test(s)&&/System\.Text\.UTF8Encoding\(\$false, \$true\)/.test(s)&&!/Invoke-RestMethod/.test(s)],
['Bridge retained',/ProtectedData\]::Unprotect/.test(s)&&/desktop-access\/token/.test(s)],
['PS5.1 generic list arrays use ToArray',/changes = \$all\.ToArray\(\)/.test(s)&&/operations = \$operations\.ToArray\(\)/.test(s)&&/conflicts = \$conflicts\.ToArray\(\)/.test(s)&&/unchanged = \$unchanged\.ToArray\(\)/.test(s)&&!/@\(\$(all|operations|conflicts|unchanged)\)/.test(s)],
['acceptance V017 FIX1 marker',/DIMPRO_DRIVE_DESKTOP_V017_FIX1_WINDOWS_ACCEPTANCE_PASS/.test(a)],
['acceptance V017 marker',/DIMPRO_DRIVE_DESKTOP_V017_WINDOWS_ACCEPTANCE_PASS/.test(a)],
];
let pass=0;for(const[n,o]of checks){console.log(`${o?'PASS':'FAIL'} ${String(pass+1).padStart(2,'0')} ${n}`);if(o)pass++;else process.exitCode=1;}if(pass!==checks.length)throw new Error(`V0.1.7 plan contract failed ${pass}/${checks.length}`);console.log(`DIMPRO Drive Desktop V0.1.7 Plan contract PASS ${pass}/${checks.length}`);
