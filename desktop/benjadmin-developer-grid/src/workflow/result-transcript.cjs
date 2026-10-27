"use strict";
const protocol=require("./execution-result-protocol.cjs");
function matchesExecutionResultTranscript(text,prompt) {
  const expectedEnvelope=protocol.parseResult(prompt);
  if(expectedEnvelope?.schemaVersion===2){const actual=protocol.parseResult(text);return protocol.verifyEnvelope(expectedEnvelope)&&protocol.verifyEnvelope(actual)&&protocol.canonical(actual)===protocol.canonical(expectedEnvelope);}
  const normalize=value=>String(value || "").replace(/\s+/g," ").trim();
  const expected=normalize(prompt),actual=normalize(text);
  if(!expected)return false;
  if(actual===expected)return true;
  return [" … Több mutatása"," … Show more"," Kevesebb mutatása"," Show less"].some(suffix=>actual===expected+suffix);
}
module.exports={matchesExecutionResultTranscript};
