"use strict";

// A send attempt is durable before touching Send. An uncertain delivery is
// observed again; it never becomes a fresh insertion or a second send.
function createStageDispatch({read,patch,verify,capture,insert,send,allowed,hash,running=new Set()}) {
  return async function dispatch({task,workerCode,action,stage,prompt,conversationId,proof}) {
    const worker=String(workerCode).toUpperCase().replace(/^BENJAMINAI$/,"BENAI");
    if(running.has(worker))return {ok:false,error:"STAGE_DISPATCH_BUSY"};
    running.add(worker);
    try {
      const identity={taskId:task.id,sessionId:task.sessionId,workerCode:worker,action,stage,head:task.sourceHead,proof,conversationId,promptSha256:hash(prompt)};
      const id="stage-"+hash(JSON.stringify(identity)),marker="BENJADMIN_STAGE_REQUEST_ID: "+id;
      const boundPrompt=prompt+"\n"+marker;
      const saved=read(task.id).stageDispatch;
      if(saved&&saved.id!==id&&["PREPARING","INSERTED","SEND_ATTEMPTED"].includes(saved.phase))return {ok:false,error:"PREVIOUS_STAGE_DELIVERY_PENDING"};
      let receipt=saved?.id===id?saved:{...identity,id,marker,phase:"PREPARING"};
      const save=phase=>{receipt={...receipt,phase};patch(task,worker,{stageDispatch:receipt});};
      if(receipt.phase==="SENT_CONFIRMED")return {ok:true,mode:"sent",duplicate:true,requestId:id};
      if(!allowed())return {ok:false,error:"STAGE_CONTROL_CHANGED"};
      const observed=await verify(marker);
      if(observed?.verified){save("SENT_CONFIRMED");return {ok:true,mode:"sent",recovered:true,requestId:id};}
      if(receipt.phase==="SEND_ATTEMPTED")return {ok:false,error:"STAGE_DELIVERY_UNCERTAIN",requestId:id};
      const state=await capture();
      if(!state?.ok||state.generating)return {ok:false,error:"CHAT_BUSY_OR_UNAVAILABLE"};
      if(!allowed())return {ok:false,error:"STAGE_CONTROL_CHANGED"};
      save("PREPARING");
      const insertion=await insert(boundPrompt,marker);
      if(!insertion?.inserted||!insertion.verifiedMarker)return {ok:false,error:insertion?.reason||"STAGE_COMPOSER_BUSY",requestId:id};
      save("INSERTED");
      if(!allowed())return {ok:false,error:"STAGE_CONTROL_CHANGED"};
      save("SEND_ATTEMPTED");
      await send(marker,allowed);
      const proofOfSend=await verify(marker,true);
      if(!proofOfSend?.verified)return {ok:false,error:"STAGE_DELIVERY_UNCERTAIN",requestId:id};
      save("SENT_CONFIRMED");
      return {ok:true,mode:"sent",requestId:id};
    } finally {running.delete(worker);}
  };
}
function automaticPreflightPrompt(task,workerCode,proof,protocolLines,requestId) {
  const source=String(task.sourcePrompt||task.description||"").trim();
  if(!source)throw Object.assign(new Error("Az eredeti feladatutasítás hiányzik."),{code:"PREFLIGHT_ORIGINAL_INSTRUCTION_REQUIRED"});
  return ["BENJADMIN_PROMPT_KIND: EXECUTION_PREFLIGHT_V1","AUTOMATIKUS FORRÁSELLENŐRZÉS · UGYANAZ A FELADAT · DEV ONLY · PROD DENY",
    `Worker: ${String(workerCode).replace(/^BENAI$/,"BENJAMINAI")}`,`Task: ${task.id}`,`Session: ${task.sessionId}`,`HEAD: ${task.sourceHead}`,`Source proof: ${proof}`,
    "EREDETI FELHASZNÁLÓI UTASÍTÁS ÉS KORLÁTAI:",source,
    "A BOOT ACK validált. Az automatikus mód az eredeti feladat engedélyeit és a csevegés későbbi felhasználói tiltásait nem bővíti. Ha az utasítás engedi az olvasást, kérj pontosan egy GIT_STATUS ellenőrzést az alábbi protokollal, majd várj az eredményre. Ha végrehajtási tilalom áll fenn, ne kérj műveletet; jelentsd a konkrét korlátozást. Írást, buildet vagy kihelyezést ez az üzenet nem engedélyez.",
    ...protocolLines.map(line=>String(line).replaceAll("req-001",requestId))].join("\n");
}
module.exports={createStageDispatch,automaticPreflightPrompt};
