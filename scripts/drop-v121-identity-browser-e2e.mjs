import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const PORT = Number(process.env.DROP_IDENTITY_BROWSER_PORT || 3120);
const BASE = `http://127.0.0.1:${PORT}`;
const PUBLIC = `http://drop.dimpro.hu:${PORT}`;
function required(name){const v=process.env[name]?.trim(); assert.ok(v, `${name} hiányzik`); return v;}
async function api(path,{method='GET',host='drop.dimpro.hu',adminKey,body}={}){
  const res=await fetch(`${BASE}${path}`,{method,headers:{host,accept:'application/json',...(adminKey?{'x-dimpro-license-admin-key':adminKey}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await res.text(); let json=null; try{json=raw?JSON.parse(raw):null}catch{}
  return {status:res.status,ok:res.ok,raw,json};
}
async function rpcScalar(client,fn){const r=await client.rpc(fn); if(r.error) throw r.error; return String(r.data);}
const client=createClient(required('NEXT_PUBLIC_SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const adminKey=(await readFile('.dimprover/license/admin-key.txt','utf8')).trim();
const unique=`${Date.now().toString(36)}${Math.random().toString(16).slice(2,7)}`;
const manualSendCode=`UXTS-${String(Date.now()%1000000).padStart(6,'0').slice(0,3)}-${String(Date.now()%1000000).padStart(6,'0').slice(3)}`;
const fixture={userId:'',licenseId:'',projectId:'',entitlementId:'',projectCode:'',userCode:''};
let browser;
const checks=[];
function pass(name,condition,detail=''){assert.ok(condition,`${name}${detail?`: ${detail}`:''}`);checks.push(name);}
try{
  fixture.userCode=await rpcScalar(client,'dimpro_generate_user_code');
  const email=`identity-browser-${unique}@example.invalid`;
  const u=await client.from('dimpro_users').insert({public_user_code:fixture.userCode,full_name:'DIMPRO Identity Browser Teszt',email,email_normalized:email,email_verified_at:new Date().toISOString(),status:'active'}).select('id').single(); if(u.error) throw u.error; fixture.userId=u.data.id;
  const licenseCode=await rpcScalar(client,'dimpro_generate_license_code');
  const l=await client.from('dimpro_licenses').insert({public_license_code:licenseCode,owner_type:'user',owner_user_id:fixture.userId,product_code:'DIMPRO',plan_code:'BROWSER_E2E',status:'active',activated_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),max_devices:1}).select('id').single(); if(l.error) throw l.error; fixture.licenseId=l.data.id;
  fixture.projectCode=await rpcScalar(client,'dimpro_generate_project_code');
  const p=await client.from('dimpro_projects').insert({public_project_code:fixture.projectCode,name:`Identity Browser Projekt ${unique}`,short_name:'Identity Browser',status:'active',project_drop_enabled:true,created_by:fixture.userId}).select('id').single(); if(p.error) throw p.error; fixture.projectId=p.data.id;
  let r=await client.from('dimpro_project_memberships').insert({project_id:fixture.projectId,user_id:fixture.userId,role_code:'browser_e2e',can_view:true,can_upload_to_drop:true,can_download:true,can_manage_inbox:false,status:'active',valid_from:new Date().toISOString()}); if(r.error) throw r.error;
  r=await client.from('dimpro_project_drop_settings').insert({project_id:fixture.projectId,enabled:true,incoming_folder_name:'Beérkező Drop',preserve_groups:true,require_virus_scan:true,notify_project_admins:false}); if(r.error) throw r.error;
  pass('fixture-created',true);
  const ent=await api('/api/dimpro-identity/admin/send-entitlements',{method:'POST',host:'license.dimpro.hu',adminKey,body:{userId:fixture.userId,licenseId:fixture.licenseId,sendCode:manualSendCode,recipientMode:'locked_default',recipients:[{name:'DIMPRO Browser Címzett',email:'admin@dimpro.hu',organizationName:'DIMPRO',label:'Browser E2E',isDefault:true,locked:true}],canUseStandardSend:true,canUseQuickImageSend:true,canUseImageGroups:true,canUseFileComments:true,canUseProjectDrop:true,maxRecipients:3,maxPackageSizeBytes:5242880,monthlySendLimit:5,expiresAt:new Date(Date.now()+86400000).toISOString()}});
  assert.equal(ent.status,201,ent.raw); fixture.entitlementId=String(ent.json?.created?.result?.entitlementId||''); const rawCode=String(ent.json?.created?.rawCode||''); pass('manual-send-code-preserved',rawCode===manualSendCode,rawCode); pass('entitlement-created',fixture.entitlementId.length>20 && /^[A-Z]{4}-\d{3}-\d{3}$/.test(rawCode));

  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1']});
  const page=await browser.newPage(); const pageErrors=[]; const consoleErrors=[]; const network=[];
  page.on('pageerror',e=>pageErrors.push(String(e))); page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text())}); page.on('response',r=>{if(r.url().includes('/api/dimpro-identity/')||r.url().includes('/api/drop/public/send/session')) network.push({url:r.url(),status:r.status()});});
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
  const response=await page.goto(`${PUBLIC}/send?identity-browser-e2e=1`,{waitUntil:'networkidle2',timeout:120000}); pass('send-page-http',response?.status()===200,String(response?.status()));
  const input=await page.$('input[placeholder="ABCD-123-456"]'); pass('authorization-input-visible',Boolean(input));
  await input.type(rawCode.replace(/-/g,''),{delay:80});
  await new Promise(r=>setTimeout(r,3000));
  const entryDiag=await page.evaluate(()=>{const text=document.body.textContent||''; const el=document.querySelector('input[placeholder="ABCD-123-456"]'); const btn=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('Belépés')||b.textContent?.includes('Jogosultság ellenőrzése')); return {value:el?.value||'',buttonText:btn?.textContent||'',buttonDisabled:btn?.disabled??null,hasAuth:text.includes('Központilag azonosított küldő'),hasSenderNameField:text.includes('FELADÓ NEVE'),hasSenderEmailField:text.includes('FELADÓ E-MAIL-CÍME'),hasProjectPanel:text.includes('Projekt kiválasztása'),hasFixtureName:text.includes('DIMPRO Identity Browser Teszt'),textLength:text.length,body:text.slice(0,9000)};});
  console.log('ENTRY_DIAGNOSTICS',JSON.stringify({value:entryDiag.value,buttonText:entryDiag.buttonText,buttonDisabled:entryDiag.buttonDisabled,network,hasAuth:entryDiag.hasAuth,hasSenderNameField:entryDiag.hasSenderNameField,hasSenderEmailField:entryDiag.hasSenderEmailField,hasProjectPanel:entryDiag.hasProjectPanel,hasFixtureName:entryDiag.hasFixtureName,textLength:entryDiag.textLength}));
  if(!entryDiag.hasAuth) console.log('ENTRY_BODY',entryDiag.body);
  pass('authenticated-ui-state-visible',entryDiag.hasAuth,JSON.stringify(entryDiag));
  const savedCode=await page.evaluate(()=>localStorage.getItem('dimpro.drop.sendCode.v1')); pass('send-code-saved-locally',savedCode===manualSendCode.replace(/-/g,''),savedCode||'missing');
  const desktop=await page.evaluate((expectedName,expectedEmail,expectedProject,expectedCode,expectedUserCode)=>{const text=document.body.textContent||''; return {text,name:text.includes(expectedName),email:text.includes(expectedEmail),project:text.includes(expectedProject),projectCode:text.includes(expectedCode),userCode:text.includes(expectedUserCode),identity:text.includes('Identity Core'),noProject:text.includes('Nincs projektkapcsolat'),projectSelect:text.includes('Projekt kiválasztása'),senderNameField:text.includes('FELADÓ NEVE'),senderEmailField:text.includes('FELADÓ E-MAIL-CÍME'),overflow:document.documentElement.scrollWidth>window.innerWidth};},'DIMPRO Identity Browser Teszt',email,`Identity Browser Projekt ${unique}`,fixture.projectCode,fixture.userCode);
  pass('authenticated-sender-name',desktop.name); pass('authenticated-sender-email',desktop.email); pass('public-user-code-visible',desktop.userCode); pass('identity-badge-visible',desktop.identity); pass('project-panel-visible',desktop.projectSelect&&desktop.noProject); pass('allowed-project-visible',desktop.project&&desktop.projectCode); pass('sender-fields-readonly-by-absence',!desktop.senderNameField&&!desktop.senderEmailField); pass('desktop-no-overflow',!desktop.overflow);
  await page.evaluate((projectCode)=>{const select=[...document.querySelectorAll('select')].find(el=>[...el.options].some(o=>o.value===projectCode)); if(!select) throw new Error('Projektválasztó nem található'); select.value=projectCode; select.dispatchEvent(new Event('change',{bubbles:true}));},fixture.projectCode);
  await page.waitForFunction((code)=>(document.body.textContent||'').includes('Megfelelő projektkód')&&(document.body.textContent||'').includes(code)&&(document.body.textContent||'').includes('Cél: Beérkező Drop'),{timeout:30000},fixture.projectCode);
  pass('project-selection-verified',true);
  const projectInputValue=await page.$eval('input[placeholder="PRJ-26-K7M-4Q9"]',el=>el.value); pass('project-code-autofilled',projectInputValue===fixture.projectCode,projectInputValue);
  const quickButton=[...await page.$$('button')];
  for(const button of quickButton){const text=await button.evaluate(el=>el.textContent||''); if(text.includes('Gyors KépSend')){await button.click(); break;}}
  await page.waitForFunction(()=>(document.body.textContent||'').includes('Opcionális további címzettek'),{timeout:30000});
  const extraInputs=await page.$$('input[placeholder^="Címzett "]');
  pass('quick-extra-recipient-ui',extraInputs.length>=1,String(extraInputs.length));
  const emailInputs=await page.$$('input[placeholder="E-mail-cím"]');
  if(extraInputs[0]) await extraInputs[0].type('További Teszt Címzett',{delay:20});
  if(emailInputs[0]) await emailInputs[0].type(`extra-${unique}@example.invalid`,{delay:20});
  pass('quick-multi-recipient-copy',(await page.evaluate(()=>document.body.textContent||'')).includes('további címzett'));
  const rememberDeleteButtons=await page.$$('button');
  for(const button of rememberDeleteButtons){const text=await button.evaluate(el=>el.textContent||''); if(text.includes('Mentett Send-kód törlése erről az eszközről')){await button.click(); break;}}
  const clearedCode=await page.evaluate(()=>localStorage.getItem('dimpro.drop.sendCode.v1')); pass('saved-send-code-deletable',clearedCode===null,String(clearedCode));
  await page.setViewport({width:390,height:844,deviceScaleFactor:1}); await new Promise(r=>setTimeout(r,500));

  const mobile=await page.evaluate(()=>{const dock=document.querySelector('[data-drop-mobile-dock]'); const dr=dock?.getBoundingClientRect(); const children=dock?[...dock.children].map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}):[]; return {overflow:document.documentElement.scrollWidth>window.innerWidth,text:document.body.textContent||'',width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,dock:dr?{top:dr.top,bottom:dr.bottom,height:dr.height}:null,children,buttonsInside:dr?children.every((r,i)=>r.bottom<=dr.bottom+2&&(i===2||r.top>=dr.top-2)):false};}); pass('mobile-no-overflow',!mobile.overflow,`${mobile.scrollWidth}/${mobile.width}`); pass('mobile-dock-buttons-aligned',Boolean(mobile.dock&&mobile.buttonsInside),JSON.stringify(mobile)); pass('mobile-auth-state-preserved',mobile.text.includes('Központilag azonosított küldő')&&mobile.text.includes('Megfelelő projektkód'));
  pass('v121-version-visible',mobile.text.includes('DROP 1.2.1'));
  pass('browser-no-page-errors',pageErrors.length===0,pageErrors.join(' | ')); pass('browser-no-console-errors',consoleErrors.length===0,consoleErrors.join(' | '));
  console.log(JSON.stringify({ok:true,version:'DROP 1.2.1',checks:checks.length,names:checks,desktop:true,mobile:true,projectCodeVerified:true},null,2));
} finally {
  if(browser) await browser.close().catch(()=>undefined);
  if(fixture.entitlementId) await client.from('drop_public_sessions').delete().eq('dimpro_send_entitlement_id',fixture.entitlementId).then(()=>undefined).catch(()=>undefined);
  if(fixture.entitlementId) await client.from('dimpro_access_audit_logs').delete().eq('entitlement_id',fixture.entitlementId).then(()=>undefined).catch(()=>undefined);
  if(fixture.entitlementId) await client.from('dimpro_send_entitlements').delete().eq('id',fixture.entitlementId).then(()=>undefined).catch(()=>undefined);
  if(fixture.projectId) await client.from('dimpro_projects').delete().eq('id',fixture.projectId).then(()=>undefined).catch(()=>undefined);
  if(fixture.licenseId) await client.from('dimpro_licenses').delete().eq('id',fixture.licenseId).then(()=>undefined).catch(()=>undefined);
  if(fixture.userId) await client.from('dimpro_users').delete().eq('id',fixture.userId).then(()=>undefined).catch(()=>undefined);
}
