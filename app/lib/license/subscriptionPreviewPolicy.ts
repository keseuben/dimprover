/**
 * Read-only, no-side-effects subscription planning policy.
 * This module NEVER reads/writes an AUTH table, grants roles, deletes files,
 * changes an effective quota or interrupts active sessions.
 */
export const PREVIEW_POLICY_VERSION = "1.0.0";
export const PREVIEW_GRACE_DAYS = 14;
export const PREVIEW_GIB_BYTES = 1024 ** 3;

export type PreviewServiceStatus = "ACTIVE" | "PENDING" | "EXPIRED" | "SUSPENDED" | "NONE";
export type PreviewMode = "ACTIVE" | "PENDING" | "GRACE_RECOMMENDED" | "READ_ONLY_RECOMMENDED" | "NEEDS_OPERATOR_REVIEW";
export type PreviewPlanTarget = {
  product: "DRIVE" | "PROJECT_GATE";
  scope: "PERSONAL" | "PROJECT";
  quotaGiB: number | null;
  maxEditors: number | null;
  maxReadOnly: number | null;
};
export type SubscriptionPreviewInput = {
  currentStatus: PreviewServiceStatus;
  expiresAt: string | null;
  now: string;
  target: PreviewPlanTarget;
  // Trusted effective use counters must come from canonical storage and ACL
  // engines when wired; the UI currently provides *illustrative* numbers only.
  usedBytes: number;
  reservedBytes: number;
  activeEditors: number;
  readOnlyMembers: number;
};
export type SubscriptionPreviewResult = {
  mode: PreviewMode;
  switchDecision: "ELIGIBLE_FOR_OPERATOR_REVIEW" | "BLOCKED_UNTIL_RECONCILED";
  reasons: string[];
  daysSinceExpiry: number | null;
  usedGiB: number;
  reservedGiB: number;
  targetGiB: number | null;
  capacityShortfallGiB: number;
  editorShortfall: number;
  readerShortfall: number;
  preserveAssets: true;
  effectiveQuotaChanged: false;
  effectiveAccessChanged: false;
  appliesPrice: false;
};

function validCount(x:number):boolean{return Number.isSafeInteger(x)&&x>=0;}
function dateOrNull(value:string|null):number|null{
  if(value===null)return null;
  const ms=Date.parse(value);
  if(!Number.isFinite(ms))throw new Error("INVALID_EXPIRY_DATE");
  return ms;
}
export function evaluateSubscriptionPreview(input:SubscriptionPreviewInput):SubscriptionPreviewResult{
  const {currentStatus,target}=input;
  if(!Number.isFinite(Date.parse(input.now)))throw new Error("INVALID_PREVIEW_NOW");
  for(const [name,value] of [
    ["USED_BYTES",input.usedBytes],["RESERVED_BYTES",input.reservedBytes],
    ["EDITORS",input.activeEditors],["READERS",input.readOnlyMembers],
  ] as const){
    if(!validCount(value))throw new Error("INVALID_"+name);
  }
  if(!["ACTIVE","PENDING","EXPIRED","SUSPENDED","NONE"].includes(currentStatus))
    throw new Error("INVALID_LICENSE_STATUS");
  if(!["DRIVE","PROJECT_GATE"].includes(target.product)||
    !["PERSONAL","PROJECT"].includes(target.scope)||
    (target.product==="PROJECT_GATE"&&target.scope!=="PROJECT"))
    throw new Error("INVALID_PRODUCT_SCOPE");
  if(target.product==="DRIVE"&&
    (target.quotaGiB===null||!validCount(target.quotaGiB)||target.quotaGiB<1||target.quotaGiB>100000))
    throw new Error("INVALID_TARGET_QUOTA");
  if(target.product==="PROJECT_GATE"&&target.quotaGiB!==null)throw new Error("GATE_HAS_NO_EXTRA_STORAGE");
  if(target.maxEditors!==null&&(!validCount(target.maxEditors)||target.maxEditors<1))
    throw new Error("INVALID_EDITOR_LIMIT");
  if(target.maxReadOnly!==null&&!validCount(target.maxReadOnly))throw new Error("INVALID_READER_LIMIT");
  const now=Date.parse(input.now);
  const expiry=dateOrNull(input.expiresAt);
  const elapsed=expiry===null?null:Math.max(0,Math.floor((now-expiry)/86400000));
  let mode:PreviewMode="NEEDS_OPERATOR_REVIEW";
  if(currentStatus==="PENDING")mode="PENDING";
  else if(currentStatus==="ACTIVE"&&(expiry===null||now<=expiry))mode="ACTIVE";
  else if(currentStatus==="EXPIRED"||(currentStatus==="ACTIVE"&&expiry!==null&&now>expiry)){
    // Policy *recommendation*, not runtime access mutation.
    mode=expiry!==null&&elapsed!==null&&elapsed<=PREVIEW_GRACE_DAYS
      ? "GRACE_RECOMMENDED":"READ_ONLY_RECOMMENDED";
  }
  const targetGiB=target.quotaGiB;
  const occupied=input.usedBytes+input.reservedBytes;
  if(!Number.isSafeInteger(occupied))throw new Error("OCCUPIED_STORAGE_OVERFLOW");
  const capacityShortfallGiB=targetGiB===null?0:
    Math.max(0,(occupied-targetGiB*PREVIEW_GIB_BYTES)/PREVIEW_GIB_BYTES);
  const editorShortfall=target.maxEditors===null?0:Math.max(0,input.activeEditors-target.maxEditors);
  const readerShortfall=target.maxReadOnly===null?0:Math.max(0,input.readOnlyMembers-target.maxReadOnly);
  const reasons:string[]=[];
  if(capacityShortfallGiB>0)
    reasons.push("A célcsomag tárhelykerete kisebb a foglalt és lefoglalt kapacitásnál: csomagváltás tiltva automatikus törlés nélkül.");
  if(editorShortfall>0)
    reasons.push("A szerkesztői létszám meghaladja a javasolt keretet; jogosultságot nem szabad automatikusan visszavonni.");
  if(readerShortfall>0)
    reasons.push("A csak olvasó projekttagok száma meghaladja a javasolt keretet.");
  if(mode==="READ_ONLY_RECOMMENDED")
    reasons.push("A türelmi idő lejárt: külön jóváhagyandó read-only megőrzési működés, fájltörlés nélkül.");
  if(mode==="GRACE_RECOMMENDED")
    reasons.push("Türelmi időn belül: előzetes 14 napos megújítási időszak, jelenleg csak javaslat.");
  if(mode==="NEEDS_OPERATOR_REVIEW")
    reasons.push("Az előfizetés állapotának rendezése üzemeltetői döntést igényel.");
  if(reasons.length===0)reasons.push("Csomagváltás technikailag előkészíthető, de csak üzemeltetői jóváhagyás után hajtható végre.");
  return {
    mode, switchDecision:capacityShortfallGiB>0||editorShortfall>0||readerShortfall>0||
      mode==="PENDING"||mode==="NEEDS_OPERATOR_REVIEW"
        ?"BLOCKED_UNTIL_RECONCILED":"ELIGIBLE_FOR_OPERATOR_REVIEW",
    reasons,daysSinceExpiry:expiry===null?null:(now<=expiry?0:elapsed),
    usedGiB:input.usedBytes/PREVIEW_GIB_BYTES,reservedGiB:input.reservedBytes/PREVIEW_GIB_BYTES,
    targetGiB,capacityShortfallGiB,editorShortfall,readerShortfall,
    preserveAssets:true,effectiveQuotaChanged:false,effectiveAccessChanged:false,appliesPrice:false,
  };
}
