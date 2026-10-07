import "server-only";
import { DriveCoreRepositoryError } from "./errors";
import { getDatabaseClient } from "./databaseRepository";

export type DriveTrashItem = {
  id: string;
  type: "FOLDER" | "DOCUMENT";
  name: string;
  path: string;
  deletedAt: string;
  folderCount: number;
  documentCount: number;
  totalSizeBytes: number;
};

type FolderRow = { id:string; parent_id:string|null; name:string; path:string; original_name?:string|null; display_name?:string|null; status:string; updated_at:string };
type DocumentRow = { id:string; folder_id:string; name:string; status:string; updated_at:string };
type VersionRow = { document_id:string; size_bytes:number|string };

function dbError(message:string,error:unknown,status=500):never {
  const e=error as {code?:string;message?:string;details?:string;hint?:string}|null;
  const marker=[e?.code,e?.message,e?.details,e?.hint].filter(Boolean).join(" ").toUpperCase();
  if(marker.includes("DRIVE_TRASH_PARENT_FOLDER_NOT_ACTIVE")) throw new DriveCoreRepositoryError("A visszaállításhoz előbb a szülőmappát kell visszaállítani.","DRIVE_TRASH_PARENT_FOLDER_NOT_ACTIVE",409);
  if(marker.includes("DRIVE_TRASH_RESTORE_NAME_CONFLICT") || e?.code==="23505") throw new DriveCoreRepositoryError("A visszaállítás nem végezhető el, mert az eredeti helyen már létezik azonos nevű aktív elem.","DRIVE_TRASH_RESTORE_NAME_CONFLICT",409);
  if(marker.includes("DRIVE_TRASH_PURGE_ISSUE_REFERENCE")) throw new DriveCoreRepositoryError("A végleges törlés blokkolva: az elem aktív hibajegyhez vagy terepi melléklethez kapcsolódik.","DRIVE_TRASH_PURGE_ISSUE_REFERENCE",409);
  if(marker.includes("DRIVE_TRASH_PURGE_ACTIVE_CHILD") || marker.includes("DRIVE_TRASH_PURGE_ACTIVE_DOCUMENT")) throw new DriveCoreRepositoryError("A végleges törlés blokkolva: a mappafa aktív elemet is tartalmaz.","DRIVE_TRASH_PURGE_ACTIVE_CONTENT",409);
  if(marker.includes("DRIVE_TRASH_DOCUMENT_NOT_FOUND") || marker.includes("DRIVE_TRASH_FOLDER_NOT_FOUND")) throw new DriveCoreRepositoryError("A Lomtár elem nem található vagy már megváltozott.","DRIVE_TRASH_ITEM_NOT_FOUND",404);
  throw new DriveCoreRepositoryError(message,e?.code||"DRIVE_TRASH_DATABASE_ERROR",status,e?{message:e.message,details:e.details,hint:e.hint}:undefined);
}

export async function listDriveTrash(projectId:string):Promise<DriveTrashItem[]> {
  const client=getDatabaseClient();
  const [foldersResult,documentsResult,versionsResult]=await Promise.all([
    client.from("drive_core_folders").select("id,parent_id,name,path,original_name,display_name,status,updated_at").eq("project_id",projectId),
    client.from("drive_core_documents").select("id,folder_id,name,status,updated_at").eq("project_id",projectId).eq("status","DELETED").order("updated_at",{ascending:false}),
    client.from("drive_core_document_versions").select("document_id,size_bytes").eq("project_id",projectId),
  ]);
  if(foldersResult.error) dbError("A Lomtár mappái nem tölthetők be.",foldersResult.error);
  if(documentsResult.error) dbError("A Lomtár dokumentumai nem tölthetők be.",documentsResult.error);
  if(versionsResult.error) dbError("A Lomtár méretadatai nem tölthetők be.",versionsResult.error);
  const folders=(foldersResult.data||[]) as FolderRow[];
  const deletedDocs=(documentsResult.data||[]) as DocumentRow[];
  const versions=(versionsResult.data||[]) as VersionRow[];
  const folderById=new Map(folders.map(f=>[f.id,f]));
  const archived=new Set(folders.filter(f=>f.status==="ARCHIVED").map(f=>f.id));
  const children=new Map<string,string[]>();
  for(const f of folders){ if(f.parent_id){ const a=children.get(f.parent_id)||[]; a.push(f.id); children.set(f.parent_id,a); } }
  const sizeByDoc=new Map<string,number>();
  for(const v of versions) sizeByDoc.set(v.document_id,(sizeByDoc.get(v.document_id)||0)+Number(v.size_bytes||0));
  const docsByFolder=new Map<string,DocumentRow[]>();
  for(const d of deletedDocs){ const a=docsByFolder.get(d.folder_id)||[]; a.push(d); docsByFolder.set(d.folder_id,a); }
  const subtree=(rootId:string)=>{ const ids=new Set<string>(); const stack=[rootId]; while(stack.length){ const id=stack.pop()!; if(ids.has(id)||!archived.has(id))continue; ids.add(id); for(const c of children.get(id)||[])stack.push(c); } return ids; };
  const items:DriveTrashItem[]=[];
  const archivedRootIds=[...archived].filter(id=>{const p=folderById.get(id)?.parent_id; return !p||!archived.has(p);});
  for(const rootId of archivedRootIds){
    const root=folderById.get(rootId)!; const ids=subtree(rootId); let docCount=0,total=0,deletedAt=root.updated_at;
    for(const id of ids){ for(const d of docsByFolder.get(id)||[]){ docCount++; total+=sizeByDoc.get(d.id)||0; if(d.updated_at>deletedAt)deletedAt=d.updated_at; } }
    items.push({id:rootId,type:"FOLDER",name:root.display_name||root.original_name||root.name,path:root.path,deletedAt,folderCount:ids.size,documentCount:docCount,totalSizeBytes:total});
  }
  for(const d of deletedDocs){
    if(archived.has(d.folder_id)) continue;
    const folder=folderById.get(d.folder_id);
    items.push({id:d.id,type:"DOCUMENT",name:d.name,path:folder?.path||"Dokumentumtár",deletedAt:d.updated_at,folderCount:0,documentCount:1,totalSizeBytes:sizeByDoc.get(d.id)||0});
  }
  return items.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
}

export async function restoreDriveTrashItem(input:{projectId:string;type:"FOLDER"|"DOCUMENT";id:string;actorUserId:string}){
  const client=getDatabaseClient();
  const rpc=input.type==="FOLDER"?"drive_core_restore_folder_tree_atomic":"drive_core_restore_document_atomic";
  const key=input.type==="FOLDER"?"p_folder_id":"p_document_id";
  const {data,error}=await client.rpc(rpc,{p_project_id:input.projectId,[key]:input.id,p_actor_user_id:input.actorUserId});
  if(error) dbError("A Lomtár elem visszaállítása sikertelen.",error);
  return data as Record<string,unknown>;
}

export async function purgeDriveTrashItem(input:{projectId:string;type:"FOLDER"|"DOCUMENT";id:string;actorUserId:string}){
  const client=getDatabaseClient();
  const rpc=input.type==="FOLDER"?"drive_core_purge_folder_tree_atomic":"drive_core_purge_document_atomic";
  const key=input.type==="FOLDER"?"p_folder_id":"p_document_id";
  const {data,error}=await client.rpc(rpc,{p_project_id:input.projectId,[key]:input.id,p_actor_user_id:input.actorUserId});
  if(error) dbError("A Lomtár elem végleges törlése sikertelen.",error);
  return data as Record<string,unknown>;
}
