"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, Loader2, PackagePlus, Plus, RefreshCw, Trash2, Truck, X } from "lucide-react";
import { AruterBrand, AruterCard, AruterPageShell } from "./AruterShared";

type ApiResult<T>={ok:boolean;data?:T;error?:string;code?:string};
type ReceiptStatus="DRAFT"|"POSTED"|"CANCELLED";
type Receipt={id:string;warehouseId:string;sourceId:string;receiptNumber:string;supplierName:string|null;supplierDocumentNumber:string|null;status:ReceiptStatus;receivedAt:string;postedAt:string|null;notes:string|null};
type ReceiptItem={id:string;receiptId:string;variantId:string;stockStatus:string;quantity:string;unit:string;unitCostMinor:string|null;currency:string;lotCode:string|null;expiryDate:string|null;notes:string|null};
type ReceiptDetail=Receipt&{items:ReceiptItem[]};
type Options={warehouses:Array<{id:string;code:string;name:string}>;sources:Array<{id:string;warehouseId:string;code:string;name:string}>};
type Product={id:string;name:string;typeModel:string|null;defaultVariantId:string|null;sku:string|null;unit:string|null;status:string};

type NewReceipt={receiptNumber:string;supplierName:string;supplierDocumentNumber:string;warehouseId:string;sourceId:string;notes:string};
type NewItem={productId:string;variantId:string;quantity:string;stockStatus:"SELLABLE"|"QUARANTINE"|"DAMAGED"|"OUTLET";unit:string;unitCostMinor:string;lotCode:string;expiryDate:string};
const EMPTY_RECEIPT:NewReceipt={receiptNumber:"",supplierName:"",supplierDocumentNumber:"",warehouseId:"",sourceId:"",notes:""};
const EMPTY_ITEM:NewItem={productId:"",variantId:"",quantity:"1",stockStatus:"SELLABLE",unit:"DB",unitCostMinor:"",lotCode:"",expiryDate:""};

function statusLabel(status:ReceiptStatus){return status==="DRAFT"?"Vázlat":status==="POSTED"?"Könyvelt":"Visszavont";}
function statusClass(status:ReceiptStatus){return status==="POSTED"?"border-emerald-200 bg-emerald-50 text-emerald-700":status==="DRAFT"?"border-amber-200 bg-amber-50 text-amber-700":"border-slate-200 bg-slate-50 text-slate-600";}
function formatDate(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat("hu-HU",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);}
function formatQuantity(value:string,unit:string){const n=Number(value);return Number.isFinite(n)?`${new Intl.NumberFormat("hu-HU",{maximumFractionDigits:3}).format(n)} ${unit.toLowerCase()}`:"—";}

export function CommerceReceivingAdmin(){
  const [receipts,setReceipts]=useState<Receipt[]>([]);
  const [options,setOptions]=useState<Options>({warehouses:[],sources:[]});
  const [products,setProducts]=useState<Product[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [detail,setDetail]=useState<ReceiptDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [detailLoading,setDetailLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [createMode,setCreateMode]=useState(false);
  const [newReceipt,setNewReceipt]=useState<NewReceipt>(EMPTY_RECEIPT);
  const [savingReceipt,setSavingReceipt]=useState(false);
  const [addingItem,setAddingItem]=useState(false);
  const [newItem,setNewItem]=useState<NewItem>(EMPTY_ITEM);
  const [savingItem,setSavingItem]=useState(false);
  const [posting,setPosting]=useState(false);

  const loadBase=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const [receiptsResponse,optionsResponse,productsResponse]=await Promise.all([
        fetch("/api/v1/commerce/receiving?limit=100",{cache:"no-store"}),
        fetch("/api/v1/commerce/receiving/options",{cache:"no-store"}),
        fetch("/api/v1/commerce/products?status=ACTIVE&limit=200",{cache:"no-store"}),
      ]);
      const [receiptsResult,optionsResult,productsResult]=await Promise.all([
        receiptsResponse.json() as Promise<ApiResult<Receipt[]>>,
        optionsResponse.json() as Promise<ApiResult<Options>>,
        productsResponse.json() as Promise<ApiResult<{items:Product[]}>>,
      ]);
      if(!receiptsResponse.ok||!receiptsResult.ok||!receiptsResult.data)throw new Error(receiptsResult.error||"A bevételezések nem tölthetők be.");
      if(!optionsResponse.ok||!optionsResult.ok||!optionsResult.data)throw new Error(optionsResult.error||"A raktáradatok nem tölthetők be.");
      if(!productsResponse.ok||!productsResult.ok||!productsResult.data)throw new Error(productsResult.error||"A terméktörzs nem tölthető be.");
      setReceipts(receiptsResult.data);setOptions(optionsResult.data);setProducts(productsResult.data.items);
      setSelectedId((current)=>current&&receiptsResult.data!.some((r)=>r.id===current)?current:receiptsResult.data![0]?.id||null);
    }catch(cause){setError(cause instanceof Error?cause.message:"A bevételezési adatok nem tölthetők be.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void loadBase();},[loadBase]);
  useEffect(()=>{
    if(!selectedId||createMode){setDetail(null);return;}
    let active=true;setDetailLoading(true);
    fetch(`/api/v1/commerce/receiving/${selectedId}`,{cache:"no-store"})
      .then(async response=>({response,result:await response.json() as ApiResult<ReceiptDetail>}))
      .then(({response,result})=>{if(!active)return;if(!response.ok||!result.ok||!result.data)throw new Error(result.error||"A bevételezés nem tölthető be.");setDetail(result.data);})
      .catch(cause=>active&&setError(cause instanceof Error?cause.message:"A bevételezés nem tölthető be."))
      .finally(()=>active&&setDetailLoading(false));
    return()=>{active=false;};
  },[selectedId,createMode]);

  const selected=useMemo(()=>receipts.find((r)=>r.id===selectedId)||null,[receipts,selectedId]);
  const filteredSources=useMemo(()=>options.sources.filter((source)=>!newReceipt.warehouseId||source.warehouseId===newReceipt.warehouseId),[newReceipt.warehouseId,options.sources]);
  const totalQuantity=useMemo(()=>detail?.items.reduce((sum,item)=>sum+Number(item.quantity||0),0)||0,[detail]);

  function beginCreate(){
    const warehouse=options.warehouses[0];const source=warehouse?options.sources.find((item)=>item.warehouseId===warehouse.id):undefined;
    setNewReceipt({...EMPTY_RECEIPT,receiptNumber:`BEV-${new Date().toISOString().replace(/\D/g,"").slice(0,14)}`,warehouseId:warehouse?.id||"",sourceId:source?.id||""});
    setCreateMode(true);setSelectedId(null);
  }

  async function refreshDetail(receiptId=selectedId){if(!receiptId)return;const response=await fetch(`/api/v1/commerce/receiving/${receiptId}`,{cache:"no-store"});const result=await response.json() as ApiResult<ReceiptDetail>;if(!response.ok||!result.ok||!result.data)throw new Error(result.error||"A bevételezés nem frissíthető.");setDetail(result.data);}

  async function createReceipt(event:FormEvent){
    event.preventDefault();if(!newReceipt.receiptNumber||!newReceipt.warehouseId||!newReceipt.sourceId)return;setSavingReceipt(true);setError(null);
    try{const response=await fetch("/api/v1/commerce/receiving",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({receiptNumber:newReceipt.receiptNumber,supplierName:newReceipt.supplierName||null,supplierDocumentNumber:newReceipt.supplierDocumentNumber||null,warehouseId:newReceipt.warehouseId,sourceId:newReceipt.sourceId,notes:newReceipt.notes||null})});const result=await response.json() as ApiResult<Receipt>;if(!response.ok||!result.ok||!result.data)throw new Error(result.error||"A bevételezés mentése sikertelen.");setCreateMode(false);await loadBase();setSelectedId(result.data.id);}
    catch(cause){setError(cause instanceof Error?cause.message:"A bevételezés mentése sikertelen.");}finally{setSavingReceipt(false);}
  }

  function chooseProduct(productId:string){const product=products.find((item)=>item.id===productId);setNewItem({...newItem,productId,variantId:product?.defaultVariantId||"",unit:product?.unit||"DB"});}

  async function addItem(event:FormEvent){
    event.preventDefault();if(!selectedId||!newItem.variantId||!newItem.quantity)return;setSavingItem(true);setError(null);
    try{const response=await fetch(`/api/v1/commerce/receiving/${selectedId}/items`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({variantId:newItem.variantId,quantity:newItem.quantity,stockStatus:newItem.stockStatus,unit:newItem.unit,unitCostMinor:newItem.unitCostMinor||null,currency:"HUF",lotCode:newItem.lotCode||null,expiryDate:newItem.expiryDate||null})});const result=await response.json() as ApiResult<ReceiptItem>;if(!response.ok||!result.ok)throw new Error(result.error||"A tétel mentése sikertelen.");setNewItem(EMPTY_ITEM);setAddingItem(false);await refreshDetail();}
    catch(cause){setError(cause instanceof Error?cause.message:"A tétel mentése sikertelen.");}finally{setSavingItem(false);}
  }

  async function removeItem(itemId:string){if(!selectedId)return;setError(null);try{const response=await fetch(`/api/v1/commerce/receiving/${selectedId}/items/${itemId}`,{method:"DELETE"});const result=await response.json() as ApiResult<unknown>;if(!response.ok||!result.ok)throw new Error(result.error||"A tétel törlése sikertelen.");await refreshDetail();}catch(cause){setError(cause instanceof Error?cause.message:"A tétel törlése sikertelen.");}}

  async function postReceipt(){
    if(!selectedId||!detail?.items.length||posting)return;setPosting(true);setError(null);
    try{const key=`ui-receipt-post-${selectedId}`;const response=await fetch(`/api/v1/commerce/receiving/${selectedId}/post`,{method:"POST",headers:{"content-type":"application/json","idempotency-key":key},body:JSON.stringify({idempotencyKey:key})});const result=await response.json() as ApiResult<unknown>;if(!response.ok||!result.ok)throw new Error(result.error||"A bevételezés könyvelése sikertelen.");await loadBase();setSelectedId(selectedId);await refreshDetail(selectedId);}
    catch(cause){setError(cause instanceof Error?cause.message:"A bevételezés könyvelése sikertelen.");}finally{setPosting(false);}
  }

  return <AruterPageShell>
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><AruterBrand compact/><span className="hidden h-10 w-px bg-slate-200 sm:block"/><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commerce Core</p><h1 className="text-xl font-black text-slate-900">Bevételezés</h1></div></div><div className="flex gap-2"><Link href="/aruter/admin/termekek" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700"><ArrowLeft size={17}/> Termékek</Link><button type="button" onClick={beginCreate} className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 font-black text-white"><Plus size={18}/> Új bevételezés</button></div></div></header>
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      {error&&<div className="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertCircle size={20}/><div><b>Bevételezés</b><p className="mt-1 text-sm font-semibold">{error}</p></div></div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <AruterCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="text-xl font-black">Bevételezések</h2><p className="text-sm font-semibold text-slate-500">{loading?"Betöltés...":`${receipts.length} bizonylat`}</p></div><button onClick={()=>void loadBase()} className="rounded-xl border border-slate-200 p-2.5 text-slate-600"><RefreshCw size={18}/></button></div>
          <div className="divide-y divide-slate-100">{receipts.map(receipt=><button key={receipt.id} type="button" onClick={()=>{setCreateMode(false);setSelectedId(receipt.id);}} className={`flex w-full items-center gap-4 p-4 text-left hover:bg-teal-50/40 ${selectedId===receipt.id?"bg-teal-50/70":""}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><ClipboardList size={20}/></span><span className="min-w-0 flex-1"><b className="block truncate">{receipt.receiptNumber}</b><span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{receipt.supplierName||"Nincs megadott beszállító"} · {formatDate(receipt.receivedAt)}</span></span><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(receipt.status)}`}>{statusLabel(receipt.status)}</span></button>)}</div>
          {!loading&&!receipts.length&&<div className="p-10 text-center"><PackagePlus className="mx-auto text-slate-300" size={38}/><b className="mt-3 block">Még nincs bevételezés.</b><p className="mt-1 text-sm font-semibold text-slate-500">Hozza létre az első bevételezési bizonylatot.</p></div>}
        </AruterCard>

        <AruterCard className="h-fit p-5 xl:sticky xl:top-5">
          {createMode?<form onSubmit={createReceipt}><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">Új bevételezés</p><h2 className="mt-1 text-2xl font-black">Bizonylat fej</h2></div><button type="button" onClick={()=>setCreateMode(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500"><X size={18}/></button></div><div className="mt-5 space-y-3">
            <label className="block"><span className="text-sm font-black">Bevételezési szám *</span><input value={newReceipt.receiptNumber} onChange={e=>setNewReceipt({...newReceipt,receiptNumber:e.target.value})} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-teal-400"/></label>
            <label className="block"><span className="text-sm font-black">Beszállító</span><input value={newReceipt.supplierName} onChange={e=>setNewReceipt({...newReceipt,supplierName:e.target.value})} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"/></label>
            <label className="block"><span className="text-sm font-black">Szállítólevél / bizonylat</span><input value={newReceipt.supplierDocumentNumber} onChange={e=>setNewReceipt({...newReceipt,supplierDocumentNumber:e.target.value})} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"/></label>
            <label className="block"><span className="text-sm font-black">Raktár *</span><select value={newReceipt.warehouseId} onChange={e=>{const warehouseId=e.target.value;const source=options.sources.find(item=>item.warehouseId===warehouseId);setNewReceipt({...newReceipt,warehouseId,sourceId:source?.id||""});}} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="">Válasszon...</option>{options.warehouses.map(item=><option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></label>
            <label className="block"><span className="text-sm font-black">Készletforrás *</span><select value={newReceipt.sourceId} onChange={e=>setNewReceipt({...newReceipt,sourceId:e.target.value})} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"><option value="">Válasszon...</option>{filteredSources.map(item=><option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></label>
            <label className="block"><span className="text-sm font-black">Megjegyzés</span><textarea value={newReceipt.notes} onChange={e=>setNewReceipt({...newReceipt,notes:e.target.value})} className="mt-1.5 min-h-20 w-full rounded-xl border border-slate-200 p-3"/></label>
          </div><button disabled={savingReceipt||!newReceipt.receiptNumber||!newReceipt.warehouseId||!newReceipt.sourceId} className="mt-5 h-12 w-full rounded-xl bg-teal-700 font-black text-white disabled:bg-slate-300">{savingReceipt?"Mentés...":"Vázlat létrehozása"}</button></form>
          :detailLoading?<div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-teal-700"/></div>
          :detail||selected?<div><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Bevételezési bizonylat</p><h2 className="mt-1 text-2xl font-black">{detail?.receiptNumber||selected?.receiptNumber}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{detail?.supplierName||selected?.supplierName||"Nincs beszállító"}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(detail?.status||selected!.status)}`}>{statusLabel(detail?.status||selected!.status)}</span></div>
            <div className="my-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Tételek</p><b className="mt-1 block text-xl">{detail?.items.length||0}</b></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Összes mennyiség</p><b className="mt-1 block text-xl">{new Intl.NumberFormat("hu-HU",{maximumFractionDigits:3}).format(totalQuantity)}</b></div></div>
            <div className="space-y-2">{detail?.items.map(item=>{const product=products.find(p=>p.defaultVariantId===item.variantId);return <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><PackagePlus size={17}/></span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{product?.name||item.variantId.slice(0,8)}</b><span className="text-xs font-semibold text-slate-500">{formatQuantity(item.quantity,item.unit)} · {item.stockStatus}{item.lotCode?` · LOT ${item.lotCode}`:""}</span></div>{detail.status==="DRAFT"&&<button type="button" onClick={()=>void removeItem(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16}/></button>}</div>;})}</div>
            {detail?.status==="DRAFT"&&<>{addingItem?<form onSubmit={addItem} className="mt-4 space-y-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-4"><div className="flex justify-between"><b>Új tétel</b><button type="button" onClick={()=>setAddingItem(false)}><X size={17}/></button></div><label className="block"><span className="text-xs font-black">Termék</span><select value={newItem.productId} onChange={e=>chooseProduct(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm"><option value="">Válasszon...</option>{products.filter(p=>p.defaultVariantId).map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?` · ${p.sku}`:""}</option>)}</select></label><div className="grid grid-cols-[1fr_110px] gap-2"><label><span className="text-xs font-black">Mennyiség</span><input inputMode="decimal" value={newItem.quantity} onChange={e=>setNewItem({...newItem,quantity:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3"/></label><label><span className="text-xs font-black">Egység</span><input value={newItem.unit} readOnly className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm"/></label></div><label className="block"><span className="text-xs font-black">Készletállapot</span><select value={newItem.stockStatus} onChange={e=>setNewItem({...newItem,stockStatus:e.target.value as NewItem["stockStatus"]})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2"><option value="SELLABLE">Eladható</option><option value="QUARANTINE">Karantén</option><option value="DAMAGED">Sérült</option><option value="OUTLET">Outlet</option></select></label><div className="grid grid-cols-2 gap-2"><label><span className="text-xs font-black">LOT / tétel</span><input value={newItem.lotCode} onChange={e=>setNewItem({...newItem,lotCode:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/></label><label><span className="text-xs font-black">Lejárat</span><input type="date" value={newItem.expiryDate} onChange={e=>setNewItem({...newItem,expiryDate:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm"/></label></div><label className="block"><span className="text-xs font-black">Nettó egységköltség (Ft)</span><input inputMode="numeric" value={newItem.unitCostMinor} onChange={e=>setNewItem({...newItem,unitCostMinor:e.target.value.replace(/[^0-9]/g,"")})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3"/></label><button disabled={savingItem||!newItem.variantId||!newItem.quantity} className="h-10 w-full rounded-xl bg-teal-700 text-sm font-black text-white disabled:bg-slate-300">{savingItem?"Mentés...":"Tétel hozzáadása"}</button></form>:<button type="button" onClick={()=>setAddingItem(true)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 font-black text-teal-700"><Plus size={17}/> Tétel hozzáadása</button>}
              <button type="button" onClick={()=>void postReceipt()} disabled={posting||!detail.items.length} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-black text-white disabled:bg-slate-300"><CheckCircle2 size={18}/>{posting?"Könyvelés...":"Bevételezés könyvelése"}</button><p className="mt-2 text-center text-[11px] font-semibold text-slate-400">Könyvelés után a készlet StockMovement naplóval frissül.</p></>}
            {detail?.status==="POSTED"&&<div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 size={20}/><div><b>Könyvelt bevételezés</b><p className="mt-1 text-xs font-semibold">A készletmozgások rögzítve. Könyvelve: {detail.postedAt?formatDate(detail.postedAt):"—"}</p></div></div>}
          </div>:<div className="flex min-h-64 flex-col items-center justify-center text-center"><Truck className="text-slate-300" size={38}/><b className="mt-3">Válasszon bevételezést</b><p className="mt-1 text-sm font-semibold text-slate-500">A bizonylat és tételei itt jelennek meg.</p></div>}
        </AruterCard>
      </div>
    </div>
  </AruterPageShell>;
}
