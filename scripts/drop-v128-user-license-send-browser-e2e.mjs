import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const PORT=Number(process.env.DROP_V128_BROWSER_PORT||3120);
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
const fullName=`DROP 1.2.8 Browser User ${stamp}`;
const email=`drop-v128-browser-${stamp}@example.invalid`;
const phone='+36 30 987 6543';
const organizationName=`DIMPRO V128 Browser Org ${stamp}`;
const fixture={userId:'',organizationId:'',licenseId:'',entitlementId:'',packageId:''};
let browser;
const checks=[];
const pass=(name,ok,detail='')=>{assert.ok(ok,`${name}${detail?`: ${detail}`:''}`);checks.push(name);};
const buttonByText=async(page,text)=>{for(const button of await page.$$('button')){const value=await button.evaluate(el=>el.textContent||'');if(value.includes(text))return button;}return null;};
function candidatePublicBridge(token){
 return new Promise((resolve,reject)=>{
  const body=JSON.stringify({sendSessionToken:token,website:''});
  const req=httpRequest({hostname:'127.0.0.1',port:PORT,path:'/api/drop/public/send/session',method:'POST',headers:{Host:'drop.dimpro.hu','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode||0,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error',reject);req.end(body);
 });
}
try{
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--host-resolver-rules=MAP license.dimpro.hu 127.0.0.1, MAP drop.dimpro.hu 127.0.0.1']});
 const page=await browser.newPage(); const pageErrors=[]; const consoleErrors=[];
 page.on('pageerror',e=>pageErrors.push(String(e))); page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 await page.evaluateOnNewDocument((key)=>{if(window.top===window)localStorage.setItem('dimproLicenseAdminKey',key);},adminKey);
 await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});
 const r=await page.goto(`${LICENSE}/drive/drop/public-workflows?v128=1`,{waitUntil:'networkidle2',timeout:120000});
 pass('admin-http',r?.status()===200,String(r?.status()));
 await page.waitForFunction(()=>(document.body.textContent||'').includes('DROP 1.2.8')&&(document.body.textContent||'').includes('Új Send entitlement'),{timeout:30000});
 pass('v128-admin-visible',true);
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
 const voiceModule=await client.from('dimpro_license_modules').select('module_code,enabled,limits').eq('license_id',fixture.licenseId).eq('module_code','DROP_QUICK_VOICE_NOTE').single();if(voiceModule.error)throw voiceModule.error;
 pass('voice-license-module-live',voiceModule.data.enabled===true&&Number(voiceModule.data.limits?.maxSecondsPerNote||0)===60);

 const sendInput=await page.$('input[placeholder="HAGE-123-456"]');assert.ok(sendInput,'send input hiányzik');await sendInput.type(sendCode,{delay:15});
 const free=await buttonByText(page,'Szabad címzett');assert.ok(free);await free.click();
 const createEnt=await buttonByText(page,'Központi Send entitlement létrehozása');assert.ok(createEnt);pass('entitlement-button-enabled',!(await createEnt.evaluate(el=>el.disabled)));await createEnt.click();
 await page.waitForFunction(code=>(document.body.textContent||'').includes(code)&&(document.body.textContent||'').includes('Egyszer megjelenő központi Send-kód'),{timeout:30000},sendCode);
 const ent=await client.from('dimpro_send_entitlements').select('id,status,user_id,license_id,max_recipients,max_saved_contacts,upload_rules_acceptance_count,upload_rules_version').eq('user_id',fixture.userId).eq('license_id',fixture.licenseId).single();if(ent.error)throw ent.error;fixture.entitlementId=ent.data.id;
 pass('entitlement-live',ent.data.status==='active');
 pass('entitlement-six-recipients',ent.data.max_recipients===6);
 pass('entitlement-contact-limit-ten',ent.data.max_saved_contacts===10);
 pass('rules-counter-initial-zero',ent.data.upload_rules_acceptance_count===0);

 const sendPage=await browser.newPage(); const sendErrors=[]; let capturedIdentitySessionToken=''; sendPage.on('pageerror',e=>sendErrors.push(String(e))); sendPage.on('response',async(response)=>{const url=response.url();if(url.includes('/api/dimpro-identity/send/verify')){try{const body=await response.json();capturedIdentitySessionToken=body?.sendSession?.token||'';}catch{}}if(url.includes('/api/dimpro-identity/send/contacts')||url.includes('/api/drop/public/packages')){let body='';try{body=await response.text();}catch{}console.log(url.includes('/api/drop/public/packages')?'PACKAGE_API':'CONTACT_API',response.status(),body);}});
 await sendPage.evaluateOnNewDocument(()=>{
   window.__dropMicPermissionCalls=0;
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__dropMicPermissionCalls+=1;return {getTracks:()=>[{stop:()=>{}}]};}}});
   class FakeSpeechRecognition {
     constructor(){this.lang='hu-HU';this.continuous=true;this.interimResults=true;this.maxAlternatives=1;this.onresult=null;this.onerror=null;this.onend=null;this._stopped=false;}
     start(){setTimeout(()=>{if(this._stopped)return;const result={0:{transcript:'teszt hangos levélüzenet'},isFinal:true};const results={0:result,length:1};this.onresult?.({resultIndex:0,results});},80);}
     stop(){this._stopped=true;setTimeout(()=>this.onend?.(),60);}
     abort(){this._stopped=true;setTimeout(()=>this.onend?.(),20);}
   }
   Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:FakeSpeechRecognition});
   Object.defineProperty(window,'webkitSpeechRecognition',{configurable:true,value:FakeSpeechRecognition});
 });
 await sendPage.setViewport({width:390,height:844,deviceScaleFactor:1});
 const sr=await sendPage.goto(`${DROP}/send?v128-login=1`,{waitUntil:'networkidle2',timeout:120000});
 pass('send-page-http',sr?.status()===200,String(sr?.status()));
 await sendPage.waitForSelector('input[placeholder="ABCD-123-456"]',{timeout:30000});
 await sendPage.type('input[placeholder="ABCD-123-456"]',sendCode,{delay:30});
 await sendPage.waitForFunction((name,mail)=>{const t=document.body.textContent||'';return t.includes('Központilag azonosított küldő')&&t.includes(name)&&t.includes(mail);},{timeout:30000},fullName,email);
 pass('real-send-login-works',true);
 const quickButton=await buttonByText(sendPage,'Gyors KépSend'); assert.ok(quickButton,'Gyors KépSend gomb hiányzik'); await quickButton.click();
 await sendPage.waitForFunction((mail)=>{const t=document.body.textContent||'';return t.includes('Alapból Ön kapja meg a küldeményt')&&t.includes('Kinek küldené még el?')&&t.includes('Üzenet a képek mellé')&&t.includes(mail);},{timeout:30000},email);
 pass('quick-self-recipient-visible',true);
 const quickState=await sendPage.evaluate(()=>({body:document.body.textContent||'',optionalEmail:[...document.querySelectorAll('input')].some(el=>el.placeholder==='E-mail-cím · opcionális'),message:[...document.querySelectorAll('textarea')].some(el=>el.placeholder?.includes('Rövid üzenet'))}));
 pass('quick-extra-recipient-optional',quickState.body.includes('Kinek küldené még el? · opcionális'));
 pass('quick-message-visible',quickState.body.includes('Üzenet a képek mellé · opcionális'));
 pass('quick-five-extra-visible',quickState.body.includes('Legfeljebb 5 további címzett rögzíthető.'));
 pass('rules-first-use-visible',quickState.body.includes('Eddigi elfogadás: 0/3') && quickState.body.includes('Elfogadom az aktuális feltöltési szabályokat.'));
 const voiceMessageButton=await buttonByText(sendPage,'Üzenet diktálása'); assert.ok(voiceMessageButton,'üzenet diktálása gomb hiányzik'); await voiceMessageButton.click();
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('Felvétel folyamatban'),{timeout:5000});
 await new Promise(resolve=>setTimeout(resolve,180));
 const stopVoiceMessage=await buttonByText(sendPage,'Leállítás'); assert.ok(stopVoiceMessage,'üzenet diktálás leállítás gomb hiányzik'); await stopVoiceMessage.click();
 await sendPage.waitForFunction(()=>{const area=[...document.querySelectorAll('textarea')].find(el=>el.placeholder?.includes('mai helyszíni'));return Boolean(area?.value.includes('teszt hangos levélüzenet'))&&(document.body.textContent||'').includes('Átirat elkészült és bekerült a levél üzenetébe');},{timeout:5000});
 pass('message-voice-transcript-committed',true);
 const contactBook=await buttonByText(sendPage,'Címjegyzék · 0/10'); assert.ok(contactBook,'címjegyzék gomb hiányzik'); await contactBook.click();
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('Saját DIMPRO címjegyzék'),{timeout:10000});
 await sendPage.type('input[placeholder="Név"]','Csató Ferenc V128',{delay:15});
 await sendPage.type('input[placeholder="E-mail-cím"]','csato.ferenc.v128.browser@example.invalid',{delay:15});
 await sendPage.type('input[placeholder="Szervezet · opcionális"]','NAGISZ',{delay:15});
 const saveContact=await buttonByText(sendPage,'Mentés a címjegyzékbe'); assert.ok(saveContact); await saveContact.click();
 await sendPage.waitForFunction(()=>{const t=document.body.textContent||'';return t.includes('csato.ferenc.v128.browser@example.invalid')&&t.includes('A címjegyzék mentve.');},{timeout:20000});
 const contactRow=await client.from('dimpro_send_recipients').select('id,recipient_name,recipient_email,organization_name,active').eq('entitlement_id',fixture.entitlementId).eq('recipient_email','csato.ferenc.v128.browser@example.invalid').single(); if(contactRow.error)throw contactRow.error;
 pass('contact-created-live',contactRow.data.active===true&&contactRow.data.organization_name==='NAGISZ');
 const editContact=await buttonByText(sendPage,'Szerkesztés'); assert.ok(editContact); await editContact.click();
 const contactNameInput=await sendPage.$('input[placeholder="Név"]'); assert.ok(contactNameInput); await contactNameInput.click({clickCount:3}); await contactNameInput.type('Csató Ferenc módosított',{delay:10});
 const updateContact=await buttonByText(sendPage,'Módosítás mentése'); assert.ok(updateContact); await updateContact.click();
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('Csató Ferenc módosított'),{timeout:20000});
 const updatedContact=await client.from('dimpro_send_recipients').select('recipient_name').eq('id',contactRow.data.id).single(); if(updatedContact.error)throw updatedContact.error;
 pass('contact-updated-live',updatedContact.data.recipient_name==='Csató Ferenc módosított');
 const deleteContact=await buttonByText(sendPage,'Törlés'); assert.ok(deleteContact); await deleteContact.click();
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('A címjegyzék-bejegyzés törölve.'),{timeout:20000});
 const deletedContact=await client.from('dimpro_send_recipients').select('active').eq('id',contactRow.data.id).single(); if(deletedContact.error)throw deletedContact.error;
 pass('contact-soft-deleted-live',deletedContact.data.active===false);
 pass('identity-session-token-captured',capturedIdentitySessionToken.length>30);
 const candidateBridge=await candidatePublicBridge(capturedIdentitySessionToken);
 assert.equal(candidateBridge.status,201,`candidate secure-cookie bridge: ${candidateBridge.status} ${candidateBridge.body}`);
 const rawSetCookie=candidateBridge.headers['set-cookie']; const setCookie=Array.isArray(rawSetCookie)?rawSetCookie.join(','):String(rawSetCookie||''); const cookieMatch=setCookie.match(/dimpro_drop_public_v094=([^;]+)/); assert.ok(cookieMatch?.[1],'candidate public session cookie hiányzik');
 await sendPage.setCookie({name:'dimpro_drop_public_v094',value:cookieMatch[1],domain:'drop.dimpro.hu',path:'/',httpOnly:true,secure:false,sameSite:'Lax'});
 pass('candidate-public-session-cookie-injected',true);
 const sendStateBeforePackage=await sendPage.evaluate(()=>({body:document.body.textContent||'',saved:localStorage.getItem('dimpro.drop.sendCode.v1')||'',overflow:document.documentElement.scrollWidth>window.innerWidth+2}));
 pass('verified-sender-shown',sendStateBeforePackage.body.includes(fullName)&&sendStateBeforePackage.body.includes(email)&&sendStateBeforePackage.body.includes(organizationName));
 pass('send-code-saved-device',sendStateBeforePackage.saved.replace(/-/g,'')===sendCode.replace(/-/g,''));
 await sendPage.evaluate(async()=>{const button=[...document.querySelectorAll('button')].find((el)=>(el.textContent||'').includes('Tartsa nyomva 2 mp-ig')); if(!button)throw new Error('2 mp törlőgomb hiányzik'); button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,pointerType:'touch'})); await new Promise((resolve)=>setTimeout(resolve,2200)); button.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,pointerType:'touch'}));});
 await sendPage.waitForFunction(()=>!localStorage.getItem('dimpro.drop.sendCode.v1'),{timeout:5000});
 pass('send-code-hold-delete-works',true);
 const rulesFound=await sendPage.evaluate(()=>{const label=[...document.querySelectorAll('label')].find(el=>(el.textContent||'').includes('Elfogadom az aktuális feltöltési szabályokat.'));const input=label?.querySelector('input[type="checkbox"]');if(!input)return false;if(!input.checked)input.click();return true;}); assert.ok(rulesFound,'feltöltési szabály checkbox hiányzik');
 await sendPage.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(el=>(el.textContent||'').includes('Tovább a Galéria / Kamera választáshoz'));return Boolean(button&&!button.disabled);},{timeout:5000});
 const continueQuick=await buttonByText(sendPage,'Tovább a Galéria / Kamera választáshoz'); assert.ok(continueQuick,'quick package continue hiányzik'); await continueQuick.click();
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('Képek küldése')&&(document.body.textContent||'').includes('DROP 1.2.8'),{timeout:30000});
 const browserPackage=await client.from('drop_packages').select('id').eq('uploader_email',email).order('created_at',{ascending:false}).limit(1).maybeSingle(); if(browserPackage.error)throw browserPackage.error; fixture.packageId=browserPackage.data?.id||''; pass('quick-package-fixture-found',fixture.packageId.length>20);
 const fileInput=await sendPage.$('input[data-drop-file-input]'); assert.ok(fileInput,'upload input hiányzik'); await fileInput.uploadFile('/root/dimprover/public/drop-icon-192.png');
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('Megjegyzés ehhez a képhez'),{timeout:30000});
 const imageVoice=await buttonByText(sendPage,'Diktálás'); assert.ok(imageVoice,'friss képkártya diktálás gomb hiányzik'); await imageVoice.click();
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('Felvétel folyamatban') || (document.body.textContent||'').includes('Beszéd felismerve'),{timeout:5000});
 await new Promise(resolve=>setTimeout(resolve,180));
 const stopImageVoice=await buttonByText(sendPage,'Leállítás'); assert.ok(stopImageVoice,'képkártya diktálás leállítás hiányzik'); await stopImageVoice.click();
 await sendPage.waitForFunction(()=> (document.body.textContent||'').includes('Átirat elkészült és bekerült a kép megjegyzésébe'),{timeout:5000});
 const micCalls=await sendPage.evaluate(()=>window.__dropMicPermissionCalls||0); pass('explicit-microphone-permission-requested',micCalls>=2,String(micCalls));
 pass('fresh-quick-image-card-voice-visible',true);
 const sendState=await sendPage.evaluate(()=>({body:document.body.textContent||'',overflow:document.documentElement.scrollWidth>window.innerWidth+2}));
 pass('mobile-no-overflow',sendState.overflow===false);
 pass('send-page-no-errors',sendErrors.length===0,sendErrors.join(' | '));
 pass('admin-page-no-errors',pageErrors.length===0,pageErrors.join(' | '));
 pass('admin-console-no-errors',consoleErrors.length===0,consoleErrors.join(' | '));
 console.log(JSON.stringify({ok:true,version:'DROP 1.2.8',checks:checks.length,names:checks},null,2));
} finally {
 if(browser)await browser.close().catch(()=>undefined);
 if(fixture.packageId){try{await client.from('drop_packages').delete().eq('id',fixture.packageId);}catch{}}
 if(fixture.entitlementId){try{await client.from('drop_public_sessions').delete().eq('dimpro_send_entitlement_id',fixture.entitlementId);}catch{} try{await client.from('drop_public_package_workflows').delete().eq('dimpro_send_entitlement_id',fixture.entitlementId);}catch{} try{await client.from('dimpro_access_audit_logs').delete().eq('entitlement_id',fixture.entitlementId);}catch{}}
 if(fixture.entitlementId){try{await client.from('dimpro_send_recipients').delete().eq('entitlement_id',fixture.entitlementId);}catch{} try{await client.from('dimpro_send_entitlements').delete().eq('id',fixture.entitlementId);}catch{}}
 if(fixture.licenseId){try{await client.from('dimpro_access_audit_logs').delete().eq('license_id',fixture.licenseId);}catch{}}
 if(fixture.licenseId){try{await client.from('dimpro_license_modules').delete().eq('license_id',fixture.licenseId);}catch{} try{await client.from('dimpro_licenses').delete().eq('id',fixture.licenseId);}catch{}}
 if(fixture.userId){try{await client.from('dimpro_access_audit_logs').delete().eq('user_id',fixture.userId);}catch{}}
 if(fixture.userId){try{await client.from('dimpro_organization_memberships').delete().eq('user_id',fixture.userId);}catch{}}
 if(fixture.userId){try{await client.from('dimpro_users').delete().eq('id',fixture.userId);}catch{}}
 if(fixture.organizationId){try{await client.from('dimpro_organizations').delete().eq('id',fixture.organizationId);}catch{}}
}
