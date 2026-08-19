import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const BASE=(process.env.STOREFRONT_TRACKING_BROWSER_BASE||"").replace(/\/$/,"");
const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const ORG=process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID||"";
assert.ok(BASE&&SUPABASE_URL&&SERVICE_KEY&&ORG,"Tracking browser E2E config missing");
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let attemptId="",commerceOrderId="",legacyOrderId="";const checks=[];
function pass(name,ok,detail=""){assert.ok(ok,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`)}
async function clickByText(page,text){const ok=await page.evaluate((wanted)=>{const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").includes(wanted));if(!(b instanceof HTMLButtonElement)||b.disabled)return false;b.click();return true},text);assert.equal(ok,true,`Button missing: ${text}`)}
async function setLabel(page,labelText,value){const ok=await page.evaluate(({labelText,value})=>{const label=[...document.querySelectorAll("label")].find(x=>(x.textContent||"").trim().startsWith(labelText));const el=label?.querySelector("input,textarea");if(!(el instanceof HTMLInputElement)&&!(el instanceof HTMLTextAreaElement))return false;const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;if(!setter)return false;setter.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));return true},{labelText,value});assert.equal(ok,true,`Field missing: ${labelText}`)}
async function addProduct(page,name){const ok=await page.evaluate((name)=>{const card=[...document.querySelectorAll("article")].find(a=>a.querySelector("h3")?.textContent?.trim()===name);const b=card?.querySelector("button");if(!(b instanceof HTMLButtonElement)||b.disabled)return false;b.click();return true},name);assert.equal(ok,true,`Product button missing: ${name}`)}

try{
 const due=await admin.from("commerce_order_mirror_attempts").select("id",{count:"exact",head:true}).eq("organization_id",ORG).is("deleted_at",null).in("state",["PENDING","FAILED"]).lte("next_retry_at",new Date().toISOString());if(due.error)throw due.error;pass("browser tracking starts with zero foreign due jobs",(due.count||0)===0,String(due.count||0));
 const browser=await puppeteer.launch({headless:true,executablePath:puppeteer.executablePath(),args:["--no-sandbox","--disable-setuid-sandbox"]});
 try{
  const page=await browser.newPage();await page.setViewport({width:390,height:844});
  const trackingUrls=[];page.on("request",r=>{if(r.url().includes("/public-checkouts/status"))trackingUrls.push(r.url())});
  const r=await page.goto(`${BASE}/aruter/kovacs-kerteszet`,{waitUntil:"networkidle0",timeout:60000});pass("tracking storefront loads on mobile",r?.status()===200,String(r?.status()));
  await page.waitForFunction(()=>document.body.innerText.includes("Többtételes kosár aktív"),{timeout:15000});
  await addProduct(page,"Smaragd tuja 120–140 cm");await addProduct(page,"Fenyőkéreg mulcs 50 l");
  await page.waitForFunction(()=>document.body.innerText.includes("Kosár · 2"),{timeout:5000});pass("two products enter mobile cart",true);
  await clickByText(page,"Kosár · 2");await page.waitForFunction(()=>document.body.innerText.includes("Kosár és átvétel"),{timeout:5000});
  await setLabel(page,"Név *","Tracking Browser QA");await setLabel(page,"Telefon *","+36 30 111 2222");await setLabel(page,"E-mail","tracking-browser@example.invalid");
  const privacy=await page.evaluate(()=>{const label=[...document.querySelectorAll("label")].find(x=>(x.textContent||"").includes("Elfogadom"));const c=label?.querySelector('input[type="checkbox"]');if(!(c instanceof HTMLInputElement))return false;c.click();return true});pass("tracking checkout privacy control works",privacy);
  const responsePromise=page.waitForResponse(x=>x.url().includes("/api/aruter/public-checkouts")&&!x.url().includes("/status")&&x.request().method()==="POST",{timeout:15000});
  await clickByText(page,"Rendelés leadása");const response=await responsePromise;const json=await response.json();pass("browser tracked checkout returns 201",response.status()===201&&json?.ok===true,JSON.stringify(json).slice(0,400));legacyOrderId=String(json.data.orderId||"");pass("browser checkout returns tracking token",typeof json.data.trackingToken==="string"&&json.data.trackingToken.startsWith("v1."));
  await page.waitForFunction(()=>document.body.innerText.includes("Az állapotkövetés aktív"),{timeout:10000});pass("success modal explains tracking",true);
  await clickByText(page,"Rendben");await page.waitForSelector("[data-storefront-tracking-card]",{timeout:5000});pass("tracking card appears after checkout",true);
  const stored=await page.evaluate(()=>localStorage.getItem("dimpro-aruter-last-checkout:kovacs-kerteszet"));pass("tracking token is persisted for reload",Boolean(stored&&JSON.parse(stored).trackingToken));
  await page.waitForFunction(()=>document.body.innerText.includes("Pénztárra küldve"),{timeout:100000});pass("tracking card automatically reaches cashier state",true);
  pass("tracking bearer token never appears in request URL",trackingUrls.length>0&&trackingUrls.every(url=>!url.includes("?")),JSON.stringify(trackingUrls));
  await page.reload({waitUntil:"networkidle0",timeout:60000});await page.waitForSelector("[data-storefront-tracking-card]",{timeout:10000});await page.waitForFunction(()=>document.body.innerText.includes("Pénztárra küldve"),{timeout:15000});pass("tracking card survives full page reload",true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);pass("tracking card has no mobile horizontal overflow",!overflow);
 }finally{await browser.close()}
 const attempt=await admin.from("commerce_order_mirror_attempts").select("id,state,commerce_order_id,attempt_count").eq("organization_id",ORG).eq("legacy_order_id",legacyOrderId).is("deleted_at",null).maybeSingle();if(attempt.error)throw attempt.error;attemptId=String(attempt.data?.id||"");commerceOrderId=String(attempt.data?.commerce_order_id||"");pass("browser tracking queue persisted SUCCEEDED",attempt.data?.state==="SUCCEEDED"&&Number(attempt.data?.attempt_count)===1&&Boolean(commerceOrderId),JSON.stringify(attempt.data));
 console.log(`RESULT ${checks.length}/${checks.length} PASS`);
}finally{
 const now=new Date().toISOString();
 if(commerceOrderId){await admin.from("commerce_order_items").update({deleted_at:now}).eq("organization_id",ORG).eq("order_id",commerceOrderId).is("deleted_at",null);await admin.from("commerce_orders").update({deleted_at:now}).eq("organization_id",ORG).eq("id",commerceOrderId).is("deleted_at",null)}
 if(attemptId)await admin.from("commerce_order_mirror_attempts").update({deleted_at:now}).eq("organization_id",ORG).eq("id",attemptId).is("deleted_at",null);
}
