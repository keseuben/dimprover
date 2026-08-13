import assert from "node:assert/strict";
const saved={
 gate:process.env.DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED,
 oi:process.env.DIMPRO_EXTERNAL_AI_OPENAI_INPUT_HUF_PER_MTOKEN,
 oo:process.env.DIMPRO_EXTERNAL_AI_OPENAI_OUTPUT_HUF_PER_MTOKEN,
 ci:process.env.DIMPRO_EXTERNAL_AI_CLAUDE_INPUT_HUF_PER_MTOKEN,
 co:process.env.DIMPRO_EXTERNAL_AI_CLAUDE_OUTPUT_HUF_PER_MTOKEN,
 openai:process.env.OPENAI_API_KEY,
 anthropic:process.env.ANTHROPIC_API_KEY,
};
Object.assign(process.env,{DIMPRO_EXTERNAL_AI_OPENAI_INPUT_HUF_PER_MTOKEN:"1000",DIMPRO_EXTERNAL_AI_OPENAI_OUTPUT_HUF_PER_MTOKEN:"2000",DIMPRO_EXTERNAL_AI_CLAUDE_INPUT_HUF_PER_MTOKEN:"1200",DIMPRO_EXTERNAL_AI_CLAUDE_OUTPUT_HUF_PER_MTOKEN:"2400"});
const mod=await import(`../app/lib/dev-center/ai-worker/provider-executor.ts?contract=${Date.now()}`);
let passed=0;const check=(name,fn)=>{fn();passed+=1;console.log(`PASS ${name}`)};const checkAsync=async(name,fn)=>{await fn();passed+=1;console.log(`PASS ${name}`)};
try{
 check("OpenAI Responses endpoint és body contract",()=>{const r=mod.buildOpenAiProviderRequest({modelId:"test-model",prompt:"hello",maxOutputTokens:900},"test-secret");assert.equal(r.url,"https://api.openai.com/v1/responses");assert.equal(r.body.model,"test-model");assert.equal(r.body.input,"hello");assert.equal(r.body.max_output_tokens,900);assert.equal(r.body.store,false);assert.equal(r.headers.authorization,"Bearer test-secret")});
 check("Anthropic Messages endpoint és header/body contract",()=>{const r=mod.buildAnthropicProviderRequest({modelId:"test-claude",prompt:"hello",maxOutputTokens:700},"test-secret");assert.equal(r.url,"https://api.anthropic.com/v1/messages");assert.equal(r.headers["anthropic-version"],"2023-06-01");assert.equal(r.headers["x-api-key"],"test-secret");assert.equal(r.body.model,"test-claude");assert.equal(r.body.max_tokens,700);assert.deepEqual(r.body.messages,[{role:"user",content:"hello"}])});
 check("OpenAI response parser output + usage + HUF költség",()=>{const r=mod.parseOpenAiProviderResponse({id:"resp_1",model:"test-model",status:"completed",output:[{content:[{type:"output_text",text:"ok"}]}],usage:{input_tokens:1000,output_tokens:500,total_tokens:1500}},"fallback");assert.equal(r.outputText,"ok");assert.equal(r.totalTokens,1500);assert.equal(r.costHuf,2)});
 check("Anthropic response parser output + usage + HUF költség",()=>{const r=mod.parseAnthropicProviderResponse({id:"msg_1",model:"test-claude",stop_reason:"end_turn",content:[{type:"text",text:"done"}],usage:{input_tokens:1000,output_tokens:500}},"fallback");assert.equal(r.outputText,"done");assert.equal(r.totalTokens,1500);assert.equal(r.costHuf,2.4)});
 check("Költség csak explicit HUF/Mtoken konfigurációból",()=>{assert.deepEqual(mod.externalProviderPricing("openai"),{configured:true,inputHufPerMillion:1000,outputHufPerMillion:2000})});
 delete process.env.DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED;delete process.env.OPENAI_API_KEY;
 await checkAsync("Global gate OFF esetén hálózati hívás előtt fail-closed",async()=>{await assert.rejects(()=>mod.executeExternalAiProviderText({provider:"openai",modelId:"test-model",prompt:"hello"}),/global gate/) });
 console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
}finally{
 const map={DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED:saved.gate,DIMPRO_EXTERNAL_AI_OPENAI_INPUT_HUF_PER_MTOKEN:saved.oi,DIMPRO_EXTERNAL_AI_OPENAI_OUTPUT_HUF_PER_MTOKEN:saved.oo,DIMPRO_EXTERNAL_AI_CLAUDE_INPUT_HUF_PER_MTOKEN:saved.ci,DIMPRO_EXTERNAL_AI_CLAUDE_OUTPUT_HUF_PER_MTOKEN:saved.co,OPENAI_API_KEY:saved.openai,ANTHROPIC_API_KEY:saved.anthropic};for(const [k,v] of Object.entries(map)){if(v==null)delete process.env[k];else process.env[k]=v}
}
