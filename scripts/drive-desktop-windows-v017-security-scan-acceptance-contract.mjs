import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-v017-security-scan-acceptance.ps1',import.meta.url),'utf8');
const checks=[
['plan and SHA mandatory',/Parameter\(Mandatory=\$true\).*PlanPath/.test(s)&&/ReviewedPlanSha256/.test(s)&&/PLAN_SHA_MISMATCH/.test(s)],
['exact V017 plan only',/DIMPRO_DRIVE_DESKTOP_MANUAL_SYNC_V017/.test(s)],
['conflict zero required',/SECURITY_ACCEPTANCE_CONFLICTS_PRESENT/.test(s)],
['five download operations required',/ExpectedScanCount = 5/.test(s)&&/NON_DOWNLOAD_OPERATION/.test(s)],
['version document SHA required',/ID_REQUIRED/.test(s)&&/EXPECTED_SHA_REQUIRED/.test(s)],
['duplicate version denied',/DUPLICATE_VERSION/.test(s)],
['isolated scan acceptance client',/drive-desktop-v017-security-scan-acceptance-/.test(s)],
['ScanPlan explicit gates',/-Mode ScanPlan/.test(s)&&/-EnableSecurityScan/.test(s)&&/-AllowServerMutation/.test(s)],
['result exact scan and clean count',/RESULT_SCAN_COUNT_MISMATCH/.test(s)&&/RESULT_CLEAN_COUNT_MISMATCH/.test(s)],
['each result must be CLEAN',/RESULT_NOT_CLEAN/.test(s)&&/SECURITY_SCAN/.test(s)],
['each result hash bound to plan',/RESULT_HASH_MISMATCH/.test(s)&&/plannedByVersion/.test(s)],
['scanner ready required',/SCANNER_NOT_READY/.test(s)&&/scannerReady = \$true/.test(s)],
['security metadata mutation only',/SECURITY_SCAN_METADATA/.test(s)&&/documentContentMutation = \$false/.test(s)&&/localMutation = \$false/.test(s)],
['no delete',/delete = \$false/.test(s)&&!/kind.{0,8}DELETE/i.test(s)],
['PASS marker',/DIMPRO_DRIVE_DESKTOP_V017_SECURITY_SCAN_ACCEPTANCE_PASS/.test(s)],
];
let pass=0;checks.forEach(([n,o],i)=>{console.log(`${o?'PASS':'FAIL'} ${String(i+1).padStart(2,'0')} ${n}`);if(o)pass++;else process.exitCode=1;});if(pass!==checks.length)throw new Error(`V0.1.7 security scan acceptance contract failed ${pass}/${checks.length}`);console.log(`DIMPRO Drive Desktop V0.1.7 security scan acceptance contract PASS ${pass}/${checks.length}`);
