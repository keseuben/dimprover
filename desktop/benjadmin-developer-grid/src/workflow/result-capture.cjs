"use strict";
const protocol=require("./execution-result-protocol.cjs");
const {executionResultTranscriptScript}=require("../chatgpt/chatgpt-dom-adapter.cjs");

async function captureExecutionResultTranscript(view,envelope,conversationId) {
  if(!view || view.webContents.isDestroyed() || !protocol.verifyEnvelope(envelope) || !conversationId) return null;
  const input={conversationId,resultId:envelope.resultId};
  const capture=()=>view.webContents.executeJavaScript(executionResultTranscriptScript(input),true).catch(()=>null);
  const hasFullResult=data=>data?.ok && data.conversationId===conversationId && data.messages?.some(message=>{
    if(message.role!=="USER")return false;
    const actual=protocol.parseResult(message.text);
    return protocol.verifyEnvelope(actual)&&protocol.canonical(actual)===protocol.canonical(envelope);
  });
  let result=await capture();
  if(!result?.ok || result.generating || result.conversationId!==conversationId || hasFullResult(result)) return result;
  const disclosure=await view.webContents.executeJavaScript(executionResultTranscriptScript({...input,expand:true}),true).catch(()=>null);
  if(disclosure?.expanded!==true || disclosure.conversationId!==conversationId)return result;
  // React may commit the disclosure asynchronously. Never click twice or resend.
  for(let attempt=0;attempt<3;attempt++) {
    await new Promise(resolve=>setTimeout(resolve,100));
    result=await capture();
    if(!result?.ok || result.generating || result.conversationId!==conversationId || hasFullResult(result))break;
  }
  return result;
}
module.exports={captureExecutionResultTranscript};
