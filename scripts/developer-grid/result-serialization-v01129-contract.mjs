import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const protocol=require('../../desktop/benjadmin-developer-grid/src/workflow/execution-result-protocol.cjs');
const values=['<p className="text-xs [18em]">`code` & jel</p>\r\nC:\\source\\file\n\ufeff','\\u003c \\" \\* _ * [link](path) # > | ~ {json} 😀 árvíztűrő','a'.repeat(9000)+'<h1 className="mt-2 text-2xl">cím</h1>\r\n'+' '.repeat(64000)];
for(const [i,output]of values.entries()){
 const envelope=protocol.makeEnvelope({taskId:'task-129',sessionId:'session-129',workerCode:'OUTMINAI',requestId:'req-'+i,sourceProofSha256:'a'.repeat(64),action:'RUN_DEV_COMMAND',execution:{status:'FAIL',code:'EXECUTION_COMMAND_FAIL',summary:'LINT sikertelen.',data:{command:'LINT',exitCode:1,output}}});
 const text=protocol.serializeEnvelope(envelope);
 // Reproduce the quote/backslash escaping observed in the real ChatGPT turn.
 const throughEditor=text.replace(/\\(?=["\\])/g,'\\\\');assert.equal(throughEditor,text);
 const actual=JSON.parse(throughEditor);assert.deepEqual(actual,envelope);assert.equal(actual.data.output,output);assert(protocol.verifyEnvelope(actual));assert.equal(actual.resultSha256,envelope.resultSha256);
 assert.equal(actual.action,'RUN_DEV_COMMAND');assert(text.includes('"requestId"'));assert(text.includes('"sourceProofSha256"'));
 console.log('PASS '+(i+1)+' exact data and signed identity through rich-text quote escaping');
}
console.log('Grid 0.1.132 serialization runtime PASS 3/3');
