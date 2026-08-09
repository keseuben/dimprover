import assert from "node:assert/strict";
import fs from "node:fs";
const files={
 network:fs.readFileSync("components/drop/dropNetworkClient.ts","utf8"),
 uploader:fs.readFileSync("components/drop/DropPublicHexUploader.tsx","utf8"),
 finalize:fs.readFileSync("app/lib/drop/public/dropPublicFinalizeService.ts","utf8"),
 api:fs.readFileSync("app/lib/drop/dropApi.ts","utf8"),
 dispatch:fs.readFileSync("app/lib/drop/worker/dropScanDispatch.ts","utf8"),
 runtime:fs.readFileSync("app/lib/drop/dropRuntime.ts","utf8"),
};
let checks=0; const has=(n,v,p)=>{checks++;assert.match(v,p,n)}; const lacks=(n,v,p)=>{checks++;assert.doesNotMatch(v,p,n)};
has("version-v1210",files.runtime,/version:\s*"DROP 1\.2\.10"/);
has("network-information-change",files.network,/connection\?\.addEventListener\("change"/);
has("network-transition-stabilization",files.network,/1_200/);
has("semantic-skip-retry-option",files.network,/skipRetryStatuses\?: number\[\]/);
has("finalize-skips-generic-425",files.uploader,/skipRetryStatuses:\s*\[425\]/);
lacks("no-425-server-error-ui",files.uploader,/Átmeneti szerverhiba \(425\)/);
has("scan-progress-ui",files.uploader,/Vírusellenőrzés folyamatban · \$\{ready\}\/\$\{total\}/);
has("network-resume-dedup-ref",files.uploader,/networkResumeTimerRef/);
has("network-resume-stabilization",files.uploader,/1_600/);
has("finalize-progress-details",files.finalize,/readyCount:\s*files\.length - pending\.length/);
has("finalize-idempotent-delivery",files.finalize,/persistedDeliverySummary\(claimed\.workflow\)/);
has("idempotent-sent-not-zero",files.finalize,/notificationStatus === "sent" \? total : 0/);
has("api-safe-details",files.api,/details \? \{ details \} : \{\}/);
has("scan-coalesced-sentinel",files.dispatch,/scan-wakeup\.trigger/);
has("scan-sentinel-overwrite",files.dispatch,/flag:\s*"w"/);
lacks("scan-no-random-trigger",files.dispatch,/randomUUID/);
console.log(JSON.stringify({ok:true,version:"DROP 1.2.10",checks},null,2));
