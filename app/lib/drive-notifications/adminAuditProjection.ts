export type AuditMembership = {
  userId:string;email?:string;displayName:string;role:string;status:string;
};
export type AuditDelivery = {
  id:string;project_id:string;user_id:string;category:string;scheduled_slot:string;
  status:string;attempt_count:number;created_at:string;sent_at:string|null;
  completed_at:string|null;last_error_code:string|null;recipient_email_sha256:string|null;
};

export function projectAdminDeliveryAudit(
  projectId:string,
  deliveries:readonly AuditDelivery[],
  memberships:readonly AuditMembership[],
  roleLabel:(role:string)=>string,
) {
  const mapped=new Map<string,AuditMembership>();
  for(const member of memberships){
    if(member.userId) mapped.set(member.userId.trim().toLowerCase(),member);
    if(member.email) mapped.set(member.email.trim().toLowerCase(),member);
  }
  return deliveries.filter((row)=>row.project_id===projectId).map((delivery)=>{
    const member=mapped.get(delivery.user_id.trim().toLowerCase());
    return {
      id:delivery.id,category:delivery.category,scheduledSlot:delivery.scheduled_slot,
      status:delivery.status,attempts:delivery.attempt_count,
      createdAt:delivery.created_at,completedAt:delivery.completed_at,
      smtpAcceptedAt:delivery.sent_at,lastErrorCode:delivery.last_error_code,
      recipient:{
        displayName:member?.displayName || "Korábbi / fel nem oldott projekttag",
        currentProjectRole:member?roleLabel(member.role):null,
        currentProjectEmail:member?.email || null,
        membershipStatus:member?.status || null,
        // Hash-only delivery recipient; membership email can differ from the historical SMTP address.
        sentRecipientEmailSha256:delivery.recipient_email_sha256,
      },
    };
  });
}
