import assert from "node:assert/strict";
import {
  addPersonalReceipt, dropPersonalReceipt, loadPersonalReceipts,
  prunePersonalReceipts, personalReceiptStorageKey,
  PERSONAL_RECEIPT_STORAGE_MAX, PERSONAL_RECEIPT_STORAGE_VERSION,
} from "../../app/lib/transfer-core/personalReceiptStorage.ts";
import { readFileSync } from "node:fs";

class SharedStorage {
  data = new Map();
  onSet = null;
  get length(){return this.data.size;}
  key(n){return [...this.data.keys()][n]??null;}
  getItem(k){return this.data.get(k)??null;}
  setItem(k,v){this.onSet?.(k,v);this.data.set(k,v);}
  removeItem(k){this.data.delete(k);}
}
const scope="1".repeat(64);
const secondScope="2".repeat(64);
const prefix=personalReceiptStorageKey(scope);
const now=Date.UTC(2026,9,23,20,40);
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const row=n=>({requestId:id(n),sizeBytes:20,startedAt:now});
assert.equal(PERSONAL_RECEIPT_STORAGE_VERSION,2);
const shared=new SharedStorage();
// Two simulated tabs share Storage but never rewrite a shared receipt list.
const tabA=shared;
const tabB=shared;
assert.equal(addPersonalReceipt(tabA,scope,row(1),now),true);
assert.equal(addPersonalReceipt(tabB,scope,row(2),now),true);
assert.equal(addPersonalReceipt(tabA,scope,row(3),now),true);
assert.equal(shared.length,3);
assert.deepEqual(loadPersonalReceipts(tabA,scope,now).map(x=>x.requestId),
  [id(1),id(2),id(3)]);
assert.equal(dropPersonalReceipt(tabB,scope,id(2),now),true);
assert.deepEqual(loadPersonalReceipts(tabA,scope,now).map(x=>x.requestId),[id(1),id(3)]);
assert.equal(addPersonalReceipt(tabB,secondScope,row(11),now),true);
assert.equal(loadPersonalReceipts(tabB,secondScope,now).length,1);
assert.equal(loadPersonalReceipts(tabA,scope,now).length,2);
// A malformed receipt does not hide other, correctly stored hints.
shared.data.set(prefix+id(98),"{broken");
assert.equal(loadPersonalReceipts(tabA,scope,now).length,2);
assert.equal(prunePersonalReceipts(tabA,scope,now).length,2);
assert.equal(shared.data.has(prefix+id(98)),false);
// Tampering with an extra URL or token invalidates only that record.
shared.data.set(prefix+id(97),JSON.stringify({
  version:2,...row(97),presignedUrl:"https://example.invalid/secret",
}));
assert.equal(loadPersonalReceipts(tabA,scope,now).length,2);
prunePersonalReceipts(tabA,scope,now);
assert.equal(shared.data.has(prefix+id(97)),false);

// V1 upgrade is lossless: failure halfway leaves the original list available.
const old=new SharedStorage();
const oldKey="dimpro-drive-personal-upload-receipts-v1:"+scope;
old.data.set(oldKey,JSON.stringify({version:1,scope,records:[row(20),row(21)]}));
assert.equal(loadPersonalReceipts(old,scope,now).length,2);
old.onSet=(key)=>{
  if(key===prefix+id(21))throw Error("QUOTA_EXCEEDED_DURING_MIGRATION");
};
assert.equal(prunePersonalReceipts(old,scope,now).length,2);
assert.equal(old.data.has(oldKey),true,"do not delete old record on partial migration");
assert.equal(loadPersonalReceipts(old,scope,now).length,2);
old.onSet=null;
assert.equal(prunePersonalReceipts(old,scope,now).length,2);
assert.equal(old.data.has(oldKey),false,"remove V1 only after successful complete migration");
assert.equal(old.data.has(prefix+id(20)),true);
assert.equal(old.data.has(prefix+id(21)),true);
assert.equal(loadPersonalReceipts(old,scope,now).length,2);

// An existing corrupt V2 key MUST NOT make migration erase its valid V1 copy.
const damaged=new SharedStorage();
damaged.data.set(oldKey,JSON.stringify({version:1,scope,records:[row(33)]}));
damaged.data.set(prefix+id(33),"{corrupted V2");
assert.equal(prunePersonalReceipts(damaged,scope,now).length,1);
assert.equal(damaged.data.has(oldKey),false,"V1 removed only after V2 repaired");
assert.deepEqual(loadPersonalReceipts(damaged,scope,now),[row(33)]);
assert.equal(JSON.parse(damaged.data.get(prefix+id(33))).version,2);

// Conflicting valid V2 metadata must retain V1 instead of silently losing it.
const mismatch=new SharedStorage();
mismatch.data.set(oldKey,JSON.stringify({version:1,scope,records:[row(34)]}));
mismatch.data.set(prefix+id(34),JSON.stringify({
  version:2,...row(34),sizeBytes:99,
}));
prunePersonalReceipts(mismatch,scope,now);
assert.equal(mismatch.data.has(oldKey),true,"mismatched legacy is retained for investigation");
assert.deepEqual(loadPersonalReceipts(mismatch,scope,now),[],
  "conflicting V1/V2 metadata is not silently chosen");

// Capacity race: while tab A saves #500, tab B writes #501.
// The losing tab backs out ONLY its own key; all others remain.
const busy=new SharedStorage();
for(let n=1;n<PERSONAL_RECEIPT_STORAGE_MAX;n++){
  assert.equal(addPersonalReceipt(busy,scope,row(n),now),true);
}
let injected=false;
busy.onSet=(key)=>{
  if(key===prefix+id(500)&&!injected){
    injected=true;
    busy.data.set(prefix+id(501),JSON.stringify({version:2,...row(501)}));
  }
};
assert.equal(addPersonalReceipt(busy,scope,row(500),now),false);
assert.equal(busy.data.has(prefix+id(500)),false);
assert.equal(busy.data.has(prefix+id(501)),true);
assert.equal(loadPersonalReceipts(busy,scope,now).length,500);

// Scope and local storage are NOT authority to fetch any user's object.
const api=readFileSync("app/api/drive/personal/uploads/status/[requestId]/route.ts","utf8");
assert.ok(api.includes("resolvePersonalDriveContentActor(request)"));
assert.ok(api.includes("findOwnedPersonalUploadReceipt({ userId, requestId: id })"));
assert.ok(!api.includes("putDriveObjectStream"));
const ui=readFileSync("components/drive/PersonalDriveWorkspace.tsx","utf8");
assert.ok(ui.includes("prunePersonalReceipts(storage, scope, Date.now())"));
assert.ok(ui.includes("addPersonalReceipt(storage, scope,"));
assert.ok(ui.includes('phase:"CONFIRMATION_UNKNOWN"'));
console.log("DIMPRO Drive V0.9.67 multi-tab separate keys, V1→V2 crash-safe migration, corrupt keys, 500-cap race rollback PASS");
