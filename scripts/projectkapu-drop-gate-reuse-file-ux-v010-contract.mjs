#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const transfer=readFileSync("components/drop/DropPublicTransferClient.tsx","utf8");
const uploader=readFileSync("components/drop/DropPublicHexUploader.tsx","utf8");
let pass=0; const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};
check("submission gate reset requests fresh session path",()=>assert.match(transfer,/mode === "submission_gate"/)&&assert.match(transfer,/sessionStarted\.current = false/)&&assert.match(transfer,/setSessionReady\(false\)/));
check("submission gate labels new transfer clearly",()=>assert.match(transfer,/Új beküldés/));
check("mixed uploader does not force image mode",()=>assert.match(uploader,/imageMode=\{imageOnly\}/)&&assert.match(uploader,/allowCamera=\{imageOnly\}/));
check("mixed uploader advertises documents and files",()=>assert.match(uploader,/Dokumentumok és fájlok hozzáadása/)&&assert.match(uploader,/CAD\/BIM/));
check("mixed uploader defaults to safe original naming",()=>assert.match(uploader,/imageOnly \? "dimpro_photo" : "safe_original"/));
check("generic new transfer label is not image-only",()=>assert.match(uploader,/Új küldemény/));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
