import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const adminBase=process.env.BENJADMIN_UI_BASE||"http://admin.dev.dimpro.hu:3100/admin";
const consoleUrl=process.env.BENJADMIN_CONSOLE_URL||"http://admin.dev.dimpro.hu:3100/admin/dev-console";
let passed=0;
function check(name,ok,details=""){if(!ok)throw new Error(`${name}: ${details}`);passed+=1;console.log(`PASS ${name}${details?` :: ${details}`:""}`)}
async function seed(page){await page.evaluateOnNewDocument((key)=>{localStorage.setItem("dimproLicenseAdminKey",key);sessionStorage.setItem("dimproBenjadminSession","active");localStorage.setItem("dimpro-admin-theme","dark");localStorage.removeItem("benjadmin-team-display-theme");localStorage.setItem("benjadmin-developer-console-theme","light");},adminKey);}
async function clickAria(page,label){await page.$eval(`button[aria-label="${label}"]`,el=>el.click());}

const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox","--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
try{
  const page=await browser.newPage(); await page.setBypassServiceWorker(true); await seed(page); await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto(adminBase,{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForSelector('[data-testid="benjadmin-team-screen-button"]',{timeout:30000});
  await page.click('[data-testid="benjadmin-team-screen-button"]');
  await page.waitForSelector('[data-testid="benjadmin-team-theme-modes"]',{timeout:20000});
  const themeButtons=await page.$$eval('[data-testid="benjadmin-team-theme-modes"] button',els=>els.map(el=>el.getAttribute('aria-label')));
  check("Működési nézet három explicit témagombot ad",JSON.stringify(themeButtons)===JSON.stringify(["Világos mód","Sötét mód","Sunlight mód"]),JSON.stringify(themeButtons));
  for(const [label,expected] of [["Világos mód","light"],["Sötét mód","dark"],["Sunlight mód","sunlight"]]){
    await clickAria(page,label); await page.waitForFunction(v=>document.querySelector('[data-testid="benjadmin-team-screen"]')?.getAttribute('data-theme')===v,{},expected);
    const saved=await page.evaluate(()=>localStorage.getItem('benjadmin-team-display-theme'));
    check(`Működési nézet ${label} működik és megmarad`,saved===expected,`saved=${saved}`);
  }
  await clickAria(page,"Világos mód");
  const lightColors=await page.evaluate(()=>({screen:getComputedStyle(document.querySelector('[data-testid="benjadmin-team-screen"]')).backgroundImage,center:getComputedStyle(document.querySelector('.benjadmin-team-screen__center')).backgroundImage,cost:getComputedStyle(document.querySelector('[data-panel="costs"]')).backgroundColor}));
  check("Világos mód teljes, egységes világos vászon — nem hibrid szürke kártya",lightColors.screen.includes('linear-gradient')&&lightColors.center.includes('linear-gradient')&&lightColors.cost!=='rgba(9, 26, 38, 0.34)',JSON.stringify(lightColors));

  await page.click('[data-testid="team-member-benai"] .benjadmin-team-screen__avatar-button');
  await page.waitForSelector('[data-testid="benjadmin-person-profile-card"]',{timeout:10000});
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="benjadmin-person-profile-card"]',{hidden:true,timeout:10000});
  check("Avatár profilkártya ESC billentyűvel bezárható",true);

  await page.click('.benjadmin-team-screen__finance-hex');
  await page.waitForSelector('.benjadmin-team-screen__finance-popover');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.benjadmin-team-screen__finance-popover',{hidden:true,timeout:10000});
  check("Finanszírozási hover/popover ESC billentyűvel bezárható",true);

  await page.keyboard.press('d'); await page.waitForFunction(()=>!document.querySelector('[data-testid="benjadmin-team-screen"]'),{timeout:10000});

  // Ctrl+Alt+1 opens the named developer console popup.
  const popupPromise=new Promise(resolve=>browser.once('targetcreated',resolve));
  await page.keyboard.down('Control'); await page.keyboard.down('Alt'); await page.keyboard.press('Digit1'); await page.keyboard.up('Alt'); await page.keyboard.up('Control');
  const popupTarget=await Promise.race([popupPromise,new Promise(resolve=>setTimeout(()=>resolve(null),6000))]);
  check("Ctrl+Alt+1 külön Fejlesztői Konzol ablakot nyit",Boolean(popupTarget));
  const popupPage=popupTarget&&typeof popupTarget.page==='function'?await popupTarget.page():null;
  if(popupPage){
    await popupPage.waitForSelector('[data-testid="benjadmin-developer-console"]',{timeout:30000});
    const popupSize=await popupPage.evaluate(()=>({iw:innerWidth,ih:innerHeight,aw:screen.availWidth,ah:screen.availHeight,name:window.name}));
    check("Konzolablak a rendelkezésre álló képernyőméretet kéri",popupSize.iw>=Math.min(900,popupSize.aw*.8)&&popupSize.ih>=Math.min(600,popupSize.ah*.75),JSON.stringify(popupSize));
    await popupPage.close();
  }

  await page.goto(consoleUrl,{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForSelector('[data-testid="benjadmin-developer-console"]',{timeout:30000});
  const avatarState=await page.evaluate(()=>{
    const avatars=Array.from(document.querySelectorAll('span[role="button"][title*="profil megnyitása"]'));
    const computed=avatars.map(el=>{const inner=el.firstElementChild;const img=inner?.querySelector('img');return{clip:getComputedStyle(el).clipPath,bg:getComputedStyle(el).backgroundColor,innerClip:inner?getComputedStyle(inner).clipPath:'',objectFit:img?getComputedStyle(img).objectFit:''};});
    const leader=document.querySelector('[aria-label="BENJADMIN · VEZETŐ"]'); const leaderImg=leader?.querySelector('img'); const leaderCard=leader?.getBoundingClientRect(); const imgRect=leaderImg?.getBoundingClientRect();
    return{count:avatars.length,computed,leaderCard:leaderCard?.toJSON(),leaderImg:imgRect?.toJSON(),leaderBorder:getComputedStyle(leader).borderStyle};
  });
  check("Avatar artwork körül nincs második elforgatott hexagon keret",avatarState.count>=5&&avatarState.computed.every(x=>(x.clip==='none'||x.clip==='')&&(x.innerClip==='none'||x.innerClip==='')&&x.objectFit==='contain'),JSON.stringify(avatarState.computed.slice(0,8)));
  check("Alsó BenjAdmin avatár kb. kétszeres, önálló kártyában",avatarState.leaderImg?.width>=135&&avatarState.leaderImg?.height>=135&&avatarState.leaderCard?.height>=150&&avatarState.leaderBorder==='solid',JSON.stringify(avatarState));

  // Console drawer Escape.
  const buttons=await page.$$('button');
  let opened=false;
  for(const button of buttons){const txt=await button.evaluate(el=>el.textContent||''); if(txt.includes('ChatGPT Parancstár')){await button.click();opened=true;break;}}
  check("Parancstár megnyitható",opened);
  await page.waitForSelector('[aria-label="ChatGPT Parancstár"]',{timeout:10000}); await page.keyboard.press('Escape'); await page.waitForSelector('[aria-label="ChatGPT Parancstár"]',{hidden:true,timeout:10000});
  check("Fejlesztői Konzol drawer ESC billentyűvel bezárható",true);

  // Shared profile card from console also Escape-closes.
  await page.click('span[role="button"][title*="profil megnyitása"]'); await page.waitForSelector('[data-testid="benjadmin-person-profile-card"]',{timeout:10000}); await page.keyboard.press('Escape'); await page.waitForSelector('[data-testid="benjadmin-person-profile-card"]',{hidden:true,timeout:10000});
  check("Konzolból nyitott profilkártya is ESC-képes",true);
} finally { await browser.close(); }
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
