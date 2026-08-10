"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, CheckCircle2, LoaderCircle, Mail, ShieldCheck, UserCheck } from "lucide-react";

type Preview = {
  id: string;
  fullName: string;
  email: string;
  roleCode: string;
  roleLabel: string | null;
  status: string;
  expiresAt: string;
  organization: { id: string; name: string };
  license: { id: string; publicCode: string; productCode: string; planCode: string | null };
  moduleCodes: string[];
};

export default function OrganizationInvitationClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [state, setState] = useState<"loading"|"ready"|"accepting"|"accepted"|"error">("loading");
  const [message, setMessage] = useState("Meghívás ellenőrzése…");
  const [loginUrl, setLoginUrl] = useState("/login");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) { setState("error"); setMessage("A meghívólinkből hiányzik a biztonsági token."); return; }
      try {
        const response = await fetch(`/api/dimpro-identity/invitations?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "A meghívás nem érvényes.");
        if (!cancelled) { setPreview(payload.invitation); setState("ready"); setMessage("A meghívás érvényes. Ellenőrizze az adatokat, majd fogadja el."); }
      } catch (error) {
        if (!cancelled) { setState("error"); setMessage(error instanceof Error ? error.message : "A meghívás nem tölthető be."); }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  async function accept() {
    if (!token || state !== "ready") return;
    setState("accepting");
    setMessage("Tagság aktiválása…");
    try {
      const response = await fetch("/api/dimpro-identity/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A meghívás elfogadása sikertelen.");
      setLoginUrl(payload.accepted?.loginUrl || "/login");
      setState("accepted");
      setMessage("A HAGE-INVEST / DIMPRO tagság aktív. Most már a meghívott e-mail-címmel kérhető egyszer használatos belépési kód.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "A meghívás elfogadása sikertelen.");
    }
  }

  return <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-4 py-10 text-slate-950 sm:px-6">
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
        <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#062a26] text-emerald-300"><ShieldCheck size={24}/></div><div><p className="text-xs font-black uppercase tracking-[.18em] text-teal-700">DIMPRO központi meghívó</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Szervezeti hozzáférés</h1></div></div>
        <div className={`mt-6 rounded-2xl border p-4 text-sm font-bold ${state==="error"?"border-red-200 bg-red-50 text-red-800":state==="accepted"?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-cyan-200 bg-cyan-50 text-cyan-900"}`}>{state==="loading"||state==="accepting"?<LoaderCircle className="mr-2 inline animate-spin" size={16}/>:state==="accepted"?<CheckCircle2 className="mr-2 inline" size={16}/>:null}{message}</div>

        {preview ? <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info icon={<Building2 size={18}/>} label="Szervezet" value={preview.organization.name}/>
            <Info icon={<Mail size={18}/>} label="Meghívott" value={preview.fullName} note={preview.email}/>
            <Info icon={<UserCheck size={18}/>} label="Szerepkör" value={preview.roleLabel||preview.roleCode}/>
            <Info icon={<ShieldCheck size={18}/>} label="Licenc" value={preview.license.publicCode} note={`${preview.license.productCode}${preview.license.planCode?` · ${preview.license.planCode}`:""}`}/>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Engedélyezett szolgáltatások</p><div className="mt-3 flex flex-wrap gap-2">{preview.moduleCodes.map((code)=><span key={code} className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-bold text-teal-800">{code}</span>)}</div><p className="mt-3 text-xs text-slate-500">Meghívó lejárata: {new Date(preview.expiresAt).toLocaleString("hu-HU")}</p></div>
        </div> : null}

        {state==="ready" ? <button type="button" onClick={()=>void accept()} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"><UserCheck size={18}/> Meghívás elfogadása</button> : null}
        {state==="accepted" ? <Link href={loginUrl} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#062a26] px-5 text-sm font-black text-white">Belépés a DIMPRO rendszerbe</Link> : null}
        <p className="mt-6 text-xs leading-5 text-slate-500">A meghívó egyszer használható. Elfogadás után a DIMPRO belépéshez az e-mail-címre küldött egyszer használatos kódot kell használni. Desktop alkalmazás esetén az eszközaktiválás külön történhet.</p>
      </div>
    </div>
  </main>;
}

function Info({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-teal-700">{icon}<span className="text-[10px] font-black uppercase tracking-[.12em]">{label}</span></div><strong className="mt-2 block text-sm">{value}</strong>{note?<span className="mt-1 block text-xs text-slate-500">{note}</span>:null}</div>;
}
