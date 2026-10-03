import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v015.ps1',import.meta.url),'utf8');
const a=fs.readFileSync(new URL('./dimpro-drive-desktop-manual-sync-v015-windows-acceptance.ps1',import.meta.url),'utf8');
const c=fs.readFileSync(new URL('../app/api/drive/desktop-contract/route.ts',import.meta.url),'utf8');
const checks=[
['exact apply mode',/ValidateSet\('Probe','Plan','Apply'\)/.test(s)],
['upload init',/drive\/uploads\/init/.test(s)],
['signed PUT',/Invoke-PresignedPutFile/.test(s)],
['upload complete',/completeUrl/.test(s)&&/Invoke-DrivePostEmpty/.test(s)],
['upload abort fallback',/abortUrl/.test(s)],
['download init',/drive\/documents\/.+\/download/.test(s)],
['signed GET',/Invoke-PresignedGetFile/.test(s)],
['download size verify',/DOWNLOAD_SIZE_MISMATCH/.test(s)],
['cursor save',/drive\/sync\/cursor/.test(s)&&/cursorValue/.test(s)],
['health write gate',/realObjectWriteEnabled/.test(s)],
['health download gate',/realObjectDownloadEnabled/.test(s)],
['explicit enable gate',/V015_APPLY_ENABLE_SWITCH_REQUIRED/.test(s)],
['server mutation gate',/V015_SERVER_MUTATION_APPROVAL_REQUIRED/.test(s)],
['local mutation gate',/V015_LOCAL_MUTATION_APPROVAL_REQUIRED/.test(s)],
['plan schema gate',/V015_APPLY_PLAN_SCHEMA_UNSUPPORTED/.test(s)],
['Bridge DPAPI',/ProtectedData\]::Unprotect/.test(s)],
['desktop access exchange',/\/api\/drive\/desktop-access\/token/.test(s)],
['contract advertises desktop access',/currentModes: \["desktop-access"/.test(c)],
['contract exposes exchange endpoint',/desktopAccessToken: "POST \/api\/drive\/desktop-access\/token"/.test(c)],
['no delete operation',!/kind.{0,8}DELETE/i.test(s)&&!/\/delete/.test(s)],
['acceptance exact apply marker',/EXACT_APPLY_CONTRACT_PASS/.test(a)],
['acceptance delete deny marker',/DELETE_OPERATION_DENY_PASS/.test(a)],
];
let pass=0;for(const[n,o]of checks){console.log(`${o?'PASS':'FAIL'} ${String(pass+1).padStart(2,'0')} ${n}`);if(o)pass++;else process.exitCode=1;}if(pass!==checks.length)throw new Error(`Windows V0.1.5 contract failed ${pass}/${checks.length}`);console.log(`DIMPRO Drive Desktop Windows V0.1.5 contract PASS ${pass}/${checks.length}`);
