import assert from "node:assert/strict";

const base=(process.env.STOREFRONT_E2E_BASE||"").replace(/\/$/,"");
assert.ok(base,"STOREFRONT_E2E_BASE hiányzik");
const host=process.env.STOREFRONT_E2E_HOST||"app.dev.dimpro.hu";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
async function api(path,{method="GET",body}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{host,"x-forwarded-host":host,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"manual"});
  const raw=await response.text();let json=null;try{json=JSON.parse(raw);}catch{}
  return{status:response.status,raw,json,headers:response.headers};
}
async function waitFor(label,probe,{timeoutMs=12000,intervalMs=150}={}){const end=Date.now()+timeoutMs;let last;while(Date.now()<end){last=await probe();if(last?.ok)return last.value;await new Promise(resolve=>setTimeout(resolve,intervalMs));}throw new Error(`${label} timeout: ${JSON.stringify(last)}`);}

const catalog=await api("/api/aruter/public-products?businessSlug=kovacs-kerteszet");
pass("pilot public-products endpoint returns 200",catalog.status===200&&catalog.json?.ok===true,`${catalog.status} ${catalog.raw.slice(0,300)}`);
pass("pilot catalog and cashier bridge are explicitly enabled in isolated runtime",catalog.json?.data?.pilotEnabled===true&&catalog.json?.data?.orderBridgeEnabled===true,JSON.stringify(catalog.json?.data));
const product=catalog.json?.data?.products?.find?.((item)=>item.id==="prod-001");
pass("authoritative shared product is published",product?.name==="Smaragd tuja 120–140 cm"&&product?.unit==="db",JSON.stringify(product));
pass("published gross price is derived from net + VAT",Math.abs(Number(product?.price)-6972.3)<0.001,String(product?.price));

const created=await api("/api/aruter/public-reservations",{method:"POST",body:{
  businessSlug:"kovacs-kerteszet",
  product:{id:"prod-001",name:"HAMIS KLIENS NÉV",description:"HAMIS",price:1,unit:"kg"},
  quantity:2,
  pickupSlotId:"slot-1500",
  pickupSlotLabel:"15:00",
  customerName:"Storefront Pilot QA",
  phone:"+36 30 000 0000",
  email:"storefront-pilot@example.invalid",
  note:"HTTP E2E",
  acceptedPrivacy:true,
}});
pass("public reservation remains primary HTTP 201 success",created.status===201&&created.json?.ok===true,`${created.status} ${created.raw.slice(0,500)}`);
const reservation=created.json?.data;assert.ok(reservation?.id,"Reservation id hiányzik");
pass("server overwrites tampered client product name",reservation.productName==="Smaragd tuja 120–140 cm",JSON.stringify(reservation));
pass("server overwrites tampered client price and unit",Math.abs(Number(reservation.productPrice)-6972.3)<0.001&&reservation.productUnit==="db",JSON.stringify(reservation));

const bridgedOrder=await waitFor("cashier bridge",async()=>{
  const response=await api("/api/aruter/orders");
  const item=response.json?.data?.find?.((order)=>order.note?.includes?.(`[PUBLIC_RESERVATION:${reservation.id}]`));
  return{ok:response.status===200&&Boolean(item),value:item};
});
pass("saved public reservation becomes one legacy cashier order",bridgedOrder.status==="sent_to_cashier",JSON.stringify(bridgedOrder));
pass("cashier order uses authoritative SKU net price VAT and storage",bridgedOrder.items?.length===1&&bridgedOrder.items[0]?.sku==="KERT-TUJA-120"&&Number(bridgedOrder.items[0]?.priceNet)===5490&&Number(bridgedOrder.items[0]?.vatRate)===27&&bridgedOrder.items[0]?.storageZone==="Külső árutér / A2 sor",JSON.stringify(bridgedOrder.items));
pass("cashier order preserves requested quantity",Number(bridgedOrder.items?.[0]?.quantity)===2,JSON.stringify(bridgedOrder.items));

const confirmed=await api(`/api/aruter/public-reservations/${reservation.id}/status`,{method:"PATCH",body:{status:"confirmed"}});
pass("reservation preparation status remains independent",confirmed.status===200&&confirmed.json?.data?.status==="confirmed",`${confirmed.status} ${confirmed.raw.slice(0,300)}`);
await new Promise(resolve=>setTimeout(resolve,250));
let orders=await api("/api/aruter/orders");
let sameOrder=orders.json?.data?.find?.((order)=>order.id===bridgedOrder.id);
pass("confirmed reservation does not incorrectly mark cashier paid or issued",sameOrder?.status==="sent_to_cashier",JSON.stringify(sameOrder));

const cancelled=await api(`/api/aruter/public-reservations/${reservation.id}/status`,{method:"PATCH",body:{status:"cancelled"}});
pass("reservation cancellation remains successful",cancelled.status===200&&cancelled.json?.data?.status==="cancelled",`${cancelled.status} ${cancelled.raw.slice(0,300)}`);
const cancelledOrder=await waitFor("cashier cancellation",async()=>{
  const response=await api("/api/aruter/orders");
  const item=response.json?.data?.find?.((order)=>order.id===bridgedOrder.id);
  return{ok:item?.status==="cancelled",value:item};
});
pass("reservation cancellation propagates to non-terminal cashier order",cancelledOrder.status==="cancelled",JSON.stringify(cancelledOrder));

const replay=await api(`/api/aruter/public-reservations/${reservation.id}/status`,{method:"PATCH",body:{status:"cancelled"}});
pass("replayed reservation cancellation remains HTTP success",replay.status===200&&replay.json?.ok===true,`${replay.status}`);
await new Promise(resolve=>setTimeout(resolve,300));
orders=await api("/api/aruter/orders");
const markerOrders=orders.json?.data?.filter?.((order)=>order.note?.includes?.(`[PUBLIC_RESERVATION:${reservation.id}]`))||[];
pass("replayed bridge does not duplicate cashier order",markerOrders.length===1,String(markerOrders.length));

const reservations=await api("/api/aruter/public-reservations?businessSlug=kovacs-kerteszet");
const finalReservation=reservations.json?.data?.find?.((item)=>item.id===reservation.id);
pass("public reservation remains visible with terminal cancelled state",reservations.status===200&&finalReservation?.status==="cancelled",JSON.stringify(finalReservation));

console.log(`RESULT ${checks.length}/${checks.length} PASS`);
