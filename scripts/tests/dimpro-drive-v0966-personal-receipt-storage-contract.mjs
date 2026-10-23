import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addPersonalReceipt, dropPersonalReceipt, loadPersonalReceipts, prunePersonalReceipts,
  personalReceiptStorageKey, PERSONAL_RECEIPT_STORAGE_MAX,
  PERSONAL_RECEIPT_STORAGE_TTL_MS,
} from "../../app/lib/transfer-core/personalReceiptStorage.ts";

class FakeStorage {
  data = new Map();
  blocked = false;
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) {
    if (this.blocked) throw new Error("STORAGE_DENIED");
    return this.data.get(key) ?? null;
  }
  setItem(key,value) {
    if (this.blocked) throw new Error("STORAGE_DENIED");
    this.data.set(key,value);
  }
  removeItem(key) {
    if (this.blocked) throw new Error("STORAGE_DENIED");
    this.data.delete(key);
  }
}
const storage=new FakeStorage();
const scopeA="a".repeat(64);
const scopeB="b".repeat(64);
const now=Date.UTC(2026,9,23,20,30,0);
const id=n=>`12345678-1234-4234-8234-${String(n).padStart(12,"0")}`;
const item=n=>({requestId:id(n),sizeBytes:100*1024**2,startedAt:now});
assert.equal(PERSONAL_RECEIPT_STORAGE_MAX,500);
assert.equal(PERSONAL_RECEIPT_STORAGE_TTL_MS,7*24*60*60*1000);
assert.ok(personalReceiptStorageKey(scopeA)?.endsWith(scopeA+':'));
for(const bad of ["","A".repeat(64),"x".repeat(64),"abc","../foo",scopeA+"/sub"]) {
  assert.equal(personalReceiptStorageKey(bad),null);
}
assert.deepEqual(loadPersonalReceipts(storage,scopeA,now),[]);
assert.equal(addPersonalReceipt(storage,scopeA,{...item(1),name:"SECRET_NAME.jpg",token:"SECRET_TOKEN"},now),false,
  "storage never accepts extra fields");
for(let i=0;i<500;i++) {
  assert.equal(addPersonalReceipt(storage,scopeA,item(i+1),now),true,`save ${i}`);
}
assert.equal(addPersonalReceipt(storage,scopeA,item(501),now),false,"never evict unresolved receipt");
assert.equal(storage.data.size,500);
const raw=storage.getItem(personalReceiptStorageKey(scopeA)+id(1));
assert.ok(raw && raw.length<300);
for(const forbidden of ["fileName","name","token","mime","email","folderId","SECRET_NAME.jpg"]) {
  assert.equal(raw.includes(forbidden),false,`no ${forbidden} in storage`);
}
const parsed=JSON.parse(raw);
assert.deepEqual(Object.keys(parsed).sort(),["requestId","sizeBytes","startedAt","version"]);
assert.equal(parsed.version,2);
assert.equal(loadPersonalReceipts(storage,scopeA,now).length,500);
assert.deepEqual(loadPersonalReceipts(storage,scopeB,now),[]);
assert.equal(addPersonalReceipt(storage,scopeB,{...item(998),sizeBytes:42},now),true);
assert.equal(loadPersonalReceipts(storage,scopeB,now).length,1);
assert.equal(loadPersonalReceipts(storage,scopeA,now).length,500);
assert.equal(addPersonalReceipt(storage,scopeA,{...item(1),sizeBytes:7},now),false);
assert.equal(loadPersonalReceipts(storage,scopeA,now).length,500);
assert.equal(loadPersonalReceipts(storage,scopeA,now).find(x=>x.requestId===id(1))?.sizeBytes,100*1024**2);
assert.equal(dropPersonalReceipt(storage,scopeA,id(1),now),true);
assert.equal(loadPersonalReceipts(storage,scopeA,now).length,499);
assert.equal(addPersonalReceipt(storage,scopeA,item(501),now),true);
assert.equal(loadPersonalReceipts(storage,scopeA,now).length,500);
assert.equal(dropPersonalReceipt(storage,scopeA,id(1),now),true,"repeat removal is idempotent");
assert.equal(dropPersonalReceipt(storage,scopeA,"/../fake",now),false);
assert.equal(loadPersonalReceipts(storage,scopeB,now).length,1);

// Simulate browser restart: the second view has only the same Storage API,
// and no File objects are materialized from persisted receipt metadata.
const restarted=new FakeStorage();
restarted.data=new Map(storage.data);
assert.equal(loadPersonalReceipts(restarted,scopeA,now).length,500);
assert.equal(loadPersonalReceipts(restarted,scopeB,now).length,1);
assert.equal(loadPersonalReceipts(restarted,scopeA,now+PERSONAL_RECEIPT_STORAGE_TTL_MS+1).length,0);
assert.equal(prunePersonalReceipts(restarted,scopeA,now+PERSONAL_RECEIPT_STORAGE_TTL_MS+1).length,0);
assert.equal(restarted.key(0)?.startsWith(personalReceiptStorageKey(scopeA)),false,"expired hints are physically pruned locally");
assert.equal(addPersonalReceipt(restarted,scopeA,{...item(5),startedAt:now-PERSONAL_RECEIPT_STORAGE_TTL_MS-1},now),false);
assert.equal(addPersonalReceipt(restarted,scopeA,{...item(5),startedAt:now+1},now),false);
assert.equal(addPersonalReceipt(restarted,scopeA,{...item(5),sizeBytes:100*1024**2+1},now),false);
assert.equal(addPersonalReceipt(restarted,scopeA,{...item(5),sizeBytes:0},now),false);
assert.equal(addPersonalReceipt(restarted,scopeA,{...item(5),requestId:"invalid"},now),false);
assert.equal(addPersonalReceipt(restarted,scopeA,{...item(5),startedAt:NaN},now),false);

restarted.blocked=true;
assert.equal(addPersonalReceipt(restarted,scopeA,item(42),now),false);
assert.deepEqual(loadPersonalReceipts(restarted,scopeA,now),[]);
assert.equal(dropPersonalReceipt(restarted,scopeA,id(42),now),false);
restarted.blocked=false;
restarted.setItem(personalReceiptStorageKey(scopeB)+id(9),"{malformed");
assert.equal(loadPersonalReceipts(restarted,scopeB,now).length,1,
  "corrupt V2 record must not hide other valid receipt");
restarted.setItem(personalReceiptStorageKey(scopeB)+id(9),JSON.stringify({
 version:3,requestId:id(9),sizeBytes:100,startedAt:now,
}));
assert.equal(loadPersonalReceipts(restarted,scopeB,now).length,1);
restarted.setItem(personalReceiptStorageKey(scopeB)+id(9),JSON.stringify({
 version:2,requestId:id(10),sizeBytes:100,startedAt:now,
}));
assert.equal(loadPersonalReceipts(restarted,scopeB,now).length,1);

const read=path=>readFileSync(path,"utf8");
const route=read("app/api/drive/personal/uploads/recovery-scope/route.ts");
const panel=read("components/drive/PersonalDriveWorkspace.tsx");
for(const term of [
  "resolvePersonalDriveContentActor(request)",
  'process.env.DIMPRO_PRODUCTION_ACCESS !== "DENY"',
  'process.env.DIMPRO_AUTH_ENVIRONMENT !== "DEV"',
  'createHash("sha256")',
  '.update(access.actor.userId)',
  '"cache-control": "private, no-store"',
]) assert.ok(route.includes(term),term);
assert.ok(!route.includes("access.actor.email"));
assert.ok(!route.includes("getDriveObjectStorageConfig"));
for(const term of [
  "prunePersonalReceipts(storage, scope, Date.now())",
  "personalReceiptScopeRef.current = scope",
  'phase:"CONFIRMATION_UNKNOWN"',
  "|| !personalReceiptScopeReady",
  "addPersonalReceipt(storage, scope,",
  "dropPersonalReceipt(storage, scope, id, Date.now())",
  "personalReceiptScopeRef.current !== uploadScope",
  "personalReceiptBrowserStorage()",
  "fetch(\"/api/drive/personal/uploads/recovery-scope\"",
]) assert.ok(panel.includes(term),term);
assert.ok(panel.indexOf("addPersonalReceipt(storage, scope,") <
  panel.indexOf("uploadPersonalFormWithProgress({"),"store must precede the HTTP upload");
assert.ok(!panel.includes("localStorage.setItem(\"dimpro-personal-upload-file"));
console.log("DIMPRO Drive V0.9.66 500 account-scoped receipt hints; restart/expiry/privacy/malformed/quota/storage-denial/NO auto-resume PASS");
