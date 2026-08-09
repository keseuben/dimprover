import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main(){
  const root=await mkdtemp(path.join(os.tmpdir(),"drop-v095-fallback-"));
  const stateDir=path.join(root,"state");const markerDir=path.join(root,"marker");
  process.env.DROP_PUBLIC_STATE_DATA_DIR=stateDir;
  process.env.DROP_PUBLIC_STORE_MARKER_DIR=markerDir;
  process.env.DROP_PUBLIC_STORE_MODE="auto";
  try{
    const repository=await import("../app/lib/drop/public/dropPublicRepository");
    const first=await repository.getDropPublicStoreStatus({refresh:true});
    assert.equal(first.version,"DROP 0.9.5");
    assert.equal(first.activeStore,"file");
    assert.equal(first.schemaReady,false);
    assert.equal(first.migrationRequired,false);
    assert.equal(first.failClosed,false);
    assert.equal(first.file.migratableRecordCount,0);
    const state=await repository.getDropPublicStateSafe();
    assert.equal(state.store.activeStore,"file");
    assert.equal(state.store.schemaReady,false);
    assert.equal(state.sendCodes.length,0);assert.equal(state.gates.length,0);
    assert.equal((await stat(stateDir)).mode & 0o777,0o700);
    assert.equal((await stat(path.join(stateDir,"state.json"))).mode & 0o777,0o600);
    await mkdir(markerDir,{recursive:true,mode:0o700});await chmod(markerDir,0o700);
    await writeFile(path.join(markerDir,"postgres-active.json"),"{broken-json",{mode:0o600});
    await assert.rejects(()=>repository.getDropPublicStoreStatus({refresh:true}),(error:unknown)=>(error as {code?:string}).code==="DROP_PUBLIC_STORE_MARKER_CORRUPT");
    console.log(JSON.stringify({ok:true,version:"DROP 0.9.5",checks:12,activeStore:first.activeStore,schemaReady:first.schemaReady,securePermissions:true,corruptMarkerFailsClosed:true},null,2));
  }finally{await rm(root,{recursive:true,force:true})}
}
void main().catch((error)=>{console.error(error);process.exit(1)});
