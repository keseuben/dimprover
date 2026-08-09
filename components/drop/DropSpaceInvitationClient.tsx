"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, KeyRound, ShieldCheck, Users } from "lucide-react";
import { HoldActionButton } from "@/components/ui/HoldActionButton";

type InvitationPayload = {
  space: {
    publicCode: string;
    name: string;
    description: string;
    status: string;
  };
  membership: {
    displayName: string;
    email: string;
    organizationName: string | null;
    role: string;
    roleLabel: string;
  };
  rolePermissions: string[];
  effectiveAccessEndsAt: string;
  invitationExpiresAt: string;
  guestLicenseRequired: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

export default function DropSpaceInvitationClient({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<InvitationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/drop/spaces/invitations/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "A Drop tér meghívó nem tölthető be.");
        if (!cancelled) setInvitation(payload.invitation as InvitationPayload);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "A Drop tér meghívó nem tölthető be.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const accept = useCallback(async () => {
    setAccepting(true);
    setError("");
    try {
      const response = await fetch(`/api/drop/spaces/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Drop tér meghívásának elfogadása sikertelen.");
      const redirectPath = payload.accepted?.redirectPath;
      if (typeof redirectPath !== "string" || !redirectPath.startsWith("/space/")) {
        throw new Error("A Drop tér átirányítása nem érkezett meg.");
      }
      window.location.assign(redirectPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A Drop tér meghívásának elfogadása sikertelen.");
      throw reason;
    } finally {
      setAccepting(false);
    }
  }, [token]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.16),transparent_34%),linear-gradient(180deg,#f8fffe_0%,#eef8f7_100%)] px-4 py-8 sm:px-6 sm:py-14">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-teal-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,118,110,0.13)] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-teal-200 bg-teal-50 text-teal-800"><KeyRound size={23} /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">DIMPRO Drop meghívó</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">Hozzáférési tér meghívás</h1>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-600">Meghívó ellenőrzése…</div>
        ) : error && !invitation ? (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold leading-6 text-rose-900">{error}</div>
        ) : invitation ? (
          <>
            <div className="mt-8 rounded-[1.5rem] border border-teal-200 bg-teal-50/70 p-5 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">{invitation.space.publicCode}</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">{invitation.space.name}</h2>
              {invitation.space.description ? <p className="mt-3 text-sm leading-7 text-slate-700">{invitation.space.description}</p> : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCard icon={Users} label="Meghívott" value={invitation.membership.displayName} note={invitation.membership.email} />
              <InfoCard icon={ShieldCheck} label="Szerepkör" value={invitation.membership.roleLabel} note={invitation.membership.organizationName || "Külső meghívott"} />
              <InfoCard icon={CalendarClock} label="Hozzáférés vége" value={formatDate(invitation.effectiveAccessEndsAt)} note="A fizető licenc minden esetben felső korlát." />
              <InfoCard icon={CheckCircle2} label="Külön licenc" value="Nem szükséges" note="A térgazda licenckeretében használható." />
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-600">Engedélyezett műveletek</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {invitation.rolePermissions.map((permission) => (
                  <span key={permission} className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-black text-teal-900">{permission}</span>
                ))}
              </div>
            </div>

            {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{error}</div> : null}

            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p>A meghívó egyszer használható. Elfogadás után biztonságos vendégmunkamenet indul.</p>
                <p className="mt-1 text-xs">Meghívólink lejárata: {formatDate(invitation.invitationExpiresAt)}</p>
              </div>
              <HoldActionButton
                tone="success"
                durationMs={2000}
                disabled={accepting}
                icon={<CheckCircle2 size={18} />}
                label="Meghívás elfogadása · 2 mp"
                holdingLabel="Elfogadáshoz"
                runningLabel="Elfogadás…"
                completedLabel="Elfogadva"
                onComplete={accept}
              />
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function InfoCard({ icon: Icon, label, value, note }: { icon: typeof Users; label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-teal-700"><Icon size={17} /><span className="text-[10px] font-black uppercase tracking-[0.12em]">{label}</span></div>
      <strong className="mt-2 block text-sm text-slate-950">{value}</strong>
      <span className="mt-1 block break-all text-xs leading-5 text-slate-500">{note}</span>
    </article>
  );
}
