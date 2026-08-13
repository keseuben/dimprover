import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const base=process.env.BENJADMIN_UI_BASE||"http://admin.dev.dimpro.hu:3100/admin";
let passed=0;
function check(name,ok,details=""){if(!ok)throw new Error(`${name}: ${details}`);passed+=1;console.log(`PASS ${name}${details?` :: ${details}`:""}`)}

const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
try{
  const page=await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((key)=>{
    localStorage.setItem("dimproLicenseAdminKey",key);
    sessionStorage.setItem("dimproBenjadminSession","active");
    localStorage.setItem("dimpro-admin-theme","light");
    localStorage.removeItem("benjadminTeamExecutivePanels");
  },adminKey);
  for(const viewport of [{name:"desktop",width:1440,height:900},{name:"laptop",width:1366,height:768}]){
    await page.setViewport({width:viewport.width,height:viewport.height,deviceScaleFactor:1});
    await page.goto(base,{waitUntil:"domcontentloaded",timeout:60000});
    await page.waitForSelector('[data-testid="benjadmin-team-screen-button"]',{timeout:30000});
    await page.click('[data-testid="benjadmin-team-screen-button"]');
    await page.waitForSelector('.benjadmin-team-screen__team-tree',{timeout:30000});
    await page.waitForFunction(()=>document.querySelectorAll('[data-panel="team"] .benjadmin-team-screen__tree-node').length===7,{timeout:30000});
    await new Promise((resolve)=>setTimeout(resolve,600));
    const layout=await page.evaluate(()=>{
      const r=(selector)=>{const el=document.querySelector(selector);if(!el)return null;const x=el.getBoundingClientRect();return{top:x.top,bottom:x.bottom,left:x.left,right:x.right,width:x.width,height:x.height}};
      const panel=r('[data-panel="team"]');
      const tree=r('.benjadmin-team-screen__team-tree');
      const costs=r('[data-panel="costs"]');
      const members=Array.from(document.querySelectorAll('[data-panel="team"] .benjadmin-team-screen__tree-node')).map((el)=>{const x=el.getBoundingClientRect();return{top:x.top,bottom:x.bottom,left:x.left,right:x.right}});
      const center=document.querySelector('.benjadmin-team-screen__center');
      const costStyle=getComputedStyle(document.querySelector('[data-panel="costs"]'));
      const metricStyle=getComputedStyle(document.querySelector('[data-panel="costs"] .benjadmin-team-screen__metric-grid article'));
      return {panel,tree,costs,members,centerClient:center?.clientHeight||0,centerScroll:center?.scrollHeight||0,docWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,costBackground:costStyle.backgroundImage,metricBackground:metricStyle.backgroundColor};
    });
    check(`${viewport.name}: tabló a saját kártyán belül marad`,Boolean(layout.panel&&layout.tree&&layout.tree.top>=layout.panel.top-1&&layout.tree.bottom<=layout.panel.bottom+1),JSON.stringify(layout));
    check(`${viewport.name}: a tabló nem folyik a költségpanelbe`,Boolean(layout.panel&&layout.costs&&layout.panel.bottom<=layout.costs.top+1),JSON.stringify(layout));
    check(`${viewport.name}: mind a 7 profil a tablóhatáron belül van`,Boolean(layout.panel&&layout.members.length===7&&layout.members.every((item)=>item.top>=layout.panel.top-1&&item.bottom<=layout.panel.bottom+1)),JSON.stringify(layout.members));
    check(`${viewport.name}: tabló kompakt, egy képernyőnyi blokk`,Boolean(layout.panel&&layout.panel.height<viewport.height-120),`panelHeight=${layout.panel?.height}`);
    check(`${viewport.name}: nincs vízszintes overflow`,layout.docWidth<=layout.clientWidth+1,JSON.stringify({sw:layout.docWidth,cw:layout.clientWidth}));
    check(`${viewport.name}: költségkártya sötét navy marad világos admin témánál is`,layout.costBackground.includes("linear-gradient")&&layout.metricBackground!=="rgba(255, 255, 255, 0.72)",JSON.stringify({panel:layout.costBackground,metric:layout.metricBackground}));
    if(viewport.name==="desktop"){
      await page.click('[data-testid="team-member-benai"] .benjadmin-team-screen__avatar-button');
      await page.waitForSelector('[data-testid="benjadmin-person-profile-card"][data-person-code="BENAI"]',{timeout:10000});
      const profile=await page.evaluate(()=>{
        const card=document.querySelector('[data-testid="benjadmin-person-profile-card"]');
        const img=card?.querySelector('img');
        const visual=img?.parentElement;
        const pill=visual?.querySelector('span');
        const ir=img?.getBoundingClientRect();
        const ps=pill?getComputedStyle(pill):null;
        return{imageWidth:ir?.width||0,imageHeight:ir?.height||0,pillColor:ps?.color||"",pillBackground:ps?.backgroundColor||""};
      });
      check("Profilkártya avatár jelentősen nagyobb",profile.imageWidth>=420,JSON.stringify(profile));
      check("AI koordináció címke kontrasztosabb világos kártyán",profile.pillColor==="rgb(15, 118, 110)"&&profile.pillBackground!=="rgba(0, 0, 0, 0)",JSON.stringify(profile));
      await page.click('[data-testid="benjadmin-person-profile-close"]');
    }
    await page.keyboard.press("d");
    await page.waitForFunction(()=>!document.querySelector('[data-testid="benjadmin-team-screen"]'),{timeout:15000});
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
