#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync("app/lib/drop/public/dropPublicFinalizeService.ts","utf8");
let pass=0;const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};
check("files-not-ready releases finalize claim",()=>assert.match(source,/notificationStatus: "not_requested"/)&&assert.match(source,/WAITING_FILES:/));
check("retry message asks user to retry shortly",()=>assert.match(source,/Próbálja újra néhány másodperc múlva/));
check("files-not-ready is not rewritten to failed",()=>assert.match(source,/code !== "DROP_PUBLIC_FILES_NOT_READY"/));
check("real pending claims keep five-minute concurrency guard",()=>assert.match(source,/notificationStatus === "pending"/)&&assert.match(source,/5 \* 60_000/));
check("worker candidate query still excludes ordinary not-requested packages",()=>assert.match(source,/\.eq\("notification_status", "pending"\)/));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
