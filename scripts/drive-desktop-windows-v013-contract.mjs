import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v013.ps1',import.meta.url),'utf8');
const a=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v013-windows-acceptance.ps1',import.meta.url),'utf8');
const checks=[
['Bridge default',/ValidateSet\('Bridge','DevToken'\)\]\[string\]\$AuthMode = 'Bridge'/.test(s)],
['DPAPI read',/ProtectedData\]::Unprotect/.test(s)],
['Bridge token path',/BenjAdminBridge\\device-token\.dpapi/.test(s)],
['access exchange',/\/api\/drive\/desktop-access\/token/.test(s)],
['Bearer access',/Authorization.*Bearer/.test(s)],
['DEV fallback explicit',/AuthMode -eq 'Bridge'/.test(s)&&/DIMPRO_DRIVE_DEV_TOKEN/.test(s)],
['read only server',/serverMutation = \$false/.test(s)],
['read only local',/localMutation = \$false/.test(s)],
['no delete',/delete = \$false/.test(s)],
['accept parser',/Language\.Parser\]::ParseFile/.test(a)],
];
let pass=0;for(const[n,o]of checks){console.log(`${o?'PASS':'FAIL'} ${String(pass+1).padStart(2,'0')} ${n}`);if(o)pass++;else process.exitCode=1;}if(pass!==checks.length)throw new Error(`Windows V0.1.3 contract failed ${pass}/${checks.length}`);console.log(`DIMPRO Drive Desktop Windows V0.1.3 contract PASS ${pass}/${checks.length}`);
