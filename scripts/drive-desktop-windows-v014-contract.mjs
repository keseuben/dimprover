import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v014.ps1',import.meta.url),'utf8');
const a=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v014-windows-acceptance.ps1',import.meta.url),'utf8');
const checks=[
['Probe Plan Apply modes',/ValidateSet\('Probe','Plan','Apply'\)/.test(s)],
['Bridge DPAPI',/ProtectedData\]::Unprotect/.test(s)],
['desktop access exchange',/\/api\/drive\/desktop-access\/token/.test(s)],
['signed PUT helper',/function Invoke-PresignedPutFile/.test(s)],
['signed GET helper',/function Invoke-PresignedGetFile/.test(s)],
['SHA256 verify helper',/function Assert-ExpectedSha256/.test(s)],
['same-dir temp download',/\.dimpro-part-/.test(s)],
['atomic final move',/\[IO\.File\]::Move/.test(s)],
['no overwrite guard',/DOWNLOAD_TARGET_ALREADY_EXISTS/.test(s)],
['apply readiness',/function Get-ApplyReadiness/.test(s)],
['desktop access runtime gate',/DESKTOP_ACCESS_MODE_NOT_ADVERTISED/.test(s)],
['storage write runtime gate',/OBJECT_STORAGE_WRITES_NOT_READY/.test(s)],
['explicit apply enable gate',/V014_APPLY_ENABLE_SWITCH_REQUIRED/.test(s)],
['server mutation approval gate',/V014_SERVER_MUTATION_APPROVAL_REQUIRED/.test(s)],
['local mutation approval gate',/V014_LOCAL_MUTATION_APPROVAL_REQUIRED/.test(s)],
['apply plan file gate',/V014_APPLY_PLAN_FILE_REQUIRED/.test(s)],
['runtime hard block',/V014_APPLY_RUNTIME_NOT_ACTIVATED/.test(s)],
['acceptance parser',/Language\.Parser\]::ParseFile/.test(a)],
['acceptance apply fail-closed',/APPLY_FAIL_CLOSED_PASS/.test(a)],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${String(pass+1).padStart(2,'0')} ${name}`);if(ok)pass++;else process.exitCode=1;}
if(pass!==checks.length)throw new Error(`Windows V0.1.4 contract failed ${pass}/${checks.length}`);
console.log(`DIMPRO Drive Desktop Windows V0.1.4 contract PASS ${pass}/${checks.length}`);
