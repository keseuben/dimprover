"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Mail, RefreshCw, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { HoldActionButton } from "@/components/ui/HoldActionButton";

type MemberRole = "owner" | "space_admin" | "contributor" | "uploader" | "viewer";
type MemberStatus = "invited" | "active" | "suspended" | "revoked" | "expired";

type Member = {
  id: string;
  spaceId: string;
  email: string;
  displayName: string;
  organizationName: string | null;
  role: MemberRole;
  status: MemberStatus;
  isGuest: boolean;
  invitedAt: string;
  acceptedAt: string | null;
  accessEndsAt: string | null;
  effectiveAccessEndsAt: string;
  lastOpenedAt: string | null;
  permissions: string[];
};

type InvitationResult = {
  membership: Member;
  invitationLink: string;
  invitationExpiresAt: string;
  rolePermissions: string[];
  guestLicenseRequired: boolean;
};

type EmailDelivery = {
  sent: boolean;
  messageId: string | null;
  profileId: string;
  error: string | null;
};

type FormState = {
  displayName: string;
  email: string;
  organizationName: string;
  role: Exclude<MemberRole, "owner">;
  accessEndsAt: string;
};

const initialForm: FormState = {
  displayName: "",
  email: "",
  organizationName: "",
  role: "contributor",
  accessEndsAt: "",
};

const roleLabels: Record<MemberRole, string> = {
  owner: "Térgazda",
  space_admin: "Téradminisztrátor",
  contributor: "Közreműködő",
  uploader: "Feltöltő",
  viewer: "Megtekintő",
};

const statusLabels: Record<MemberStatus, string> = {
  invited: "Meghívva",
  active: "Aktív",
  suspended: "Felfüggesztve",
  revoked: "Visszavonva",
  expired: "Lejárt",
};

function formatDate(value: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

function statusClasses(status: MemberStatus) {
  if (status === "active") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "invited") return "border-cyan-300 bg-cyan-50 text-cyan-900";
  if (status === "suspended") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-rose-300 bg-rose-50 text-rose-900";
}

export default function DropSpaceMembersPanel({
  adminKey,
  space,
  onClose,
  onChanged,
}: {
  adminKey: string;
  space: { id: string; publicCode: string; name: string; effectiveEndsAt: string };
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const messageRef = useRef<HTMLDivElement | null>(null);
  const [invitation, setInvitation] = useState<InvitationResult | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<EmailDelivery | null>(null);
  const [copied, setCopied] = useState(false);

  const headers = useMemo(() => ({
    "content-type": "application/json",
    "x-dimpro-license-admin-key": adminKey,
  }), [adminKey]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/drop/admin/spaces/${encodeURIComponent(space.id)}/members`, {
        headers: { "x-dimpro-license-admin-key": adminKey },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Drop tér tagjai nem tölthetők be.");
      setMembers(Array.isArray(payload.members) ? payload.members : []);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "A Drop tér tagjai nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [adminKey, space.id]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const invite = useCallback(async () => {
    setSubmitting(true);
    setMessage("");
    setMessageTone("info");
    setInvitation(null);
    setEmailDelivery(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/drop/admin/spaces/${encodeURIComponent(space.id)}/members`, {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        const code = typeof payload.code === "string" ? payload.code : "DROP_SPACE_INVITATION_FAILED";
        const detail = payload.error || "A Drop tér meghívás létrehozása sikertelen.";
        throw new Error(`${detail} (${code})`);
      }
      setInvitation(payload.invitation as InvitationResult);
      setEmailDelivery(payload.emailDelivery as EmailDelivery);
      setMessageTone(payload.emailDelivery?.sent ? "success" : "info");
      setMessage(payload.note || "A Drop tér meghívó létrejött.");
      setForm(initialForm);
      setFormOpen(false);
      await Promise.all([loadMembers(), onChanged()]);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "A Drop tér meghívás létrehozása sikertelen.");
      window.requestAnimationFrame(() => messageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [form, headers, loadMembers, onChanged, space.id]);

  const copyInvitation = useCallback(async () => {
    if (!invitation?.invitationLink) return;
    await navigator.clipboard.writeText(invitation.invitationLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [invitation]);

  const maxAccessDate = space.effectiveEndsAt.slice(0, 10);
  const accessDateExceedsSpace = Boolean(form.accessEndsAt && form.accessEndsAt > maxAccessDate);
  const formattedMaxAccessDate = formatDate(space.effectiveEndsAt);
  const valid = Boolean(
    form.displayName.trim().length >= 2
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
      && !accessDateExceedsSpace,
  );

  return (
    <section className="mt-5 rounded-[1.5rem] border border-cyan-200 bg-cyan-50/50 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">{space.publicCode} · tagságok</p>
          <h4 className="mt-2 text-xl font-black text-slate-950">{space.name}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-600">A meghívottak külön fizetős licenc nélkül, a térgazda licenckeretében dolgozhatnak.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadMembers()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Frissítés</button>
          <button type="button" onClick={() => setFormOpen((old) => !old)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-800 px-3 py-2 text-xs font-black text-white"><UserPlus size={14} /> Új meghívás</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white p-2 text-slate-600"><X size={16} /></button>
        </div>
      </div>

      {message ? (
        <div
          ref={messageRef}
          role={messageTone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
            messageTone === "error"
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : messageTone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-cyan-200 bg-white text-cyan-950"
          }`}
        >
          {message}
        </div>
      ) : null}

      {invitation ? (
        <div className={`mt-4 rounded-2xl border p-4 ${emailDelivery?.sent ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          <div className="flex items-center gap-2"><Mail size={17} /><strong className="text-sm text-slate-950">Egyszer megjelenő meghívólink</strong></div>
          <p className="mt-2 break-all rounded-xl border border-white bg-white/80 p-3 font-mono text-xs text-slate-700">{invitation.invitationLink}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void copyInvitation()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white">{copied ? <Check size={15} /> : <Clipboard size={15} />} {copied ? "Másolva" : "Meghívólink másolása"}</button>
            <span className="text-xs font-bold text-slate-700">{emailDelivery?.sent ? "E-mail elküldve" : `E-mail hiba: ${emailDelivery?.error || "ismeretlen hiba"}`}</span>
            <span className="text-xs font-bold text-slate-500">Link lejárata: {formatDate(invitation.invitationExpiresAt)}</span>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="mt-4 rounded-2xl border border-cyan-200 bg-white p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MemberField label="Meghívott neve"><input value={form.displayName} onChange={(event) => setForm((old) => ({ ...old, displayName: event.target.value }))} className={inputClass} /></MemberField>
            <MemberField label="E-mail-cím"><input type="email" value={form.email} onChange={(event) => setForm((old) => ({ ...old, email: event.target.value }))} className={inputClass} /></MemberField>
            <MemberField label="Szervezet"><input value={form.organizationName} onChange={(event) => setForm((old) => ({ ...old, organizationName: event.target.value }))} className={inputClass} placeholder="Opcionális" /></MemberField>
            <MemberField label="Szerepkör"><select value={form.role} onChange={(event) => setForm((old) => ({ ...old, role: event.target.value as FormState["role"] }))} className={inputClass}><option value="space_admin">Téradminisztrátor</option><option value="contributor">Közreműködő – saját csomag</option><option value="uploader">Feltöltő</option><option value="viewer">Megtekintő</option></select></MemberField>
            <MemberField label="Tagság lejárata">
              <input
                type="date"
                max={maxAccessDate}
                value={form.accessEndsAt}
                aria-invalid={accessDateExceedsSpace}
                onChange={(event) => setForm((old) => ({ ...old, accessEndsAt: event.target.value }))}
                className={`${inputClass} ${accessDateExceedsSpace ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100" : ""}`}
              />
              <span className={`mt-1 block text-[11px] font-semibold ${accessDateExceedsSpace ? "text-rose-700" : "text-slate-500"}`}>
                {accessDateExceedsSpace
                  ? `A kiválasztott dátum túl késői. Legkésőbb: ${formattedMaxAccessDate}.`
                  : `Üresen hagyva a tér lejáratáig érvényes. Legkésőbb: ${formattedMaxAccessDate}.`}
              </span>
            </MemberField>
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <span>A meghívás létrehozza vagy újrakiadja a tagságot, és a korábbi, még el nem fogadott meghívólinket érvényteleníti.</span>
            <HoldActionButton
              tone="warning"
              durationMs={2000}
              disabled={!valid || submitting}
              icon={<ShieldCheck size={16} />}
              label="Meghívó küldése · 2 mp"
              holdingLabel="Küldéshez"
              runningLabel="Meghívás…"
              completedLabel="Meghívó elkészült"
              onComplete={invite}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {members.map((member) => (
          <article key={member.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-sm text-slate-950">{member.displayName}</strong>
                <span className="mt-1 block break-all text-xs font-semibold text-slate-500">{member.email}</span>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusClasses(member.status)}`}>{statusLabels[member.status]}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-900">{roleLabels[member.role]}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-700">{member.isGuest ? "Külső vendég" : "Belső tag"}</span>
            </div>
            <div className="mt-3 grid gap-1 text-xs font-semibold leading-5 text-slate-600">
              <span>Hozzáférés vége: {formatDate(member.effectiveAccessEndsAt)}</span>
              <span>Meghívva: {formatDate(member.invitedAt)}</span>
              <span>Elfogadva: {formatDate(member.acceptedAt)}</span>
            </div>
          </article>
        ))}
      </div>
      {!members.length && !loading ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm font-bold text-slate-500"><Users className="mx-auto mb-3 text-slate-300" size={30} />Nincs megjeleníthető tagság.</div> : null}
    </section>
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100";

function MemberField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.1em] text-slate-600">{label}</span>{children}</label>;
}
