import { randomUUID } from "node:crypto";
import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import type { DriveBox, DriveBoxFolder, DriveBoxItem, DriveBoxLifecycleStatus, DriveBoxPurpose } from "@/components/drive/driveTypes";

type DbError = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;
type DbBox = { id:string; owner_user_id:string; name:string; purpose:string; color_token:string; icon_key:string; note:string; sort_order:number; status:string; lifecycle_status:string; ready_at:string|null; sent_at:string|null; archived_at:string|null; created_by_user_id:string|null; created_at:string; updated_at:string };
type DbFolder = { id:string; owner_user_id:string; box_id:string; parent_id:string|null; name:string; sort_order:number; status:string; created_by_user_id:string|null; created_at:string; updated_at:string };
type DbItem = { id:string; owner_user_id:string; box_id:string; content_ref_id:string; folder_id:string|null; sort_order:number; added_by_user_id:string|null; added_at:string };
type DbEvent = { id:string; owner_user_id:string; box_id:string; event_type:string; entity_type:string; entity_id:string; summary:string; metadata:Record<string,unknown>|null; actor_user_id:string|null; created_at:string };
type ContentRef = { id:string; content_object_id:string; display_name:string; status:string; owner_type:string; owner_user_id:string|null };
type ContentObject = { id:string; original_name:string|null; display_name:string; mime_type:string; size_bytes:number; status:string; created_at:string; sha256:string; storage_bucket?:string; storage_key?:string; security_status?:string; virus_scan_status?:string };

const BOX_SELECT="id,owner_user_id,name,purpose,color_token,icon_key,note,sort_order,status,lifecycle_status,ready_at,sent_at,archived_at,created_by_user_id,created_at,updated_at";
const FOLDER_SELECT="id,owner_user_id,box_id,parent_id,name,sort_order,status,created_by_user_id,created_at,updated_at";
const ITEM_SELECT="id,owner_user_id,box_id,content_ref_id,folder_id,sort_order,added_by_user_id,added_at";
const EVENT_SELECT="id,owner_user_id,box_id,event_type,entity_type,entity_id,summary,metadata,actor_user_id,created_at";
const OBJECT_PACKAGE_SELECT="id,original_name,display_name,mime_type,size_bytes,status,created_at,sha256,storage_bucket,storage_key,security_status,virus_scan_status";
const PURPOSES=new Set<DriveBoxPurpose>(["GENERAL","DROP","COMPARE","AI_ANALYSIS","ISSUE","MEETING"]);
const LIFECYCLE=new Set<DriveBoxLifecycleStatus>(["DRAFT","READY","SENT","ARCHIVED"]);

function error(message:string,error:DbError):never {
  const status=error?.code==="P0002"?404:error?.code==="23505"?409:error?.code==="23514"?409:error?.code==="22023"?400:error?.code==="42501"?403:500;
  throw new DimproIdentityError(message,error?.code||"PERSONAL_DRIVE_BOX_DATABASE_ERROR",status);
}
function workspaceId(userId:string){return `personal:${userId}`}
function purpose(value:string):DriveBoxPurpose{return PURPOSES.has(value as DriveBoxPurpose)?value as DriveBoxPurpose:"GENERAL"}
function lifecycle(value:string):DriveBoxLifecycleStatus{return LIFECYCLE.has(value as DriveBoxLifecycleStatus)?value as DriveBoxLifecycleStatus:"DRAFT"}
function mapFolder(row:DbFolder,userId:string):DriveBoxFolder{return {id:row.id,projectId:workspaceId(userId),boxId:row.box_id,parentId:row.parent_id,name:row.name,sortOrder:Number(row.sort_order||0),status:row.status==="ARCHIVED"?"ARCHIVED":"ACTIVE",createdBy:row.created_by_user_id||"",createdAt:row.created_at,updatedAt:row.updated_at}}
function mapItem(row:DbItem,userId:string,ref:ContentRef|null,object:ContentObject|null):DriveBoxItem{return {
  id:row.id,projectId:workspaceId(userId),boxId:row.box_id,documentId:row.content_ref_id,versionId:object?.id||null,folderId:row.folder_id,
  version:object?{id:object.id,versionNumber:1,revisionCode:"",originalName:object.original_name||ref?.display_name||object.display_name,mimeType:object.mime_type,sizeBytes:Number(object.size_bytes||0),status:object.status==="ACTIVE"?"AVAILABLE":object.status,createdBy:"",createdAt:object.created_at}:null,
  sortOrder:Number(row.sort_order||0),addedBy:row.added_by_user_id||"",addedAt:row.added_at,
}}
function mapBox(row:DbBox,userId:string,items:DriveBoxItem[]=[],folders:DriveBoxFolder[]=[]):DriveBox{return {
  id:row.id,projectId:workspaceId(userId),name:row.name,purpose:purpose(row.purpose),colorToken:row.color_token||"slate",iconKey:row.icon_key||"box",note:row.note||"",sortOrder:Number(row.sort_order||0),status:row.status==="ARCHIVED"?"ARCHIVED":"ACTIVE",lifecycleStatus:lifecycle(row.lifecycle_status),lifecycleFeatureReady:true,readyAt:row.ready_at,sentAt:row.sent_at,archivedAt:row.archived_at,createdBy:row.created_by_user_id||"",createdAt:row.created_at,updatedAt:row.updated_at,folderFeatureReady:true,folders,items,
}}

export async function getPersonalDriveBoxCoreReadiness(){
  const db=getDimproIdentitySupabaseClient();
  const [marker,boxes,folders,items,events]=await Promise.all([
    db.from("dimpro_content_schema_meta").select("component,schema_version,migration_count,bootstrap_id").eq("component","personal-drive-boxes").maybeSingle(),
    db.from("dimpro_personal_drive_boxes").select("id",{head:true,count:"exact"}).limit(0),
    db.from("dimpro_personal_drive_box_folders").select("id",{head:true,count:"exact"}).limit(0),
    db.from("dimpro_personal_drive_box_items").select("id",{head:true,count:"exact"}).limit(0),
    db.from("dimpro_personal_drive_box_events").select("id",{head:true,count:"exact"}).limit(0),
  ]);
  const markerReady=!marker.error&&marker.data?.schema_version==="0.1.0"&&Number(marker.data?.migration_count)===1&&marker.data?.bootstrap_id==="personal-drive-boxes-v010-20261006";
  return {ready:markerReady&&!boxes.error&&!folders.error&&!items.error&&!events.error,markerReady,boxesReady:!boxes.error,foldersReady:!folders.error,itemsReady:!items.error,eventsReady:!events.error};
}

export async function listPersonalDriveBoxes(userId:string){
  const db=getDimproIdentitySupabaseClient();
  const [boxesResult,foldersResult,itemsResult]=await Promise.all([
    db.from("dimpro_personal_drive_boxes").select(BOX_SELECT).eq("owner_user_id",userId).eq("status","ACTIVE").order("sort_order",{ascending:true}).order("created_at",{ascending:true}),
    db.from("dimpro_personal_drive_box_folders").select(FOLDER_SELECT).eq("owner_user_id",userId).eq("status","ACTIVE").order("sort_order",{ascending:true}).order("created_at",{ascending:true}),
    db.from("dimpro_personal_drive_box_items").select(ITEM_SELECT).eq("owner_user_id",userId).order("sort_order",{ascending:true}).order("added_at",{ascending:true}),
  ]);
  if(boxesResult.error)error("A Saját Drive CsomagBOX lista nem tölthető be.",boxesResult.error);
  if(foldersResult.error)error("A Saját Drive CsomagBOX mappái nem tölthetők be.",foldersResult.error);
  if(itemsResult.error)error("A Saját Drive CsomagBOX elemei nem tölthetők be.",itemsResult.error);
  const rawItems=(itemsResult.data||[]) as DbItem[];
  const refIds=[...new Set(rawItems.map(x=>x.content_ref_id))];
  const refs=new Map<string,ContentRef>(),objects=new Map<string,ContentObject>();
  if(refIds.length){
    const refsResult=await db.from("dimpro_content_refs").select("id,content_object_id,display_name,status,owner_type,owner_user_id").eq("owner_type","USER").eq("owner_user_id",userId).eq("status","ACTIVE").in("id",refIds);
    if(refsResult.error)error("A CsomagBOX személyes fájlhivatkozásai nem tölthetők be.",refsResult.error);
    for(const row of (refsResult.data||[]) as ContentRef[])refs.set(row.id,row);
    const objectIds=[...new Set([...refs.values()].map(x=>x.content_object_id))];
    if(objectIds.length){
      const objectResult=await db.from("dimpro_content_objects").select("id,original_name,display_name,mime_type,size_bytes,status,created_at,sha256").eq("status","ACTIVE").in("id",objectIds);
      if(objectResult.error)error("A CsomagBOX tartalomobjektumai nem tölthetők be.",objectResult.error);
      for(const row of (objectResult.data||[]) as ContentObject[])objects.set(row.id,row);
    }
  }
  const items=rawItems.flatMap(row=>{const ref=refs.get(row.content_ref_id)||null;if(!ref)return[];return[mapItem(row,userId,ref,objects.get(ref.content_object_id)||null)]});
  const itemsByBox=new Map<string,DriveBoxItem[]>();for(const item of items){const bucket=itemsByBox.get(item.boxId)||[];bucket.push(item);itemsByBox.set(item.boxId,bucket)}
  const foldersByBox=new Map<string,DriveBoxFolder[]>();for(const row of (foldersResult.data||[]) as DbFolder[]){const folder=mapFolder(row,userId);const bucket=foldersByBox.get(folder.boxId)||[];bucket.push(folder);foldersByBox.set(folder.boxId,bucket)}
  return {ok:true as const,folderFeatureReady:true,lifecycleFeatureReady:true,boxes:((boxesResult.data||[]) as DbBox[]).map(row=>mapBox(row,userId,itemsByBox.get(row.id)||[],foldersByBox.get(row.id)||[]))};
}

export async function createPersonalDriveBox(userId:string,input:Record<string,unknown>,actorUserId:string){
  const name=typeof input.name==="string"?input.name.trim().slice(0,120):"";if(!name)throw new DimproIdentityError("A CsomagBOX neve kötelező.","PERSONAL_BOX_NAME_REQUIRED",400);
  const requested=typeof input.purpose==="string"?input.purpose.toUpperCase():"GENERAL";const p=purpose(requested);
  const colorToken=typeof input.colorToken==="string"&&input.colorToken.trim()?input.colorToken.trim().slice(0,40):"slate";
  const iconKey=typeof input.iconKey==="string"&&input.iconKey.trim()?input.iconKey.trim().slice(0,80):"box";
  const note=typeof input.note==="string"?input.note.slice(0,2000):"";
  const {data,error:e}=await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_create_box_atomic",{p_owner_user_id:userId,p_name:name,p_purpose:p,p_color_token:colorToken,p_icon_key:iconKey,p_note:note,p_actor_user_id:actorUserId});if(e)error("A Saját Drive CsomagBOX létrehozása sikertelen.",e);
  return {ok:true as const,box:mapBox(data as DbBox,userId)};
}
export async function addPersonalDriveBoxItem(userId:string,boxId:string,input:Record<string,unknown>,actorUserId:string){
  const refId=typeof input.documentId==="string"?input.documentId.trim():"";if(!refId)throw new DimproIdentityError("A Saját Drive fájl azonosítója kötelező.","PERSONAL_BOX_CONTENT_REF_REQUIRED",400);
  const {data,error:e}=await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_add_box_item_atomic",{p_owner_user_id:userId,p_box_id:boxId,p_content_ref_id:refId,p_actor_user_id:actorUserId});if(e)error("A fájl CsomagBOX-hoz adása sikertelen.",e);
  const result=data as {item:DbItem;idempotent?:boolean};return {ok:true as const,item:mapItem(result.item,userId,null,null),idempotent:Boolean(result.idempotent)};
}
export async function removePersonalDriveBoxItem(userId:string,boxId:string,itemId:string,actorUserId:string){const {data,error:e}=await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_remove_box_item_atomic",{p_owner_user_id:userId,p_box_id:boxId,p_item_id:itemId,p_actor_user_id:actorUserId});if(e)error("A fájl eltávolítása a CsomagBOX-ból sikertelen.",e);return{ok:true as const,removed:data as DbItem}}
export async function createPersonalDriveBoxFolder(userId:string,boxId:string,input:Record<string,unknown>,actorUserId:string){const name=typeof input.name==="string"?input.name.trim().slice(0,120):"";if(!name)throw new DimproIdentityError("A CsomagBOX mappa neve kötelező.","PERSONAL_BOX_FOLDER_NAME_REQUIRED",400);const parentId=typeof input.parentId==="string"&&input.parentId.trim()?input.parentId.trim():"";const{data,error:e}=await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_create_box_folder_atomic",{p_owner_user_id:userId,p_box_id:boxId,p_parent_id:parentId,p_name:name,p_actor_user_id:actorUserId});if(e)error("A CsomagBOX mappa létrehozása sikertelen.",e);return{ok:true as const,folder:mapFolder(data as DbFolder,userId)}}
export async function movePersonalDriveBoxItem(userId:string,boxId:string,itemId:string,input:Record<string,unknown>,actorUserId:string){const folderId=typeof input.folderId==="string"&&input.folderId.trim()?input.folderId.trim():"";const{data,error:e}=await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_move_box_item_atomic",{p_owner_user_id:userId,p_box_id:boxId,p_item_id:itemId,p_folder_id:folderId,p_actor_user_id:actorUserId});if(e)error("A CsomagBOX elem áthelyezése sikertelen.",e);return{ok:true as const,item:mapItem(data as DbItem,userId,null,null)}}
export async function setPersonalDriveBoxLifecycle(userId:string,boxId:string,nextStatus:DriveBoxLifecycleStatus,actorUserId:string){if(!LIFECYCLE.has(nextStatus))throw new DimproIdentityError("Érvénytelen CsomagBOX állapot.","PERSONAL_BOX_LIFECYCLE_INVALID",400);const{data,error:e}=await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_set_box_lifecycle_atomic",{p_owner_user_id:userId,p_box_id:boxId,p_next_status:nextStatus,p_actor_user_id:actorUserId});if(e)error("A CsomagBOX állapotának módosítása sikertelen.",e);return{ok:true as const,box:mapBox(data as DbBox,userId)}}

export async function getPersonalDriveBoxPackageSource(userId:string,boxId:string){
  const listed=await listPersonalDriveBoxes(userId);const box=listed.boxes.find(entry=>entry.id===boxId);if(!box)throw new DimproIdentityError("A CsomagBOX nem található.","PERSONAL_BOX_NOT_FOUND",404);
  if(!box.items.length)return{ok:true as const,box,entries:[] as Array<{item:DriveBoxItem;ref:ContentRef;object:ContentObject}>};
  const db=getDimproIdentitySupabaseClient();const refIds=[...new Set(box.items.map(item=>item.documentId))];
  const refsResult=await db.from("dimpro_content_refs").select("id,content_object_id,display_name,status,owner_type,owner_user_id").eq("owner_type","USER").eq("owner_user_id",userId).eq("status","ACTIVE").in("id",refIds);
  if(refsResult.error)error("A CsomagBOX fájlhivatkozásai nem tölthetők be.",refsResult.error);const refs=new Map(((refsResult.data||[]) as ContentRef[]).map(row=>[row.id,row]));
  const objectIds=[...new Set([...refs.values()].map(row=>row.content_object_id))];const objectsResult=await db.from("dimpro_content_objects").select(OBJECT_PACKAGE_SELECT).eq("status","ACTIVE").in("id",objectIds);
  if(objectsResult.error)error("A CsomagBOX tartalomobjektumai nem tölthetők be.",objectsResult.error);const objects=new Map(((objectsResult.data||[]) as ContentObject[]).map(row=>[row.id,row]));
  const entries=box.items.flatMap(item=>{const ref=refs.get(item.documentId);if(!ref)return[];const object=objects.get(ref.content_object_id);return object?[{item,ref,object}]:[]});return{ok:true as const,box,entries};
}

export async function logPersonalDriveBoxDownload(userId:string,boxId:string,actorUserId:string,input:{packageId:string;packageName:string;fileCount:number;skippedCount:number}){
  const id=`personal-boxevent-${randomUUID().replaceAll("-","").slice(0,18)}`;
  const result=await getDimproIdentitySupabaseClient().from("dimpro_personal_drive_box_events").insert({id,owner_user_id:userId,box_id:boxId,event_type:"DRIVE_DOWNLOAD_PACKAGE_CREATED",entity_type:"box",entity_id:boxId,summary:`CsomagBOX ZIP elkészítve: ${input.packageName}`,metadata:{boxId,packageId:input.packageId,packageName:input.packageName,fileCount:input.fileCount,skippedCount:input.skippedCount},actor_user_id:actorUserId}).select("id").single();
  if(result.error)error("A CsomagBOX ZIP audit esemény nem menthető.",result.error);
}

export async function listPersonalDriveBoxHistory(userId:string,boxId:string,limit=100){const safe=Math.max(1,Math.min(200,Math.trunc(limit)));const result=await getDimproIdentitySupabaseClient().from("dimpro_personal_drive_box_events").select(EVENT_SELECT).eq("owner_user_id",userId).eq("box_id",boxId).order("created_at",{ascending:false}).limit(safe);if(result.error)error("A CsomagBOX előzményei nem tölthetők be.",result.error);return((result.data||[]) as DbEvent[]).map(row=>({id:row.id,eventType:row.event_type,summary:row.summary,actorUserId:row.actor_user_id||"",entityType:row.entity_type,entityId:row.entity_id,metadata:row.metadata||{},createdAt:row.created_at}))}
