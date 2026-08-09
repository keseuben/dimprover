import type { Metadata } from "next";
import DropPublicTransferClient from "@/components/drop/DropPublicTransferClient";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DIMPRO Beküldőkapu",description:"Fájlbeküldés előre meghatározott személynek, projekthez vagy szervezethez."};
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params;return <DropPublicTransferClient mode="submission_gate" slug={slug}/>}
