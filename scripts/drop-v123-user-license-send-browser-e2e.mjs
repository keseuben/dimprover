import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const PORT=Number(process.env.DROP_V123_BROWSER_PORT||3120);
const LICENSE=`http://license.dimpro.hu:${PORT}`;
const DROP=`http://drop.dimpro.hu:${PORT}`;
function required(name){const v=process.env[name]?.trim();assert.ok(v,`${name} hiányzik`);return v;}
const client=createClient(required('NEXT_PUBLIC_SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const adminKey=(await readFile('.dimprover/license/admin-key.txt','utf8')).trim();
const alphabet='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function group(n){const b=randomBytes(n);return Array.from(b,x=>alphabet[x%alphabet.length]).join('');}
const yy=String(new Date().getFullYear()).slice(-2);
const licenseCode=`LIC-${yy}-${group(4)}-${group(4)}`;
const digits=String(Date.now()%1000000).padStart(6,'0');
const sendCode=`LIVE-${digits.slice(0,3)}-${digits.slice(3)}`;
const stamp=Date.now();
const fullName=`DROP 1.2.3 Browser User ${stamp}`;
const email=`drop-v123-browser-${stamp}@example.invalid`;
const phone='+36 30 987 6543';
const organizationName=`DIMPRO V123 Browser Org ${stamp}`;
const fixture={userId:'',organizationId:'',licenseId:'',entitlementId:''};
let browser;
const checks=[];
const pass=(name,ok,detail='')=>{assert.ok(ok,`${name}${detail?`: ${detail}`:''}`);checks.push(name);};
const buttonByText=async(page,text)=>{for(const button of await page.$$('button')){const value=await button.evaluate(el=>el.textContent||'');if(value.includes(text))return button;}return null;};
try{
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--host-resolver-rules=MAP license.dimpro.hu 127.0.0.1, MAP drop.dimpro.hu 127.0.0.1']});
 const page=await browser.newPage(); const pageErrors=[]; const consoleErrors=[];
 page.on('pageerror',e=>pageErrors.push(String(e))); page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 await page.evaluateOnNewDocument((key)=>{if(window.top===window)localStorage.setItem('dimproLicenseAdminKey',key);},adminKey);
 await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});
 const r=await page.goto(`${LICENSE}/drive/drop/public-workflows?v123=1`,{waitUntil:'networkidle2',timeout:120000});
 pass('admin-http',r?.status()===200,String(r?.status()));
 await page.waitForFunction(()=>(document.body.textContent||'').includes('DROP 1.2.3')&&(document.body.textContent||'').includes('Új Send entitlement'),{timeout:30000});
 pass('v123-admin-visible',true);
 const userButton=await buttonByText(page,'Új központi felhasználó létrehozása');assert.ok(userButton,'új user gomb hiányzik');await userButton.click();
 await page.waitForSelector('input[placeholder="pl. Kiss Péter"]',{timeout:10000});
 await page.type('input[placeholder="pl. Kiss Péter"]',fullName);
 await page.type('input[placeholder="nev@ceg.hu"]',email);
 await page.type('input[placeholder="+36 ..."]',phone);
 await page.type('input[placeholder="pl. Példa Kft."]',organizationName);
 const createUserButton=await buttonByText(page,'Felhasználó létrehozása és kiválasztása');assert.ok(createUserButton,'user create gomb hiányzik');
 pass('user-create-button-enabled',!(await createUserButton.evaluate(el=>el.disabled)));
 await createUserButton.click();
 await page.waitForFunction((name,mail)=>{const t=document.body.textContent||'';return t.includes('Központi felhasználó létrehozva és kiválasztva')&&t.includes(name)&&t.includes(mail);},{timeout:30000},fullName,email);
 const u=await client.from('dimpro_users').select('id,full_name,email,phone,status,email_verified_at').eq('email_normalized',email).single();if(u.error)throw u.error;fixture.userId=u.data.id;
 pass('central-user-live',u.data.full_name===fullName&&u.data.phone===phone&&u.data.status==='active'&&Boolean(u.data.email_verified_at));
 const membership=await client.from('dimpro_organization_memberships').select('organization_id,status').eq('user_id',fixture.userId).eq('status','active').single();if(membership.error)throw membership.error;fixture.organizationId=membership.data.organization_id;
 const org=await client.from('dimpro_organizations').select('display_name,legal_name').eq('id',fixture.organizationId).single();if(org.error)throw org.error;
 pass('organization-live',(org.data.display_name||org.data.legal_name)===organizationName);

 await page.waitForSelector('input[placeholder="LIC-26-HAGE-2468"]',{timeout:10000});
 const licInput=await page.$('input[placeholder="LIC-26-HAGE-2468"]');await licInput.click({clickCount:3});await licInput.type(licenseCode,{delay:15});
 const createLicense=await buttonByText(page,'Licenc létrehozása és kiválasztása');assert.ok(createLicense,'licenc gomb hiányzik');await createLicense.click();
 await page.waitForFunction(code=>(document.body.textContent||'').includes(`Központi licenc létrehozva és kiválasztva: ${code}`),{timeout:30000},licenseCode);
 const l=await client.from('dimpro_licenses').select('id,owner_user_id,status,expires_at').eq('public_license_code',licenseCode).single();if(l.error)throw l.error;fixture.licenseId=l.data.id;
 pass('active-license-live',l.data.owner_user_id===fixture.userId&&['active','trial'].includes(l.data.status)&&(!l.data.expires_at||Date.parse(l.data.expires_at)>Date.now()));

 const sendInput=await page.$('input[placeholder="HAGE-123-456"]');assert.ok(sendInput,'send input hiányzik');await sendInput.type(sendCode,{delay:15});
 const free=await buttonByText(page,'Szabad címzett');assert.ok(free);await free.click();
 const createEnt=await buttonByText(page,'Központi Send entitlement létrehozása');assert.ok(createEnt);pass('entitlement-button-enabled',!(await createEnt.evaluate(el=>el.disabled)));await createEnt.click();
 await page.waitForFunction(code=>(document.body.textContent||'').includes(code)&&(document.body.textContent||'').includes('Egyszer megjelenő központi Send-kód'),{timeout:30000},sendCode);
 const ent=await client.from('dimpro_send_entitlements').select('id,status,user_id,license_id').eq('user_id',fixture.userId).eq('license_id',fixture.licenseId).single();if(ent.error)throw ent.error;fixture.entitlementId=ent.data.id;
 pass('entitlement-live',ent.data.status==='active');

 const sendPage=await browser.newPage(); const sendErrors=[]; sendPage.on('pageerror',e=>sendErrors.push(String(e)));
 await sendPage.setViewport({width:390,height:844,deviceScaleFactor:1});
 const sr=await sendPage.goto(`${DROP}/send?v123-login=1`,{waitUntil:'networkidle2',timeout:120000});
 pass('send-page-http',sr?.status()===200,String(sr?.status()));
 await sendPage.waitForSelector('input[placeholder="ABCD-123-456"]',{timeout:30000});
 await sendPage.type('input[placeholder="ABCD-123-456"]',sendCode,{delay:30});
 await sendPage.waitForFunction((name,mail)=>{const t=document.body.textContent||'';return t.includes('Központilag azonosított küldő')&&t.includes(name)&&t.includes(mail);},{timeout:30000},fullName,email);
 pass('real-send-login-works',true);
 const sendState=await sendPage.evaluate(()=>({body:document.body.textContent||'',saved:localStorage.getItem('dimpro.drop.sendCode.v1')||'',overflow:document.documentElement.scrollWidth>window.innerWidth+2}));
 pass('verified-sender-shown',sendState.body.includes(fullName)&&sendState.body.includes(email)&&sendState.body.includes(organizationName));
 pass('send-code-saved-device',sendState.saved.replace(/-/g,'')===sendCode.replace(/-/g,''));
 pass('mobile-no-overflow',sendState.overflow===false);
 pass('send-page-no-errors',sendErrors.length===0,sendErrors.join(' | '));
 pass('admin-page-no-errors',pageErrors.length===0,pageErrors.join(' | '));
 pass('admin-console-no-errors',consoleErrors.length===0,consoleErrors.join(' | '));
 console.log(JSON.stringify({ok:true,version:'DROP 1.2.3',checks:checks.length,names:checks},null,2));
} finally {
 if(browser)await browser.close().catch(()=>undefined);
 if(fixture.entitlementId){try{await client.from('dimpro_access_audit_logs').delete().eq('entitlement_id',fixture.entitlementId);}catch{}}
 if(fixture.entitlementId){try{await client.from('dimpro_send_recipients').delete().eq('entitlement_id',fixture.entitlementId);}catch{} try{await client.from('dimpro_send_entitlements').delete().eq('id',fixture.entitlementId);}catch{}}
 if(fixture.licenseId){try{await client.from('dimpro_access_audit_logs').delete().eq('license_id',fixture.licenseId);}catch{}}
 if(fixture.licenseId){try{await client.from('dimpro_license_modules').delete().eq('license_id',fixture.licenseId);}catch{} try{await client.from('dimpro_licenses').delete().eq('id',fixture.licenseId);}catch{}}
 if(fixture.userId){try{await client.from('dimpro_access_audit_logs').delete().eq('user_id',fixture.userId);}catch{}}
 if(fixture.userId){try{await client.from('dimpro_organization_memberships').delete().eq('user_id',fixture.userId);}catch{}}
 if(fixture.userId){try{await client.from('dimpro_users').delete().eq('id',fixture.userId);}catch{}}
 if(fixture.organizationId){try{await client.from('dimpro_organizations').delete().eq('id',fixture.organizationId);}catch{}}
}
