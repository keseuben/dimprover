import "server-only";
import { createHash } from "node:crypto";
import { authQuery } from "@/app/lib/dimpro-auth/db";
import { getProjectAccess } from "@/app/lib/project-core/store";
import { listDriveTreeForAccess } from "@/app/lib/drive-core/store";
import type { DriveChangeEvent } from "@/app/lib/drive-core/types";
import { getDatabaseClient } from "@/app/lib/drive-core/databaseRepository";
import { listDriveDocumentFollows } from "@/app/lib/drive-core/followRepository";
import { buildRecipientDigest } from "./digestCore";
import { buildDigestWorkbook } from "./digestAttachment";
import { renderDigestHtml } from "./digestCore";
import type { DeliveryTicket } from "./deliveryRepository";
import { listDriveDigestPreferences } from "./preferenceRepository";
import { filterFollowedDigestEvents } from "./followPolicy";

export type VerifiedDigestMessage = {
  to: string;
  emailHash: string;
  subject: string;
  text: string;
  html: string;
  xlsx: Buffer;
  eventIds: string[];
};
export type VerifiedDigestPlan = { status: "SUPPRESSED"; reason: string }
  | { status: "READY"; message: VerifiedDigestMessage };

type VerifiedAuthRow = {
  id: string;
  email_normalized: string;
  display_name: string | null;
  email_verified_at: string | null;
  status: string;
  login_enabled: boolean;
};
type DbChangeRow = {
  id: string; sequence: number | string; project_id: string; event_type: string;
  entity_type: DriveChangeEvent["entityType"]; entity_id: string;
  actor_user_id: string; created_at: string; payload: Record<string, unknown> | null;
};
/**
 * Fail closed when anything can't be revalidated. No SMTP action in this function.
 * Only a central verified account with active project membership can receive a digest.
 * No BCC and no other recipients' identities are inserted in the outgoing content.
 */
export async function prepareVerifiedDigest(ticket: DeliveryTicket): Promise<VerifiedDigestPlan> {
  if (!ticket.eventIds.length || ticket.eventIds.length > 250) return { status:"SUPPRESSED",reason:"EMPTY_OR_INVALID_QUEUE" };
  if (!ticket.userId || !ticket.projectId) return { status:"SUPPRESSED",reason:"QUEUE_IDENTITY_INVALID" };

  const identity = await authQuery<VerifiedAuthRow>(
    `SELECT id::text,email_normalized,display_name,email_verified_at::text,status,login_enabled
       FROM public.auth_users WHERE id::text=$1 LIMIT 1`,
    [ticket.userId],
  );
  const user = identity.rows[0];
  if (!user || user.status !== "ACTIVE" || !user.login_enabled
    || !user.email_verified_at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email_normalized)) {
    return {status:"SUPPRESSED",reason:"AUTH_IDENTITY_NOT_ACTIVE_VERIFIED"};
  }

  const access = await getProjectAccess(ticket.projectId,[user.id,user.email_normalized]);
  if (!access || !access.permissions.includes("document.read")
    || ![user.id.toLowerCase(),user.email_normalized.toLowerCase()].includes(access.membership.userId.toLowerCase())
       && access.membership.email?.toLowerCase() !== user.email_normalized.toLowerCase()) {
    return {status:"SUPPRESSED",reason:"PROJECT_MEMBERSHIP_REVOKED"};
  }
  const preferences = await listDriveDigestPreferences(ticket.projectId,user.id);
  const preference = preferences.find((row) => row.category === ticket.category);
  if (!preference?.enabled || preference.digestFrequency==="NONE"
    || preference.digestFrequency !== ticket.digestFrequency) {
    return {status:"SUPPRESSED",reason:"NOTIFICATION_CONSENT_REVOKED"};
  }

  const tree = await listDriveTreeForAccess(ticket.projectId,access);
  const names = new Map(tree.documents.map((document) => [
    document.id,document.currentVersion?.originalName || document.name,
  ]));
  const approvalAllowed = access.permissions.includes("document.approve");
  const { data, error } = await getDatabaseClient().from("drive_core_change_events")
    .select("id,sequence,project_id,event_type,entity_type,entity_id,actor_user_id,created_at,payload")
    .eq("project_id",ticket.projectId).in("id",ticket.eventIds);
  if(error) throw new Error("DRIVE_DIGEST_EVENT_READ_FAILED");
  const rows = (data||[]) as DbChangeRow[];
  const changes:DriveChangeEvent[] = rows.map((row) => ({
    id:row.id,sequence:Number(row.sequence),projectId:row.project_id,
    eventType:row.event_type,entityType:row.entity_type,entityId:row.entity_id,
    actorUserId:row.actor_user_id,createdAt:row.created_at,payload:row.payload||{},
  }));
  const authorized = buildRecipientDigest(changes,{
    userId:user.id,projectId:ticket.projectId,visibleDocumentIds:new Set(names.keys()),
    approvalDocumentIds:approvalAllowed?new Set(names.keys()):new Set(),
    enabledCategories:new Set([ticket.category]),
  });
  const follows = preference.followedOnly
    ? await listDriveDocumentFollows(ticket.projectId,user.id):[];
  const items=filterFollowedDigestEvents(authorized,preference.followedOnly,follows);
  if (!items.length)return {status:"SUPPRESSED",reason:"NO_CURRENTLY_AUTHORIZED_EVENTS"};

  const subjectPrefix=ticket.category==="DOCUMENT_CHANGES"?"Dokumentumváltozások":"Tervellenőrzési döntések";
  const subject=`DIMPRO Drive · ${subjectPrefix} · ${access.project.name.slice(0,120)}`;
  const html=renderDigestHtml({
    projectTitle:access.project.name,periodLabel:"Jogosultság szerint összeállított értesítési összesítő",
    items,namesByDocumentId:names,
  });
  const xlsx=buildDigestWorkbook({
    projectTitle:access.project.name,period:"DIMPRO Drive változásértesítő",
    recipientLabel:user.display_name || user.email_normalized,
    approvedItems:items,accessibleNames:names,
  });
  if(!html||!xlsx)return {status:"SUPPRESSED",reason:"EMPTY_RENDER"};
  const text=[
    "DIMPRO Drive változásértesítő",access.project.name,
    ...items.map((item)=>`- ${item.kind}: ${names.get(item.documentId)||""}`),
    "Az értesítés csak az Önnek látható dokumentumokat tartalmazza.",
  ].join("\n");
  return {status:"READY",message:{
    to:user.email_normalized,
    emailHash:createHash("sha256").update(user.email_normalized).digest("hex"),
    subject,html,text,xlsx,eventIds:items.map((item)=>item.eventId),
  }};
}
