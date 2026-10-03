import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-v016-version-acceptance.ps1',import.meta.url),'utf8');
const checks=[
['explicit confirm gate',/ConfirmDevMutation/.test(s)&&/CONFIRM_DEV_MUTATION_REQUIRED/.test(s)],
['DEV host allowlist',/drive\.dev\.dimpro\.hu/.test(s)&&/DEV_SERVER_REQUIRED/.test(s)],
['V016 main script',/dimpro-drive-desktop-manual-sync-v016\.ps1/.test(s)],
['main script invocation exact', (s.match(/& \$mainScript `\n/g)||[]).length===2 && !/&mainScript/.test(s)],
['Bridge auth only',/-AuthMode Bridge/.test(s)],
['UPLOAD_VERSION only',/kind = 'UPLOAD_VERSION'/.test(s)&&!/kind = 'UPLOAD_NEW'/.test(s)],
['optimistic version lock',/expectedCurrentVersion = \$ExpectedCurrentVersion/.test(s)],
['dedicated document',/drive-document-cde50a0b770f/.test(s)],
['UTF-8 metadata probe',/Árvíztűrő tükörfúrógép/.test(s)&&/őűŐŰ/.test(s)],
['revision step',/revisionCode = 'Rev\. 1'/.test(s)],
['exact version download',/versionId = \$versionId/.test(s)&&/DOWNLOAD_VERSION_MISMATCH/.test(s)],
['SHA upload verify',/UPLOAD_SHA_MISMATCH/.test(s)],
['SHA download verify',/DOWNLOAD_SHA_MISMATCH/.test(s)],
['explicit Apply gates',/-EnableApply/.test(s)&&/-AllowServerMutation/.test(s)&&/-AllowLocalMutation/.test(s)],
['no cursor mutation',!/nextCursor/.test(s)],
['no delete operation',!/kind = 'DELETE'/.test(s)&&!/\/delete/.test(s)&&!/Remove-Item/.test(s)],
['PASS marker',/DIMPRO_DRIVE_DESKTOP_V016_VERSION_ACCEPTANCE_PASS/.test(s)],
];
let pass=0;checks.forEach(([n,o],i)=>{console.log(`${o?'PASS':'FAIL'} ${String(i+1).padStart(2,'0')} ${n}`);if(o)pass++;else process.exitCode=1;});if(pass!==checks.length)throw new Error(`V0.1.6 version acceptance contract failed ${pass}/${checks.length}`);console.log(`DIMPRO Drive Desktop V0.1.6 version acceptance contract PASS ${pass}/${checks.length}`);
