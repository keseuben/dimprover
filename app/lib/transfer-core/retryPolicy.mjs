/**
 * Shared browser-safe retry policy for DIMPRO Drop/Drive.
 * Pure JavaScript ESM so both Node contract tests and Next.js can use one source.
 * @typedef {"RETRYABLE"|"PERMANENT"|"ABORTED"} TransferRetryClassification
 */
/** @param {unknown} error @returns {TransferRetryClassification} */
export function classifyTransferRetry(error) {
  if (error instanceof Error && error.name === "AbortError") return "ABORTED";
  const value = error && typeof error === "object" ? error : {};
  const status = typeof value.status === "number" ? value.status : 0;
  if ([401,403,404,409,413,422,507].includes(status)) return "PERMANENT";
  if ([408,425,429].includes(status) || status >= 500) return "RETRYABLE";
  if (status >= 400) return "PERMANENT";
  return "RETRYABLE";
}
/** @param {number} attempt */
export function transferRetryDelayMs(attempt) {
  return Math.min(8000,600 * 2 ** Math.max(0,Math.min(7,attempt-1)));
}
/** @param {number} ms @param {AbortSignal} signal @returns {Promise<void>} */
export function waitForTransferDelay(ms,signal) {
  return new Promise((resolve,reject)=>{
    if (signal.aborted) { reject(new DOMException("Az átvitel megszakadt.","AbortError")); return; }
    const done=()=>{clearTimeout(timer);signal.removeEventListener("abort",onAbort);};
    const onAbort=()=>{done();reject(new DOMException("Az átvitel megszakadt.","AbortError"));};
    const timer=setTimeout(()=>{done();resolve();},ms);
    signal.addEventListener("abort",onAbort,{once:true});
  });
}
/** @param {"single"|"multipart"} protocol @param {boolean} checkpointSupported
 * @returns {"FULL_FILE_RETRY"|"PART_CHECKPOINT"|"NONE"}
 */
export function transferResumeCapability(protocol,checkpointSupported) {
  if(protocol==="multipart" && checkpointSupported)return "PART_CHECKPOINT";
  if(protocol==="single")return "FULL_FILE_RETRY";
  return "NONE";
}
