"use strict";

const { createHash } = require("node:crypto");
const { ROLLOVER_ACK_MARKER } = require("./conversation-rollover.cjs");

const ROLLOVER_REACK_PROMPT_MARKER = "BENJADMIN_PROMPT_KIND: CONVERSATION_ROLLOVER_REACK_V1";
const ROLLOVER_REACK_KEY_MARKER = "BENJADMIN_ROLLOVER_REACK_KEY";

function identityPayload(identity) {
  return {
    schemaVersion:1,
    taskId:String(identity?.taskId || ""),
    sessionId:String(identity?.sessionId || ""),
    workerCode:String(identity?.workerCode || "").toUpperCase(),
    previousConversationId:String(identity?.previousConversationId || ""),
    contextSnapshotId:String(identity?.contextSnapshotId || ""),
    contextRevision:Number(identity?.contextRevision || 0),
    handoffPackId:String(identity?.handoffPackId || ""),
    sourceHead:String(identity?.sourceHead || "").toLowerCase(),
    sourceProofSha256:String(identity?.sourceProofSha256 || "").toLowerCase(),
    productionAccess:"DENY",
    sameTask:true,
    newTaskLaunch:false,
  };
}

function reAckKey(identity) {
  return createHash("sha256").update(JSON.stringify(identityPayload(identity))).digest("hex");
}

function buildConversationRolloverReAckPrompt(identity) {
  const ack = identityPayload(identity);
  const key = reAckKey(identity);
  const verificationMarker = ROLLOVER_REACK_KEY_MARKER + ": " + key;
  return {
    key,
    marker:ROLLOVER_REACK_PROMPT_MARKER,
    verificationMarker,
    prompt:[
      ROLLOVER_REACK_PROMPT_MARKER,
      "BENJADMIN CONTROL EVENT · ROLLOVER RE-ACK · SAME TASK · NO NEW TASK",
      verificationMarker,
      "A Grid a felhasználó által kiválasztott successor csevegést ugyanahhoz az authoritative taskhoz kötötte ACK_WAIT állapotban.",
      "A korábbi rollover ACK már nem látható megbízhatóan a mounted ChatGPT DOM-ban, ezért ugyanazt az identitást újra meg kell erősítened.",
      "DEV ONLY · PROD DENY.",
      "",
      "VÁLASZ SZABÁLY:",
      "- A válaszod KIZÁRÓLAG a BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1 markerből és az alábbi nyers JSON objektumból állhat.",
      "- Az ACK előtt és ugyanebben a válaszban NE hívj semmilyen eszközt, MCP-t, VPS-t, shellt, webet vagy fájlműveletet.",
      "- Ne hozz létre új taskot, sessiont, worktree-t, branchet vagy TASK_LAUNCH-ot.",
      "- Az ACK után várd meg a Grid automatikus CONVERSATION_ROLLOVER_READY_V1 vezérlőüzenetét.",
      "",
      ROLLOVER_ACK_MARKER,
      JSON.stringify(ack, null, 2),
    ].join("\n"),
  };
}

module.exports = {
  ROLLOVER_REACK_PROMPT_MARKER,
  ROLLOVER_REACK_KEY_MARKER,
  identityPayload,
  reAckKey,
  buildConversationRolloverReAckPrompt,
};
