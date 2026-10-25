"server-only";
import {randomUUID} from "node:crypto";
import {mkdir,open,unlink} from "node:fs/promises";
import path from "node:path";

// Execution and task replacement share this cross-process lock. A crashed owner
// leaves the lock for explicit recovery; an uncertain write is never retried.
export async function withDeveloperGridTaskOperation<T>(taskId:string,operation:()=>Promise<T>):Promise<T>{
 if(!/^[A-Za-z0-9._-]{1,220}$/.test(taskId))throw Object.assign(new Error("Érvénytelen taskazonosító."),{code:"EXECUTION_IDENTITY_INVALID",status:400});
 const root=process.env.BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT?.trim()||"/srv/dimpro-dev/coordination/developer-grid/execution";
 const locks=path.join(root,"task-operation-locks");await mkdir(locks,{recursive:true,mode:0o700});
 const file=path.join(locks,`${taskId}.lock`);
 let handle;try{handle=await open(file,"wx",0o600);}catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw Object.assign(new Error("A task végrehajtás vagy helyreállítás alatt áll; párhuzamos művelet tiltva."),{code:"EXECUTION_TASK_OPERATION_BUSY",status:409});throw error;}
 try{await handle.writeFile(JSON.stringify({taskId,pid:process.pid,token:randomUUID(),startedAt:new Date().toISOString()}));return await operation();}
 finally{await handle.close();await unlink(file);}
}
