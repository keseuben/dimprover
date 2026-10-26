"use strict";
// Match the complete sent message. Only the observed ChatGPT disclosure chrome
// may follow it; a matching marker/JSON subset is never delivery evidence.
function matchesExecutionResultTranscript(text,prompt) {
  const normalize=value=>String(value || "").replace(/\s+/g," ").trim();
  const expected=normalize(prompt),actual=normalize(text);
  if(!expected)return false;
  if(actual===expected)return true;
  return [" … Több mutatása"," … Show more"," Kevesebb mutatása"," Show less"].some(suffix=>actual===expected+suffix);
}
module.exports={matchesExecutionResultTranscript};
