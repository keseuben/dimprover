"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Camera, ImagePlus, Loader2, Upload } from "lucide-react";
import { uploadCommerceTargetImage, type CommerceMediaUploadTargetType } from "./commerceMediaPreparation";

type MediaItem={assetId:string;thumbnailUrl:string;contentUrl:string;overlays:Array<{id:string;type:string;active:boolean}>};
type ApiResult<T>={ok:boolean;data?:T;error?:string};
type Props={targetType:Extract<CommerceMediaUploadTargetType,"GOODS_RECEIPT"|"GOODS_RECEIPT_ITEM">;targetId:string;compact?:boolean;onError?:(message:string)=>void};

export function CommerceReceivingMediaAttachments({targetType,targetId,compact=false,onError}:Props){
  const [items,setItems]=useState<MediaItem[]>([]),[loading,setLoading]=useState(true),[uploading,setUploading]=useState(false);
  const load=useCallback(async()=>{setLoading(true);try{const response=await fetch(`/api/v1/commerce/media/links?linkType=${targetType}&entityId=${targetId}`,{cache:"no-store"});const result=await response.json() as ApiResult<MediaItem[]>;if(!response.ok||!result.ok||!result.data)throw new Error(result.error||"A képek nem tölthetők be.");setItems(result.data);}catch(cause){onError?.(cause instanceof Error?cause.message:"A képek nem tölthetők be.");}finally{setLoading(false);}},[targetId,targetType,onError]);
  useEffect(()=>{void load();},[load]);
  async function upload(files:File[]){const images=files.filter(file=>file.type.startsWith("image/")||/\.(heic|heif)$/i.test(file.name));if(!images.length||uploading)return;setUploading(true);try{for(const file of images)await uploadCommerceTargetImage(targetType,targetId,file);await load();}catch(cause){onError?.(cause instanceof Error?cause.message:"A képfeltöltés sikertelen.");}finally{setUploading(false);}}
  return <div className={compact?"mt-2":"mt-4 rounded-2xl border border-slate-200 p-4"}>
    {!compact&&<div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Camera size={17} className="text-teal-700"/><b>Bizonylat fotók</b></div><span className="text-xs font-black text-slate-400">{loading?"…":`${items.length} kép`}</span></div>}
    {items.length>0&&<div className={`flex gap-2 overflow-x-auto ${compact?"pb-1":"mt-3 pb-1"}`}>{items.map(item=><button key={item.assetId} type="button" onClick={()=>window.open(item.contentUrl,"_blank","noopener,noreferrer")} className={`${compact?"h-10 w-10":"h-16 w-16"} relative shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100`} title="Kép megnyitása"><Image src={item.thumbnailUrl} alt="" fill sizes={compact?"40px":"64px"} unoptimized className="object-cover"/>{item.overlays.some(x=>x.active)&&<span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/80 px-1 text-[8px] font-black text-white">jelölt</span>}</button>)}</div>}
    {!items.length&&!loading&&!compact&&<div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center"><ImagePlus className="mx-auto text-slate-300" size={24}/><p className="mt-1 text-xs font-semibold text-slate-500">Még nincs csatolt fotó.</p></div>}
    <label className={`${compact?"mt-1 h-9 px-2 text-xs":"mt-3 h-10 px-3 text-sm"} flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 font-black text-teal-700 ${uploading?"pointer-events-none opacity-60":""}`}>{uploading?<Loader2 size={14} className="animate-spin"/>:<Upload size={14}/>} {compact?"Fotó":items.length?"További fotók":"Fotók csatolása"}<input type="file" multiple accept="image/*,.heic,.heif" className="hidden" disabled={uploading} onChange={e=>{const files=Array.from(e.target.files||[]);e.currentTarget.value="";void upload(files);}}/></label>
  </div>;
}
