import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const base=process.env.BENJADMIN_UI_BASE||"http://admin.dev.dimpro.hu:3100/admin";
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
let passed=0;
function check(name,ok,details=""){if(!ok)throw new Error(`${name}: ${details}`);passed+=1;console.log(`PASS ${name}${details?` :: ${details}`:""}`)}
async function openTeam(page){await page.waitForSelector('[data-testid="benjadmin-team-screen-button"]',{timeout:30000});await page.click('[data-testid="benjadmin-team-screen-button"]');await page.waitForSelector('[data-testid="benjadmin-team-screen"]',{timeout:15000});}
async function closeTeamD(page){await page.keyboard.press("d");await page.waitForFunction(()=>!document.querySelector('[data-testid="benjadmin-team-screen"]'),{timeout:15000});}

const unauth=await fetch(`${apiBase}/api/dev/engine/team-dashboard-summary`,{headers:{host}});
check("Vezetői metrics admin-auth nélkül 401",unauth.status===401,`status=${unauth.status}`);
const timeUnauth=await fetch(`${apiBase}/api/dev/engine/benjadmin-time`,{method:"POST",headers:{host,"content-type":"application/json"},body:JSON.stringify({action:"start"})});
check("BenjAdmin időmérő írás admin-auth nélkül 401",timeUnauth.status===401,`status=${timeUnauth.status}`);
const timeInvalid=await fetch(`${apiBase}/api/dev/engine/benjadmin-time`,{method:"POST",headers:{host,"x-dimpro-license-admin-key":adminKey,"content-type":"application/json"},body:JSON.stringify({action:"acceptance-invalid"})});
check("BenjAdmin időmérő admin API ismeretlen műveletet blokkol",timeInvalid.status===400,`status=${timeInvalid.status}`);

const metrics=await fetch(`${apiBase}/api/dev/engine/team-dashboard-summary`,{headers:{host,"x-dimpro-license-admin-key":adminKey}});
const metricsPayload=await metrics.json().catch(()=>({}));
check("Vezetői metrics API elérhető",metrics.status===200&&metricsPayload?.ok===true,`status=${metrics.status}`);
check("Időkimutatás 8 szereplőt ad",metricsPayload?.time?.people?.length===8,JSON.stringify(metricsPayload?.time?.people?.map(x=>x.name)||[]));
check("Költségadat hiánya nem válik kitalált költséggé",metricsPayload?.costs?.infrastructure?.items?.every(x=>x.monthlyHuf===null||Number.isFinite(x.monthlyHuf)),JSON.stringify(metricsPayload?.costs?.infrastructure||{}));

const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
try{
 const page=await browser.newPage();
 await page.setBypassServiceWorker(true);
 await page.evaluateOnNewDocument((key)=>{localStorage.setItem("dimproLicenseAdminKey",key);sessionStorage.setItem("dimproBenjadminSession","active");localStorage.setItem("dimpro-admin-theme","dark");localStorage.removeItem("benjadminTeamExecutivePanels");},adminKey);
 await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
 await page.goto(base,{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForSelector(".benjadmin-shell-topbar",{timeout:30000});
 await openTeam(page);
 await page.waitForFunction(()=>document.querySelectorAll('.benjadmin-team-screen__member-title h2').length===7,{timeout:30000});
 await page.waitForFunction(()=>document.querySelectorAll('.benjadmin-team-screen__time-table tbody tr').length===8,{timeout:60000});
 const state=await page.evaluate(()=>{
   const names=Array.from(document.querySelectorAll('.benjadmin-team-screen__member-title h2')).map(x=>(x.textContent||"").trim());
   const owner=document.querySelector('.is-owner-node .benjadmin-team-screen__avatar')?.getBoundingClientRect().width||0;
   const lead=document.querySelector('.is-lead-node .benjadmin-team-screen__avatar')?.getBoundingClientRect().width||0;
   const workers=Array.from(document.querySelectorAll('.is-worker-node .benjadmin-team-screen__avatar')).map(x=>x.getBoundingClientRect().width);
   return {names,owner,lead,workers,panels:document.querySelectorAll('.benjadmin-team-screen__executive-panel').length,leftText:document.querySelector('.benjadmin-team-screen__side--left')?.textContent||"",centerText:document.querySelector('.benjadmin-team-screen__center')?.textContent||"",scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};
 });
 const expected=["BenjAdmin","Ben-AI","Ármin-AI","Jázmin-AI","Outmin-AI","M.Forge-AI","V.Guard-AI"];
 check("Csapattabló 7 kanonikus nevet használ",JSON.stringify(state.names)===JSON.stringify(expected),JSON.stringify(state.names));
 check("BenjAdmin avatár a legnagyobb, Ben-AI kisebb",state.owner>state.lead&&state.lead>0,JSON.stringify({owner:state.owner,lead:state.lead}));
 check("Öt egyenrangú worker avatár azonos méretű",state.workers.length===5&&Math.max(...state.workers)-Math.min(...state.workers)<=1,JSON.stringify(state.workers));
 check("Három összecsukható vezetői panel látható",state.panels===3,`panels=${state.panels}`);
 check("AI finanszírozás kompakt kártyája bal infrastruktúra oszlopban van",state.leftText.includes("AI FINANSZÍROZÁS ÉS TOKENKERET"),state.leftText.slice(-500));
 check("Költségpanel külön TÉNY és BECSLÉS jelölést használ",state.centerText.includes("TÉNY · AI KÖLTSÉG / HÓ")&&state.centerText.includes("BECSLÉS · ÉVES"),state.centerText.slice(-1000));
 check("Ráfordítás panel ChatGPT/VPS-MCP és két külső AI szereplőt mutat",["ChatGPT + VPS-MCP","M.Forge-AI","V.Guard-AI"].every(x=>state.centerText.includes(x)),state.centerText.slice(-1200));
 check("Desktop nincs vízszintes túlcsordulás",state.scrollWidth<=state.clientWidth+1,JSON.stringify(state));

 await page.click('[data-testid="team-member-mforge"] .benjadmin-team-screen__avatar-button');
 await page.waitForSelector('[data-testid="benjadmin-person-profile-card"][data-person-code="MFORGE"]',{timeout:10000});
 const profileText=await page.$eval('[data-testid="benjadmin-person-profile-card"]',x=>x.textContent||"");
 check("M.Forge avatár részletes közös profilkártyát nyit",profileText.includes("M.Forge-AI")&&profileText.includes("Coding Worker")&&profileText.includes("Márk"),profileText.slice(0,600));
 await page.click('[data-testid="benjadmin-person-profile-close"]');
 await page.waitForSelector('[data-testid="benjadmin-person-profile-card"]',{hidden:true,timeout:10000});

 const teamToggle='.benjadmin-team-screen__executive-panel[data-panel="team"] .benjadmin-team-screen__executive-toggle';
 await page.$eval(teamToggle,el=>el.click());
 await page.waitForFunction(()=>!document.querySelector('.benjadmin-team-screen__executive-panel[data-panel="team"] .benjadmin-team-screen__team-tree'));
 check("Csapattabló összecsukható",true);
 await closeTeamD(page);
 await page.keyboard.press("d");
 await page.waitForSelector('[data-testid="benjadmin-team-screen"]',{timeout:15000});
 check("Csapattabló összecsukott állapota megmarad megnyitások között",!(await page.$('.benjadmin-team-screen__executive-panel[data-panel="team"] .benjadmin-team-screen__team-tree')));
 await page.$eval(teamToggle,el=>el.click());
 await page.waitForSelector('.benjadmin-team-screen__executive-panel[data-panel="team"] .benjadmin-team-screen__team-tree');

 await page.click('.benjadmin-team-screen__finance-hex');
 check("Külső AI sor hexagon gombja finanszírozási popovert nyit",Boolean(await page.$('.benjadmin-team-screen__finance-popover')));
 await page.click('.benjadmin-team-screen__finance-hex');

 for(const selector of ['[data-panel="costs"]','[data-panel="time"]']){
   const toggle=`.benjadmin-team-screen__executive-panel${selector} .benjadmin-team-screen__executive-toggle`;
   await page.$eval(toggle,el=>el.click()); await new Promise(r=>setTimeout(r,80));
   check(`${selector} panel összecsukható`,!(await page.$(`.benjadmin-team-screen__executive-panel${selector} .benjadmin-team-screen__executive-body`)));
   await page.$eval(toggle,el=>el.click()); await new Promise(r=>setTimeout(r,80));
 }

 for(const viewport of [{name:"laptop",width:1366,height:768},{name:"tablet",width:768,height:1024},{name:"mobil",width:390,height:844}]){
   await page.setViewport({width:viewport.width,height:viewport.height,deviceScaleFactor:1}); await new Promise(r=>setTimeout(r,250));
   const fit=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,team:Boolean(document.querySelector('.benjadmin-team-screen__team-tree')),names:document.querySelectorAll('.benjadmin-team-screen__member-title h2').length}));
   check(`${viewport.name} nincs vízszintes túlcsordulás`,fit.sw<=fit.cw+1,JSON.stringify(fit));
   check(`${viewport.name} megtartja a teljes 7 fős tablót`,fit.team&&fit.names===7,JSON.stringify(fit));
 }

 await closeTeamD(page);
 await page.setViewport({width:1366,height:768,deviceScaleFactor:1});
 await page.goto('http://admin.dev.dimpro.hu:3100/admin/dev-console',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('span[role="button"][title*="profil megnyitása"]',{timeout:30000});
 await page.click('span[role="button"][title*="profil megnyitása"]');
 await page.waitForSelector('[data-testid="benjadmin-person-profile-card"]',{timeout:10000});
 check("Fejlesztői Konzol avatar ugyanazt a globális profilkártyát nyitja",Boolean(await page.$('[data-testid="benjadmin-person-profile-card"]')));
}finally{await browser.close()}
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
