import type { Metadata } from "next";
import DropPublicTransferClient from "@/components/drop/DropPublicTransferClient";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DIMPRO Send – biztonságos fájlküldés",description:"250 MB-os DIMPRO fájlküldés üzenettel, megjegyzésekkel és opcionális letöltési kóddal."};
export default function Page(){return <DropPublicTransferClient mode="send"/>}
