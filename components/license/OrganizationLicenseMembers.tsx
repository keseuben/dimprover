"use client";

import { useMemo, useState } from "react";
import { Bot, CheckCircle2, Copy, LoaderCircle, Mail, ShieldCheck, UserPlus, Users, XCircle } from "lucide-react";
import MembershipAiPolicyEditor from "@/components/license/MembershipAiPolicyEditor";

type User = { id: string; public_user_code: string; full_name: string; email: string; status: string; email_verified_at: string | null };
type Membership = { id: string; user_id: string; organization_id: string; role_code: string; role_label?: string | null; status: string; is_primary: boolean; joined_at?: string | null; access_ends_at?: string | null };
type LicenseModule = { id: string; license_id: string; module_code: string; enabled: boolean; limits?: Record<string, unknown>; feature_flags?: Record<string, unknown> };
type MembershipModule = { id: string; membership_id: string; module_code: string; enabled: boolean; limits?: Record<string, unknown> };
type Invitation = { id: string; organization_id: string; license_id: string; membership_id: string; invited_user_id: string; email_normalized: string; full_name: string; role_code: string; role_label: string | null; token_hint: string; status: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string };

type Props = {
  adminKey: string;
  licenseId: string;
  organizationId: string;
  organizationName: string;
  maxUsers: number;
  maxDevices: number;
  users: User[];
  memberships: Membership[];
  licenseModules: LicenseModule[];
  membershipModules: MembershipModule[];
  invitations: Invitation[];
  onChanged: () => Promise<void> | void;
};

const roleOptions = [
  { value: "member", label: "Munkatárs" },
  { value: "manager", label: "Vezető / projektvezető" },
  { value: "admin", label: "Szervezeti admin" },
] as const;

const statusLabel: Record<string, string> = {
  invited: "Meghívva",
  active: "Aktív",
  suspended: "Felfüggesztve",
  revoked: "Visszavonva",
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" }) : "–";
}

export default function OrganizationLicenseMembers(props: Props) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("member");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [oneTimeUrl, setOneTimeUrl] = useState("");
  const [aiMembershipId, setAiMembershipId] = useState("");

  const activeLicenseModules = useMemo(
    () => props.licenseModules.filter((item) => item.license_id === props.licenseId && item.enabled).map((item) => item.module_code),
    [props.licenseId, props.licenseModules],
  );
  const organizationMemberships = useMemo(
    () => props.memberships.filter((item) => item.organization_id === props.organizationId && ["invited", "active", "suspended"].includes(item.status)),
    [props.memberships, props.organizationId],
  );
  const usedSeats = organizationMemberships.length;
  const availableSeats = Math.max(0, props.maxUsers - usedSeats);
  const licenseAiModule = useMemo(
    () => props.licenseModules.find((item) => item.license_id === props.licenseId && item.module_code === "AI_ASSISTANT" && item.enabled) || null,
    [props.licenseId, props.licenseModules],
  );
  const aiMembership = organizationMemberships.find((item) => item.id === aiMembershipId) || null;
  const aiUser = aiMembership ? props.users.find((item) => item.id === aiMembership.user_id) : null;
  const aiInvitation = aiMembership ? props.invitations.find((item) => item.membership_id === aiMembership.id && item.license_id === props.licenseId) : null;
  const aiMembershipModule = aiMembership ? props.membershipModules.find((item) => item.membership_id === aiMembership.id && item.module_code === "AI_ASSISTANT") || null : null;

  function toggleModule(code: string) {
    setSelectedModules((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  function startInvite() {
    setSelectedModules(activeLicenseModules);
    setOneTimeUrl("");
    setMessage("");
    setOpen(true);
  }

  async function invite() {
    if (busy || fullName.trim().length < 2 || !email.includes("@")) return;
    setBusy("invite");
    setMessage("");
    setOneTimeUrl("");
    try {
      const role = roleOptions.find((item) => item.value === roleCode) || roleOptions[0];
      const response = await fetch("/api/dimpro-identity/admin/organization-invitations", {
        method: "POST",
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": props.adminKey },
        body: JSON.stringify({
          licenseId: props.licenseId,
          fullName: fullName.trim(),
          email: email.trim(),
          roleCode: role.value,
          roleLabel: role.label,
          moduleCodes: selectedModules,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A meghívás nem hozható létre.");
      setOneTimeUrl(payload.invitationUrl || "");
      setMessage(payload.note || "A meghívás elkészült.");
      setFullName("");
      setEmail("");
      setOpen(false);
      await props.onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A meghívás sikertelen.");
    } finally {
      setBusy("");
    }
  }

  async function revoke(invitationId: string) {
    if (busy) return;
    setBusy(`revoke:${invitationId}`);
    setMessage("");
    try {
      const response = await fetch("/api/dimpro-identity/admin/organization-invitations", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": props.adminKey },
        body: JSON.stringify({ invitationId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A meghívás nem vonható vissza.");
      setMessage("A függő meghívás visszavonva; a felhasználói hely felszabadult.");
      await props.onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A meghívás visszavonása sikertelen.");
    } finally {
      setBusy("");
    }
  }

  async function copyLink() {
    if (!oneTimeUrl) return;
    await navigator.clipboard.writeText(oneTimeUrl);
    setMessage("A meghívólink a vágólapra került.");
  }

  return <section className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-950/15 p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-cyan-200"><Users size={18}/><span className="text-xs font-black uppercase tracking-[.14em]">Szervezeti felhasználók</span></div>
        <h3 className="mt-2 text-xl font-black">{props.organizationName}</h3>
        <p className="mt-1 text-sm text-slate-300">Felhasználói helyek: <strong className="text-white">{usedSeats}/{props.maxUsers}</strong> · Szabad: <strong className="text-emerald-300">{availableSeats}</strong> · Eszközkeret: <strong className="text-white">max. {props.maxDevices}</strong></p>
        <p className="mt-1 text-xs leading-5 text-slate-400">A felhasználói keret és a gép/eszközkeret külön limit. A gépkötés csak az azt igénylő desktop alkalmazásoknál érvényesül.</p>
      </div>
      <button type="button" onClick={startInvite} disabled={availableSeats < 1 || Boolean(busy)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"><UserPlus size={16}/> Felhasználó meghívása</button>
    </div>

    {message ? <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-xs font-bold text-cyan-100">{message}</div> : null}
    {oneTimeUrl ? <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4"><div className="flex items-center gap-2 text-amber-200"><Mail size={16}/><strong className="text-xs uppercase tracking-[.12em]">Egyszer megjelenő meghívólink</strong></div><p className="mt-2 break-all font-mono text-xs text-amber-50">{oneTimeUrl}</p><button type="button" onClick={()=>void copyLink()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950"><Copy size={14}/> Link másolása</button></div> : null}

    {open ? <div className="mt-5 rounded-2xl border border-emerald-300/25 bg-slate-950/80 p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-300">Név<input value={fullName} onChange={(e)=>setFullName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" placeholder="Kiss Péter"/></label>
        <label className="text-xs font-bold text-slate-300">E-mail<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" placeholder="peter@ceg.hu"/></label>
        <label className="text-xs font-bold text-slate-300">Szerepkör<select value={roleCode} onChange={(e)=>setRoleCode(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400">{roleOptions.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      <div className="mt-4"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-400">Engedélyezett szolgáltatások</p><div className="mt-2 flex flex-wrap gap-2">{activeLicenseModules.map((code)=><label key={code} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${selectedModules.includes(code)?"border-emerald-300 bg-emerald-300/10 text-emerald-100":"border-slate-700 text-slate-400"}`}><input type="checkbox" checked={selectedModules.includes(code)} onChange={()=>toggleModule(code)}/>{code}</label>)}</div></div>
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={()=>void invite()} disabled={Boolean(busy)||fullName.trim().length<2||!email.includes("@")||selectedModules.length===0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{busy==="invite"?<LoaderCircle size={16} className="animate-spin"/>:<UserPlus size={16}/>} Meghívó küldése</button><button type="button" onClick={()=>setOpen(false)} disabled={Boolean(busy)} className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-bold text-slate-200">Mégse</button></div>
    </div> : null}

    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">Felhasználó</th><th className="p-2">Szerepkör</th><th className="p-2">Státusz</th><th className="p-2">Szolgáltatások</th><th className="p-2">Meghívás</th><th className="p-2">Művelet</th></tr></thead><tbody>{organizationMemberships.length ? organizationMemberships.map((membership)=>{
      const user=props.users.find((item)=>item.id===membership.user_id);
      const invitation=props.invitations.find((item)=>item.membership_id===membership.id && item.license_id===props.licenseId);
      const assigned=props.membershipModules.filter((item)=>item.membership_id===membership.id&&item.enabled).map((item)=>item.module_code);
      return <tr key={membership.id} className="border-t border-slate-800"><td className="p-2"><strong className="block text-white">{user?.full_name||invitation?.full_name||membership.user_id}</strong><span className="text-slate-400">{user?.email||invitation?.email_normalized||"–"}</span></td><td className="p-2 text-slate-200">{membership.role_label||membership.role_code}</td><td className="p-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-black ${membership.status==="active"?"bg-emerald-400/15 text-emerald-200":membership.status==="invited"?"bg-cyan-400/15 text-cyan-200":"bg-amber-400/15 text-amber-200"}`}>{membership.status==="active"?<CheckCircle2 size={12}/>:<ShieldCheck size={12}/>} {statusLabel[membership.status]||membership.status}</span></td><td className="p-2"><div className="flex max-w-[380px] flex-wrap gap-1">{(assigned.length?assigned:membership.status==="active"?activeLicenseModules:[]).map((code)=><span key={code} className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{code}</span>)}</div></td><td className="p-2 text-slate-400">{invitation ? <><span className="block">{invitation.status}</span><span className="block">Lejár: {formatDate(invitation.expires_at)}</span></> : "–"}</td><td className="p-2"><div className="flex flex-wrap gap-1">{licenseAiModule ? <button type="button" onClick={()=>setAiMembershipId(membership.id)} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/35 px-3 py-2 font-bold text-cyan-100 hover:bg-cyan-400/10"><Bot size={13}/> AI keret</button> : null}{invitation?.status==="pending"?<button type="button" onClick={()=>void revoke(invitation.id)} disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-2 font-bold text-red-200 disabled:opacity-40">{busy===`revoke:${invitation.id}`?<LoaderCircle size={13} className="animate-spin"/>:<XCircle size={13}/>} Visszavonás</button>:null}{!licenseAiModule && invitation?.status!=="pending" ? "–" : null}</div></td></tr>;
    }) : <tr><td colSpan={6} className="p-5 text-center text-slate-500">Még nincs felhasználó a szervezeti licencben.</td></tr>}</tbody></table></div>

    {aiMembership && licenseAiModule ? <MembershipAiPolicyEditor
      adminKey={props.adminKey}
      licenseId={props.licenseId}
      membershipId={aiMembership.id}
      userName={aiUser?.full_name || aiInvitation?.full_name || aiMembership.user_id}
      currentModule={aiMembershipModule}
      licenseFeatureFlags={licenseAiModule.feature_flags || {}}
      onChanged={props.onChanged}
      onClose={() => setAiMembershipId("")}
    /> : null}
  </section>;
}
