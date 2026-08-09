const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = process.cwd();
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return originalResolve.call(this, request, parent, isMain, options);
};
require.extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,moduleResolution:ts.ModuleResolutionKind.Node10,jsx:ts.JsxEmit.ReactJSX},fileName:filename}).outputText;
  module._compile(output, filename);
};
const { DropSpeechTranscriptAccumulator, mergeDropSpeechTranscriptParts, formatDropSpeechTranscript } = require('../components/drop/dropSpeechTranscript.ts');
const { buildDropPublicDeliveryEmailContent } = require('../app/lib/drop/public/dropPublicEmailTemplate.ts');
const { buildDropPackageTextReport } = require('../app/lib/drop/report/dropPackageTextReport.ts');
const checks=[];
function check(name, condition, detail='') { assert.ok(condition, `${name}${detail ? `: ${detail}` : ''}`); checks.push(name); }
function event(resultIndex, rows) {
  const results = { length: rows.length };
  rows.forEach((row,index)=>{ results[index] = { isFinal: !!row.final, 0: { transcript: row.text } }; });
  return { resultIndex, results };
}
const a=new DropSpeechTranscriptAccumulator();
check('speech-evolving-1',a.update(event(0,[{text:'ez',final:false}]))==='Ez');
check('speech-evolving-2',a.update(event(0,[{text:'ez egy',final:false}]))==='Ez egy');
check('speech-evolving-final',a.update(event(0,[{text:'ez egy próba',final:true}]))==='Ez egy próba');
a.reset();
a.update(event(0,[{text:'helyszín',final:true}]));
check('speech-overlap-adjacent',a.update(event(1,[{text:'helyszín',final:true},{text:'helyszín körül',final:false}]))==='Helyszín körül');
a.reset();
a.update(event(0,[{text:'nincs',final:false}]));
check('speech-no-append-repeat',a.update(event(0,[{text:'nincs megjegyzésem',final:true}]))==='Nincs megjegyzésem');
check('speech-legitimate-repetition-kept',mergeDropSpeechTranscriptParts(['nagyon nagyon jó'])==='nagyon nagyon jó');
check('speech-overlap-multiword',mergeDropSpeechTranscriptParts(['ez egy helyszín','egy helyszín körül'])==='ez egy helyszín körül');

const files=[];
for (let i=1;i<=4;i++) files.push({id:`b${i}`,name:`bocskai_${i}.jpg`,sizeBytes:1000,comments:[`B megjegyzés ${i}`],mimeType:'image/jpeg',isImage:true,storageKey:`b/${i}`,groupId:'g1',groupName:'Bocskai',groupSortOrder:10});
for (let i=1;i<=7;i++) files.push({id:`k${i}`,name:`kossuth_${i}.jpg`,sizeBytes:1000,comments:[],mimeType:'image/jpeg',isImage:true,storageKey:`k/${i}`,groupId:'g2',groupName:'Kossuth',groupSortOrder:20});
files.push({id:'u1',name:'egyeb.jpg',sizeBytes:1000,comments:[],mimeType:'image/jpeg',isImage:true,storageKey:'u/1',groupId:null,groupName:null,groupSortOrder:Number.MAX_SAFE_INTEGER});
const email=buildDropPublicDeliveryEmailContent({recipientName:'Teszt',uploaderName:'Feladó',uploaderEmail:'sender@example.invalid',subject:'Teszt',senderMessage:'Üzenet',packageNote:'',expiresAt:'2026-08-10T12:00:00Z',files,downloadUrl:'https://drop.dimpro.hu/d/test',downloadPin:null,previewBundle:{previews:[],attachments:[],eligibleCount:0,attemptedCount:0,skippedCount:0,errors:[],totalBytes:0}});
const b=email.html.indexOf('Bocskai'); const k=email.html.indexOf('Kossuth'); const u=email.html.indexOf('Csoport nélkül');
check('email-group-order',b>=0&&k>b&&u>k,`${b}/${k}/${u}`);
check('email-group-counts',email.html.includes('4 kép/fájl')&&email.html.includes('7 kép/fájl'));
check('email-group-anchors',email.html.includes('href="#drop-group-1"')&&email.html.includes('id="drop-group-1"'));
check('email-text-group-sections',email.text.includes('=== BOCSKAI · 4 KÉP/FÁJL ===')&&email.text.includes('=== KOSSUTH · 7 KÉP/FÁJL ==='));

const now='2026-08-09T06:00:00.000Z';
const bundle={
 packageRow:{id:'p1',public_code:'DMP-TEST',title:'Teszt csomag',uploader_name:'Feladó',uploader_email:'sender@example.invalid',created_at:now,expires_at:'2026-08-10T06:00:00.000Z'},
 groups:[{id:'g1',package_id:'p1',name:'Bocskai',code:'BOCSKAI',description:null,sort_order:10,file_name_prefix:null,sequence_start:1,created_at:now,updated_at:now},{id:'g2',package_id:'p1',name:'Kossuth',code:'KOSSUTH',description:null,sort_order:20,file_name_prefix:null,sequence_start:1,created_at:now,updated_at:now}],
 files:files.map((f,index)=>({id:f.id,package_id:'p1',display_name:f.name,original_name:f.name,group_id:f.groupId,size_stored_bytes:f.sizeBytes,size_original_bytes:f.sizeBytes,created_at:now,updated_at:now})),
 comments:[{id:'c1',package_id:'p1',file_id:'b1',parent_comment_id:null,author_name:'Feladó',author_email:null,comment_text:'Teljes hosszú megjegyzés',status:'active',created_at:now,updated_at:now}],
 recipients:[], fileSourceMetrics:{}
};
const txt=buildDropPackageTextReport({bundle,workflow:null,tokenReference:'tok_***'}).buffer.toString('utf8');
const tb=txt.indexOf('=== BOCSKAI'); const tk=txt.indexOf('=== KOSSUTH'); const tu=txt.indexOf('=== CSOPORT NÉLKÜL');
check('txt-group-order',tb>=0&&tk>tb&&tu>tk,`${tb}/${tk}/${tu}`);
check('txt-full-comment-preserved',txt.includes('Teljes hosszú megjegyzés'));

check('speech-punctuation-basic',formatDropSpeechTranscript('ez egy próba pont ez egy másik mondat kérdőjel')==='Ez egy próba. Ez egy másik mondat?');
check('speech-punctuation-comma',formatDropSpeechTranscript('belső udvar vessző gépészeti akna')==='Belső udvar, gépészeti akna');
check('speech-punctuation-exclamation',formatDropSpeechTranscript('figyelem felkiáltójel javítandó pont')==='Figyelem! Javítandó.');
check('speech-punctuation-split-command',formatDropSpeechTranscript('veszély felkiáltó jel mindenki álljon meg pont')==='Veszély! Mindenki álljon meg.');
check('speech-literal-pont',formatDropSpeechTranscript('ez a szó szerint pont szó')==='Ez a pont szó');
check('speech-literal-kerdojel',formatDropSpeechTranscript('a szó szerint kérdőjel karakter neve')==='A kérdőjel karakter neve');
check('speech-existing-punctuation-capitalized',formatDropSpeechTranscript('első mondat. második mondat? harmadik')==='Első mondat. Második mondat? Harmadik');
console.log(JSON.stringify({ok:true,version:'DROP 1.2.10',checks:checks.length,names:checks},null,2));
