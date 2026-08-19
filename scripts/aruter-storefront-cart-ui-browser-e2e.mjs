import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const SUPABASE_URL=required("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY=required("SUPABASE_SERVICE_ROLE_KEY");
const BASE=required("STOREFRONT_CART_BROWSER_BASE").replace(/\/$/,"");
const HOSTNAME=new URL(BASE).hostname;
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checks=[];
let attemptId="";
let organizationId="";
let legacyOrderId="";
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}

async function clickProduct(page,name){
  const result=await page.evaluate((productName)=>{
    const card=[...document.querySelectorAll("article")].find((article)=>article.querySelector("h3")?.textContent?.trim()===productName);
    const button=card?.querySelector("button");
    if(!(button instanceof HTMLButtonElement)||button.disabled)return null;
    const before=button.textContent||"";button.click();return before;
  },name);
  assert.ok(result,`Nem kattintható termékkártya: ${name}`);
}

async function clickButtonByText(page,text){
  const clicked=await page.evaluate((wanted)=>{
    const button=[...document.querySelectorAll("button")].find((item)=>(item.textContent||"").includes(wanted));
    if(!(button instanceof HTMLButtonElement)||button.disabled)return false;button.click();return true;
  },text);
  assert.equal(clicked,true,`Nem kattintható gomb: ${text}`);
}

async function setLabeledValue(page,labelText,value){
  const ok=await page.evaluate(({labelText,value})=>{
    const label=[...document.querySelectorAll("label")].find((item)=>(item.textContent||"").trim().startsWith(labelText));
    const control=label?.querySelector("input,textarea");
    if(!(control instanceof HTMLInputElement)&&!(control instanceof HTMLTextAreaElement))return false;
    const proto=control instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;if(!setter)return false;
    setter.call(control,value);control.dispatchEvent(new Event("input",{bubbles:true}));return true;
  },{labelText,value});
  assert.equal(ok,true,`Nem található mező: ${labelText}`);
}

try{
  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();
  if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const due=await admin.from("commerce_order_mirror_attempts").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("deleted_at",null).in("state",["PENDING","FAILED"]).lte("next_retry_at",new Date().toISOString());if(due.error)throw due.error;
  pass("browser E2E starts with zero foreign due queue jobs",(due.count||0)===0,String(due.count||0));

  const browser=await puppeteer.launch({headless:true,executablePath:puppeteer.executablePath(),args:["--no-sandbox","--disable-setuid-sandbox",`--host-resolver-rules=MAP ${HOSTNAME} 127.0.0.1`]});
  try{
    const page=await browser.newPage();
    await page.setViewport({width:390,height:844,deviceScaleFactor:1});
    await page.goto(BASE,{waitUntil:"networkidle0",timeout:60000});
    await page.waitForFunction(()=>document.body.innerText.includes("Többtételes kosár aktív"),{timeout:15000});
    pass("mobile storefront hydrates multi-item capability",await page.evaluate(()=>document.body.innerText.includes("Többtételes kosár aktív")));
    pass("legacy single-item modal is not open in cart mode",await page.evaluate(()=>!document.body.innerText.includes("Foglalás összesen")));

    await clickProduct(page,"Smaragd tuja 120–140 cm");
    await page.waitForFunction(()=>[...document.querySelectorAll("button")].some((button)=>(button.textContent||"").includes("+ Kosárba (1)")),{timeout:5000});
    await clickProduct(page,"Smaragd tuja 120–140 cm");
    await clickProduct(page,"Fenyőkéreg mulcs 50 l");
    await page.waitForFunction(()=>document.body.innerText.includes("Kosár · 3"),{timeout:5000});
    pass("product cards add and aggregate cart quantities",await page.evaluate(()=>document.body.innerText.includes("Kosár · 3")));

    await clickButtonByText(page,"Kosár · 3");
    await page.waitForFunction(()=>document.body.innerText.includes("Kosár és átvétel"),{timeout:5000});
    pass("mobile sticky cart opens checkout sheet",await page.evaluate(()=>document.body.innerText.includes("Kosár és átvétel")));
    const sheetOverflow=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    pass("checkout sheet has no horizontal mobile overflow",sheetOverflow.sw<=sheetOverflow.cw+1,JSON.stringify(sheetOverflow));

    const incremented=await page.evaluate(()=>{
      const button=[...document.querySelectorAll("button")].find((item)=>item.getAttribute("aria-label")==="Fenyőkéreg mulcs 50 l mennyiség növelése");
      if(!(button instanceof HTMLButtonElement))return false;button.click();return true;
    });
    pass("checkout quantity plus control is clickable",incremented);
    await page.waitForFunction(()=>document.body.innerText.includes("2 termék · 4 egység"),{timeout:5000});
    pass("checkout reflects updated total quantity",await page.evaluate(()=>document.body.innerText.includes("2 termék · 4 egység")));

    await setLabeledValue(page,"Név *","Storefront Browser QA");
    await setLabeledValue(page,"Telefon *","+36 30 444 5555");
    await setLabeledValue(page,"E-mail","browser-cart@example.invalid");
    await setLabeledValue(page,"Megjegyzés","Browser E2E");
    const privacy=await page.evaluate(()=>{
      const label=[...document.querySelectorAll("label")].find((item)=>(item.textContent||"").includes("Elfogadom"));
      const checkbox=label?.querySelector('input[type="checkbox"]');if(!(checkbox instanceof HTMLInputElement))return false;checkbox.click();return true;
    });
    pass("privacy checkbox is interactive",privacy);
    await page.waitForFunction(()=>{
      const button=[...document.querySelectorAll("button")].find((item)=>(item.textContent||"").includes("Rendelés leadása"));
      return button instanceof HTMLButtonElement&&!button.disabled;
    },{timeout:5000});
    pass("checkout submit enables only after required fields",true);

    const responsePromise=page.waitForResponse((response)=>response.url().includes("/api/aruter/public-checkouts")&&response.request().method()==="POST",{timeout:15000});
    await clickButtonByText(page,"Rendelés leadása");
    const checkoutResponse=await responsePromise;
    const checkoutJson=await checkoutResponse.json();
    pass("browser checkout POST returns HTTP 201",checkoutResponse.status()===201&&checkoutJson?.ok===true,`${checkoutResponse.status()} ${JSON.stringify(checkoutJson).slice(0,500)}`);
    legacyOrderId=String(checkoutJson?.data?.orderId||"");
    pass("browser checkout returns one two-line order",checkoutJson?.data?.lineCount===2&&checkoutJson?.data?.itemQuantity===4&&Boolean(legacyOrderId),JSON.stringify(checkoutJson?.data));
    await page.waitForFunction(()=>document.body.innerText.includes("Rendelés rögzítve"),{timeout:10000});
    pass("browser shows successful order confirmation",await page.evaluate(()=>document.body.innerText.includes("Rendelés rögzítve")));
    pass("browser success displays server order number",await page.evaluate((orderNumber)=>document.body.innerText.includes(orderNumber),checkoutJson.data.orderNumber));

    const attempt=await admin.from("commerce_order_mirror_attempts").select("id,state,attempt_count,legacy_order_payload").eq("organization_id",organizationId).eq("legacy_order_id",legacyOrderId).is("deleted_at",null).maybeSingle();if(attempt.error)throw attempt.error;
    attemptId=String(attempt.data?.id||"");
    pass("browser checkout creates one PENDING service queue attempt",attempt.data?.state==="PENDING"&&Number(attempt.data?.attempt_count)===0&&Boolean(attemptId),JSON.stringify(attempt.data));
    pass("browser queue snapshot contains both cart lines",attempt.data?.legacy_order_payload?.items?.length===2,JSON.stringify(attempt.data?.legacy_order_payload?.items));

    await clickButtonByText(page,"Rendben");
    await page.waitForFunction(()=>document.body.innerText.includes("Rendelés elküldve"),{timeout:5000});
    pass("finish returns to storefront and shows order summary",await page.evaluate(()=>document.body.innerText.includes("Rendelés elküldve")));
    pass("successful finish clears visible cart",await page.evaluate(()=>document.body.innerText.includes("A kosár üres.")));
    const mobileOverflow=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    pass("completed storefront has no horizontal mobile overflow",mobileOverflow.sw<=mobileOverflow.cw+1,JSON.stringify(mobileOverflow));

    await page.setViewport({width:1366,height:768,deviceScaleFactor:1});
    await new Promise((resolve)=>setTimeout(resolve,200));
    const desktopOverflow=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    pass("storefront has no horizontal desktop overflow",desktopOverflow.sw<=desktopOverflow.cw+1,JSON.stringify(desktopOverflow));
  } finally {
    await browser.close();
  }

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  if(attemptId){
    const archived=await admin.from("commerce_order_mirror_attempts").update({deleted_at:new Date().toISOString()}).eq("organization_id",organizationId).eq("id",attemptId).is("deleted_at",null).select("id").maybeSingle();
    if(archived.error)console.error("QA attempt cleanup hiba:",archived.error.message);
  }
}
