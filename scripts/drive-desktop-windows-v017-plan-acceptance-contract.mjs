import fs from 'node:fs';
const s=fs.readFileSync(new URL('./dimpro-drive-desktop-v017-plan-acceptance.ps1',import.meta.url),'utf8');
const checks=[
['Bridge Plan only',/-Mode Plan/.test(s)&&/-AuthMode Bridge/.test(s)&&!/-Mode Apply/.test(s)],
['D6 default',/d6-irodaepulet/.test(s)],
['empty local root',/empty-local-root/.test(s)&&/LOCAL_ROOT_NOT_EMPTY/.test(s)],
['report required',/REPORT_MISSING/.test(s)&&/REPORT_INVALID/.test(s)],
['no server mutation',/SERVER_MUTATION_DETECTED/.test(s)&&/serverMutation = \$false/.test(s)],
['no sync data mutation',/SYNC_DATA_MUTATION_DETECTED/.test(s)&&/syncDataMutation = \$false/.test(s)],
['no delete',/DELETE_DETECTED/.test(s)&&/delete = \$false/.test(s)&&!/kind.{0,8}DELETE/i.test(s)],
['no uploads from empty root',/UNEXPECTED_UPLOAD/.test(s)],
['all remote docs classified',/CLASSIFICATION_MISMATCH/.test(s)&&/downloadCount/.test(s)&&/conflictCount/.test(s)],
['conflict blocks plan artifact',/CONFLICT_NOT_BLOCKED/.test(s)&&/BLOCKED_PLAN_WAS_WRITTEN/.test(s)],
['conflict-free plan SHA verified',/PLAN_SHA_MISMATCH/.test(s)&&/Get-FileHash/.test(s)],
['plan kind checked',/DIMPRO_DRIVE_DESKTOP_MANUAL_SYNC_V017/.test(s)],
['PASS marker',/DIMPRO_DRIVE_DESKTOP_V017_PLAN_ACCEPTANCE_PASS/.test(s)],
];
let pass=0;checks.forEach(([n,o],i)=>{console.log(`${o?'PASS':'FAIL'} ${String(i+1).padStart(2,'0')} ${n}`);if(o)pass++;else process.exitCode=1;});if(pass!==checks.length)throw new Error(`V0.1.7 plan acceptance contract failed ${pass}/${checks.length}`);console.log(`DIMPRO Drive Desktop V0.1.7 plan acceptance contract PASS ${pass}/${checks.length}`);
