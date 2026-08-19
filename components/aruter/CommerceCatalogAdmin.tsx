"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Plus, RefreshCw, Save, Tags, Trash2, X } from "lucide-react";
import { AruterBrand, AruterCard, AruterPageShell } from "./AruterShared";

type CatalogKind = "categories" | "brands" | "manufacturers";
type CatalogItem = {
  id: string;
  kind: CatalogKind;
  name: string;
  active: boolean;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
};
type ApiResult<T>={ok:boolean;data?:T;error?:string;code?:string};
const TABS: Array<{kind:CatalogKind;label:string;description:string}> = [
  {kind:"categories",label:"Kategóriák",description:"Hierarchikus termékcsoportok"},
  {kind:"brands",label:"Márkák",description:"Kereskedelmi márkanevek"},
  {kind:"manufacturers",label:"Gyártók",description:"Gyártói törzsadatok"},
];

export function CommerceCatalogAdmin(){
  const [kind,setKind]=useState<CatalogKind>("categories");
  const [items,setItems]=useState<CatalogItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [newName,setNewName]=useState("");
  const [parentId,setParentId]=useState("");
  const [saving,setSaving]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editingName,setEditingName]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const response=await fetch(`/api/v1/commerce/catalog/${kind}?active=true`,{cache:"no-store"});
      const result=await response.json() as ApiResult<CatalogItem[]>;
      if(!response.ok||!result.ok||!result.data)throw new Error(result.error||"A törzsadatlista nem tölthető be.");
      setItems(result.data);
    }catch(cause){setItems([]);setError(cause instanceof Error?cause.message:"A törzsadatlista nem tölthető be.");}
    finally{setLoading(false);}
  },[kind]);

  useEffect(()=>{void load();},[load]);
  const currentTab=useMemo(()=>TABS.find((tab)=>tab.kind===kind)!,[kind]);

  async function createItem(event:FormEvent){
    event.preventDefault();
    if(!newName.trim())return;
    setSaving(true);setError(null);
    try{
      const response=await fetch(`/api/v1/commerce/catalog/${kind}`,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({name:newName.trim(),active:true,...(kind==="categories"?{parentId:parentId||null}: {})}),
      });
      const result=await response.json() as ApiResult<CatalogItem>;
      if(!response.ok||!result.ok)throw new Error(result.error||"A törzsadat mentése sikertelen.");
      setNewName("");setParentId("");await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"A törzsadat mentése sikertelen.");}
    finally{setSaving(false);}
  }

  async function saveEdit(item:CatalogItem){
    if(!editingName.trim())return;
    setSaving(true);setError(null);
    try{
      const response=await fetch(`/api/v1/commerce/catalog/${kind}/${item.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:editingName.trim()})});
      const result=await response.json() as ApiResult<CatalogItem>;
      if(!response.ok||!result.ok)throw new Error(result.error||"A módosítás sikertelen.");
      setEditingId(null);setEditingName("");await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"A módosítás sikertelen.");}
    finally{setSaving(false);}
  }

  async function archiveItem(item:CatalogItem){
    if(!window.confirm(`Archiválja ezt a törzsadatot: ${item.name}?`))return;
    setSaving(true);setError(null);
    try{
      const response=await fetch(`/api/v1/commerce/catalog/${kind}/${item.id}`,{method:"DELETE"});
      const result=await response.json() as ApiResult<{id:string;archived:boolean}>;
      if(!response.ok||!result.ok)throw new Error(result.error||"Az archiválás sikertelen.");
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Az archiválás sikertelen.");}
    finally{setSaving(false);}
  }

  return <AruterPageShell>
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4"><div className="flex items-center gap-4"><AruterBrand compact/><span className="hidden h-10 w-px bg-slate-200 sm:block"/><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commerce Core</p><h1 className="text-xl font-black">Terméktörzs adatok</h1></div></div><Link href="/aruter/admin/termekek" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-black text-slate-700">Vissza a termékekhez</Link></div>
    </header>
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-5 grid gap-3 md:grid-cols-3">{TABS.map((tab)=><button key={tab.kind} type="button" onClick={()=>{setKind(tab.kind);setEditingId(null);setNewName("");setParentId("");}} className={`rounded-2xl border p-4 text-left transition ${kind===tab.kind?"border-teal-400 bg-teal-50":"border-slate-200 bg-white hover:border-teal-200"}`}><div className="flex items-center justify-between"><b className={kind===tab.kind?"text-teal-800":"text-slate-900"}>{tab.label}</b><ChevronRight size={18}/></div><p className="mt-1 text-sm font-semibold text-slate-500">{tab.description}</p></button>)}</div>
      {error&&<div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-900">{error}</div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AruterCard className="overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="text-2xl font-black">{currentTab.label}</h2><p className="text-sm font-semibold text-slate-500">{loading?"Betöltés...":`${items.length} aktív tétel`}</p></div><button type="button" onClick={()=>void load()} className="rounded-xl border border-slate-200 p-2.5 text-slate-600"><RefreshCw size={18}/></button></div>
          <div className="divide-y divide-slate-100">{loading?<div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-teal-700"/></div>:items.length===0?<div className="p-10 text-center text-slate-500"><Tags className="mx-auto mb-3 text-slate-300" size={36}/><b>Nincs aktív törzsadat.</b></div>:items.map((item)=><div key={item.id} className="flex items-center gap-3 p-4 sm:p-5"><div className="min-w-0 flex-1">{editingId===item.id?<input autoFocus value={editingName} onChange={(e)=>setEditingName(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")void saveEdit(item);if(e.key==="Escape")setEditingId(null);}} className="h-11 w-full rounded-xl border border-teal-300 px-3 font-bold outline-none"/>:<><b className="block truncate">{item.name}</b>{kind==="categories"&&<p className="mt-1 text-xs font-semibold text-slate-400">{item.slug}{item.parentId?" · alkategória":" · fő kategória"}</p>}</>}</div>{editingId===item.id?<><button type="button" disabled={saving} onClick={()=>void saveEdit(item)} className="rounded-xl bg-teal-700 p-2.5 text-white"><Save size={17}/></button><button type="button" onClick={()=>setEditingId(null)} className="rounded-xl border border-slate-200 p-2.5"><X size={17}/></button></>:<><button type="button" onClick={()=>{setEditingId(item.id);setEditingName(item.name);}} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black">Szerkesztés</button><button type="button" disabled={saving} onClick={()=>void archiveItem(item)} className="rounded-xl border border-red-200 p-2.5 text-red-600"><Trash2 size={17}/></button></>}</div>)}</div>
        </AruterCard>
        <AruterCard className="h-fit p-5 lg:sticky lg:top-5"><p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">Új törzsadat</p><h2 className="mt-1 text-2xl font-black">{currentTab.label.slice(0,-1)}</h2><form onSubmit={createItem} className="mt-5 space-y-4"><label className="block"><span className="text-sm font-black">Megnevezés *</span><input value={newName} onChange={(e)=>setNewName(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-teal-400" placeholder="Új megnevezés"/></label>{kind==="categories"&&<label className="block"><span className="text-sm font-black">Szülőkategória</span><select value={parentId} onChange={(e)=>setParentId(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none"><option value="">Nincs – fő kategória</option>{items.filter((item)=>!item.parentId).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<button disabled={saving||!newName.trim()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-black text-white disabled:bg-slate-300"><Plus size={18}/>{saving?"Mentés...":"Hozzáadás"}</button></form><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">Az archiválás csak akkor engedélyezett, ha a törzsadat nincs aktív termékhez rendelve.</div></AruterCard>
      </div>
    </div>
  </AruterPageShell>;
}
