import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-v017-download-apply-acceptance.ps1',import.meta.url),'utf8');
const checks=[
['plan and SHA mandatory',/Parameter\(Mandatory=\$true\).*PlanPath/.test(s)&&/ReviewedPlanSha256/.test(s)&&/PLAN_SHA_MISMATCH/.test(s)],
['manual sync plan kind only',/DIMPRO_DRIVE_DESKTOP_MANUAL_SYNC_V017/.test(s)],
['conflict zero required',/DOWNLOAD_APPLY_CONFLICTS_PRESENT/.test(s)],
['download only operations',/NON_DOWNLOAD_OPERATION/.test(s)&&/ExpectedDownloadCount = 5/.test(s)],
['preexisting target denied',/TARGET_ALREADY_EXISTS/.test(s)],
['expected SHA mandatory',/EXPECTED_SHA_REQUIRED/.test(s)],
['isolated acceptance client id',/drive-desktop-v017-download-acceptance-/.test(s)],
['explicit apply gates',/-EnableApply/.test(s)&&/-AllowServerMutation/.test(s)&&/-AllowLocalMutation/.test(s)],
['result exact operation count',/RESULT_COUNT_MISMATCH/.test(s)&&/RESULT_OPERATIONS_MISMATCH/.test(s)],
['downloaded file SHA reverified',/Get-FileHash/.test(s)&&/FILE_SHA_MISMATCH/.test(s)],
['cursor save required',/CURSOR_SAVE_FAILED/.test(s)&&/cursorSaved = \$true/.test(s)],
['server mutation cursor only declared',/ACCEPTANCE_CURSOR_ONLY/.test(s)&&/documentMutation = \$false/.test(s)],
['no delete',/delete = \$false/.test(s)&&!/kind.{0,8}DELETE/i.test(s)],
['PASS marker',/DIMPRO_DRIVE_DESKTOP_V017_DOWNLOAD_APPLY_ACCEPTANCE_PASS/.test(s)],
];
let pass=0;checks.forEach(([n,o],i)=>{console.log(`${o?'PASS':'FAIL'} ${String(i+1).padStart(2,'0')} ${n}`);if(o)pass++;else process.exitCode=1;});if(pass!==checks.length)throw new Error(`V0.1.7 download apply acceptance contract failed ${pass}/${checks.length}`);console.log(`DIMPRO Drive Desktop V0.1.7 download Apply acceptance contract PASS ${pass}/${checks.length}`);
