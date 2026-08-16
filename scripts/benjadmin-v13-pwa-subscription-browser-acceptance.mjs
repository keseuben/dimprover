#!/usr/bin/env node
import fs from "node:fs";
import puppeteer from "puppeteer";
const key=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const uiBase=process.env.BENJADMIN_UI_BASE||"http://admin.dev.dimpro.hu:3100/admin";
const origin=new URL(uiBase).origin;
let passed=0;
function check(name,ok,detail=""){if(!ok)throw new Error(`${name}${detail?` :: ${detail}`:""}`);passed++;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox",`--unsafely-treat-insecure-origin-as-secure=${origin}`,"--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"]});
try{
  await browser.defaultBrowserContext().overridePermissions(origin,["notifications"]);
  const page=await browser.newPage();
  await page.evaluateOnNewDocument((adminKey)=>{localStorage.setItem("dimproLicenseAdminKey",adminKey);sessionStorage.setItem("dimproBenjadminSession","active");localStorage.setItem("benjadmin-developer-console-theme","dark");},key);
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto(`${uiBase}/dev-console`,{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForSelector('[data-testid="benjadmin-developer-console"]',{timeout:30000});
  await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find((n)=>n.textContent?.trim()==="Telepítés");if(!(b instanceof HTMLElement))throw new Error("Telepítés gomb hiányzik");b.click();});
  await page.waitForSelector('[data-testid="benjadmin-push-device-state"]',{timeout:30000});
  await page.waitForFunction(()=>document.body.textContent?.includes("Push szerver kész"),{timeout:30000});
  const inspect=()=>page.evaluate(()=>{
    const state=document.querySelector('[data-testid="benjadmin-push-device-state"]');
    const controls=state?.closest(".dev-pwa-controls");
    const buttons=[...(controls?.querySelectorAll("button")||[])].map((b)=>({text:b.textContent?.trim()||"",disabled:(b).disabled}));
    return {text:controls?.textContent||"",state:state?.textContent||"",buttons,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,secure:isSecureContext,permission:("Notification" in window?Notification.permission:"unsupported"),sw:"serviceWorker" in navigator,push:"PushManager" in window};
  });
  let state=await inspect();
  check("PWA origin treated secure",state.secure===true,JSON.stringify(state));
  check("Browser exposes service worker and PushManager",state.sw===true&&state.push===true,JSON.stringify(state));
  check("Notification permission granted in acceptance",state.permission==="granted",state.permission);
  check("Push server ready visible",state.text.includes("Push szerver kész"),state.text);
  check("Local device state is explicit",state.text.includes("Ezen az eszközön:")&&state.text.includes("Szerveren:"),state.text);
  check("Unsubscribed device shows action",state.state.includes("TEENDŐ: nyomja meg a Push engedélyezése"),state.state);
  check("State refresh action visible",state.buttons.some((b)=>b.text.includes("Állapot frissítése")&&!b.disabled),JSON.stringify(state.buttons));
  check("Task push test is disabled before subscription",state.buttons.some((b)=>b.text.includes("Task push teszt")&&b.disabled),JSON.stringify(state.buttons));
  check("Desktop PWA panel overflow safe",state.overflow===false,JSON.stringify(state));
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await new Promise((resolve)=>setTimeout(resolve,300));
  state=await inspect();
  check("Mobile PWA state remains visible",state.state.includes("TEENDŐ")||state.state.includes("KÉSZ"),state.state);
  check("Mobile PWA panel overflow safe",state.overflow===false,JSON.stringify(state));
  console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
} finally { await browser.close(); }
