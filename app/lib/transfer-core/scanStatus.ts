import type { TransferPhase } from "./transferModel";

export type TransferScanStatus = "PENDING" | "RUNNING" | "CLEAN" | "INFECTED" | "ERROR" | "UNKNOWN";

export function mapTransferScanStatus(value: unknown): {
  phase: Extract<TransferPhase,"SCAN_PENDING" | "SCANNING" | "AWAITING_REVIEW" | "INFECTED" | "SCAN_FAILED">;
  final: boolean;
} {
  const valueText = typeof value === "string" ? value.trim().toUpperCase() : "UNKNOWN";
  if (valueText === "CLEAN") return {phase:"AWAITING_REVIEW",final:true};
  if (valueText === "INFECTED") return {phase:"INFECTED",final:true};
  if (valueText === "ERROR" || valueText === "FAILED" || valueText === "TIMEOUT") return {phase:"SCAN_FAILED",final:true};
  if (valueText === "RUNNING" || valueText === "SCANNING" || valueText === "IN_PROGRESS") return {phase:"SCANNING",final:false};
  return {phase:"SCAN_PENDING",final:false};
}

export function validDriveTransferReference(value: string): boolean {
  // Project/document IDs may have mixed UUID/slug formats; only path segment
  // encoded data is accepted, not an arbitrary URL or unbounded string.
  return value.length > 0 && value.length <= 180 && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function driveTransferScanStatusUrl(input: {
  projectId: string;
  documentId: string;
  versionId: string;
}): string | null {
  if (![input.projectId,input.documentId,input.versionId].every(validDriveTransferReference)) return null;
  return "/api/projects/" + encodeURIComponent(input.projectId) + "/drive/documents/" +
    encodeURIComponent(input.documentId) + "/versions/" +
    encodeURIComponent(input.versionId) + "/security-scan";
}

export type TransferScanPollResult = {
  phase: ReturnType<typeof mapTransferScanStatus>["phase"];
  final: boolean;
  error: string | null;
  httpStatus: number | null;
};

export async function pollDriveTransferScan(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<TransferScanPollResult> {
  const url = driveTransferScanStatusUrl(input);
  if (!url) return {phase:"SCAN_PENDING",final:true,error:"Érvénytelen dokumentum- vagy verzióazonosító.",httpStatus:null};
  const result = await (input.fetcher || fetch)(url,{
    method:"GET",
    credentials:"same-origin",
    cache:"no-store",
    signal:input.signal,
    headers:{"accept":"application/json"},
  });
  if (result.status === 401 || result.status === 403 || result.status === 404) {
    return {phase:"SCAN_PENDING",final:true,httpStatus:result.status,error:"A státuszlekérdezéshez nincs hozzáférés vagy a dokumentum már nem érhető el."};
  }
  if (!result.ok) return {phase:"SCAN_PENDING",final:false,httpStatus:result.status,error:"A vírusellenőrzés állapota most nem kérdezhető le."};
  let data: {ok?: boolean;status?: unknown;scan?:{status?:unknown}};
  try { data = await result.json(); }
  catch { return {phase:"SCAN_PENDING",final:false,httpStatus:result.status,error:"Hibás biztonsági státuszválasz."}; }
  if (!data.ok) return {phase:"SCAN_PENDING",final:false,httpStatus:result.status,error:"A vizsgálati állapot nem ellenőrizhető."};
  const mapped = mapTransferScanStatus(data.scan?.status || data.status);
  return { ...mapped,httpStatus:result.status,error:null };
}

export type TransferUploadStatusResult = {
  status: "INITIATED" | "FINALIZED" | "ABORTED" | "FAILED" | "EXPIRED" | "UNKNOWN";
  documentId: string | null;
  versionId: string | null;
};
export async function pollDriveUploadFinalization(input:{
  projectId:string;
  uploadId:string;
  signal?:AbortSignal;
  fetcher?:typeof fetch;
}):Promise<TransferUploadStatusResult>{
  if(!validDriveTransferReference(input.projectId)||!validDriveTransferReference(input.uploadId)){
    throw new Error("Érvénytelen upload-azonosító.");
  }
  const url="/api/projects/"+encodeURIComponent(input.projectId)+"/drive/uploads/"+
    encodeURIComponent(input.uploadId)+"/status";
  const result=await (input.fetcher || fetch)(url,{
    method:"GET",credentials:"same-origin",cache:"no-store",
    signal:input.signal,headers:{"accept":"application/json"},
  });
  if(!result.ok) {
    throw Object.assign(new Error("A véglegesítési állapot nem kérdezhető le."),{status:result.status});
  }
  const payload=await result.json() as {ok?:boolean;status?:unknown;finalizedDocumentId?:unknown;finalizedVersionId?:unknown};
  if(!payload.ok)throw new Error("A véglegesítési állapot hiányzik.");
  const status=typeof payload.status==="string" && ["INITIATED","FINALIZED","ABORTED","FAILED","EXPIRED"].includes(payload.status)
    ? payload.status as TransferUploadStatusResult["status"]:"UNKNOWN";
  return {
    status,
    documentId:status==="FINALIZED" && typeof payload.finalizedDocumentId==="string"?payload.finalizedDocumentId:null,
    versionId:status==="FINALIZED" && typeof payload.finalizedVersionId==="string"?payload.finalizedVersionId:null,
  };
}
