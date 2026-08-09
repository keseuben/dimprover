import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const PORT=Number(process.env.DROP_LICENSE_BROWSER_PORT||3120);
const PUBLIC=`http://license.dimpro.hu:${PORT}`;
function required(name){const v=process.env[name]?.trim();assert.ok(v,`${name} hiányzik`);return v;}
const client=createClient(required('NEXT_PUBLIC_SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const adminKey=(await readFile('.dimprover/license/admin-key.txt','utf8')).trim();
const alphabet='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function group(n){const b=randomBytes(n);return Array.from(b,x=>alphabet[x%alphabet.length]).join('');}
const yy=String(new Date().getFullYear()).slice(-2);
const licenseCode=`LIC-${yy}-${group(4)}-${group(4)}`;
const digits=String(Date.now()%1000000).padStart(6,'0');
const sendCode=`BROW-${digits.slice(0,3)}-${digits.slice(3)}`;
const fixture={userId:'',licenseId:'',entitlementId:''};
let browser;
const checks=[];
function pass(name,condition,detail=''){assert.ok(condition,`${name}${detail?`: ${detail}`:''}`);checks.push(name);}

try{
  const uc=await client.rpc('dimpro_generate_user_code');if(uc.error)throw uc.error;
  const email=`v122-browser-${Date.now()}@example.invalid`;
  const u=await client.from('dimpro_users').insert({public_user_code:String(uc.data),full_name:'DROP 1.2.2 Browser Licenc Teszt',email,email_normalized:email,email_verified_at:new Date().toISOString(),status:'active'}).select('id').single();if(u.error)throw u.error;fixture.userId=u.data.id;
  pass('fixture-user-created',Boolean(fixture.userId));

  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--host-resolver-rules=MAP license.dimpro.hu 127.0.0.1']});
  const page=await browser.newPage();
  const errors=[];const consoleErrors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  await page.evaluateOnNewDocument((key)=>{if(window.top===window)localStorage.setItem('dimproLicenseAdminKey',key);},adminKey);
  await page.setViewport({width:1280,height:1000,deviceScaleFactor:1});
  const response=await page.goto(`${PUBLIC}/drive/drop/public-workflows?v122-license-e2e=1`,{waitUntil:'networkidle2',timeout:120000});
  pass('admin-page-http',response?.status()===200,String(response?.status()));
  await page.waitForFunction(()=>(document.body.textContent||'').includes('Új Send entitlement'),{timeout:30000});
  pass('admin-ui-loaded',true);
  pass('v122-visible',(await page.evaluate(()=>document.body.textContent||'')).includes('DROP 1.2.2'));

  const userSelect=await page.$('select');
  assert.ok(userSelect,'felhasználó select hiányzik');
  await page.select('select',fixture.userId);
  await new Promise(r=>setTimeout(r,300));
  const toggleButtons=await page.$$('button');
  let opened=false;
  for(const button of toggleButtons){const text=await button.evaluate(el=>el.textContent||'');if(text.includes('Új központi licenc létrehozása')){await button.click();opened=true;break;}}
  pass('inline-license-panel-opened',opened);
  await page.waitForSelector('input[placeholder="LIC-26-HAGE-2468"]',{timeout:10000});
  const licInput=await page.$('input[placeholder="LIC-26-HAGE-2468"]');
  await licInput.click({clickCount:3});await licInput.type(licenseCode,{delay:30});
  pass('manual-license-code-input',(await licInput.evaluate(el=>el.value))===licenseCode,await licInput.evaluate(el=>el.value));

  let createLicenseButton=null;
  for(const button of await page.$$('button')){const text=await button.evaluate(el=>el.textContent||'');if(text.includes('Licenc létrehozása és kiválasztása')){createLicenseButton=button;break;}}
  assert.ok(createLicenseButton,'licenc létrehozó gomb hiányzik');await createLicenseButton.click();
  await page.waitForFunction(code=>(document.body.textContent||'').includes(`Központi licenc létrehozva és kiválasztva: ${code}`),{timeout:30000},licenseCode);
  const l=await client.from('dimpro_licenses').select('id,public_license_code,owner_user_id').eq('public_license_code',licenseCode).single();if(l.error)throw l.error;fixture.licenseId=l.data.id;
  pass('manual-license-created-live',l.data.public_license_code===licenseCode&&l.data.owner_user_id===fixture.userId);

  const sendInput=await page.$('input[placeholder="HAGE-123-456"]');assert.ok(sendInput,'Send-kód mező hiányzik');await sendInput.type(sendCode,{delay:30});
  pass('manual-send-code-input',(await sendInput.evaluate(el=>el.value))===sendCode,await sendInput.evaluate(el=>el.value));
  for(const button of await page.$$('button')){const text=await button.evaluate(el=>el.textContent||'');if(text.includes('Szabad címzett')){await button.click();break;}}
  let createEntitlementButton=null;
  for(const button of await page.$$('button')){const text=await button.evaluate(el=>el.textContent||'');if(text.includes('Központi Send entitlement létrehozása')){createEntitlementButton=button;break;}}
  assert.ok(createEntitlementButton,'entitlement gomb hiányzik');
  const disabled=await createEntitlementButton.evaluate(el=>el.disabled);pass('entitlement-button-enabled',disabled===false,String(disabled));
  await createEntitlementButton.click();
  await page.waitForFunction(code=>(document.body.textContent||'').includes(code)&&(document.body.textContent||'').includes('Egyszer megjelenő központi Send-kód'),{timeout:30000},sendCode);
  pass('manual-send-code-shown-once',true);

  const ent=await client.from('dimpro_send_entitlements').select('id,license_id,user_id,status').eq('license_id',fixture.licenseId).eq('user_id',fixture.userId).order('created_at',{ascending:false}).limit(1).single();if(ent.error)throw ent.error;fixture.entitlementId=ent.data.id;
  pass('entitlement-created-live',ent.data.status==='active'&&ent.data.license_id===fixture.licenseId);
  const audit=await client.from('dimpro_access_audit_logs').select('event_type,success').eq('license_id',fixture.licenseId);if(audit.error)throw audit.error;const events=new Set((audit.data||[]).filter(x=>x.success).map(x=>x.event_type));
  pass('license-and-send-audited',events.has('license_created')&&events.has('send_entitlement_created'));
  pass('browser-no-page-errors',errors.length===0,errors.join(' | '));
  pass('browser-no-console-errors',consoleErrors.length===0,consoleErrors.join(' | '));
  console.log(JSON.stringify({ok:true,version:'DROP 1.2.2',checks:checks.length,names:checks,licenseCode,sendCode},null,2));
}finally{
  if(browser)await browser.close().catch(()=>undefined);
  if(fixture.entitlementId){try{await client.from('dimpro_access_audit_logs').delete().eq('entitlement_id',fixture.entitlementId);}catch{}}
  if(fixture.licenseId){try{await client.from('dimpro_access_audit_logs').delete().eq('license_id',fixture.licenseId);}catch{}}
  if(fixture.entitlementId){try{await client.from('dimpro_send_entitlements').delete().eq('id',fixture.entitlementId);}catch{}}
  if(fixture.licenseId){try{await client.from('dimpro_licenses').delete().eq('id',fixture.licenseId);}catch{}}
  if(fixture.userId){try{await client.from('dimpro_users').delete().eq('id',fixture.userId);}catch{}}
}
