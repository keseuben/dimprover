"use client";

import Link from "next/link";
import DropSpacePackagePanel from "@/components/drop/DropSpacePackagePanel";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CalendarClock,
  FileUp,
  FolderKanban,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  Users,
} from "lucide-react";

type SpaceSession = {
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
  permissions: string[];
  effectiveAccessEndsAt: string;
  runtimeMode: "writable" | "read_only" | "blocked";
  projects: Array<{
    projectId: string;
    projectName: string;
    syncToDock: boolean;
    archiveToDrive: boolean;
  }>;
  packageCount: number;
  fileUploadEnabled: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

export default function DropSpaceGuestWorkspace({ spaceCode }: { spaceCode: string }) {
  const [session, setSession] = useState<SpaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/drop/spaces/session", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Drop tér munkamenet nem tölthető be.");
      const nextSession = payload.session as SpaceSession;
      if (nextSession.space.publicCode !== spaceCode) {
        throw new Error("A munkamenet egy másik Drop térhez tartozik.");
      }
      setSession(nextSession);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A Drop tér munkamenet nem tölthető be.");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [spaceCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const permissionSet = useMemo(() => new Set(session?.permissions || []), [session?.permissions]);

  const signOut = useCallback(async () => {
    await fetch("/api/drop/spaces/session", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/");
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.14),transparent_34%),linear-gradient(180deg,#f8fffe_0%,#eef8f7_100%)] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        {loading ? (
          <div className="rounded-[2rem] border border-teal-200 bg-white px-6 py-16 text-center text-sm font-bold text-slate-600 shadow-sm">Drop tér munkamenet betöltése…</div>
        ) : error || !session ? (
          <div className="rounded-[2rem] border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-700">Nincs aktív hozzáférés</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">A Drop tér nem nyitható meg</h1>
            <p className="mt-4 text-sm font-semibold leading-7 text-rose-900">{error || "A munkamenet hiányzik vagy lejárt."}</p>
            <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Vissza a DIMPRO Drophoz</Link>
          </div>
        ) : (
          <>
            <header className="rounded-[2rem] border border-teal-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,118,110,0.09)] sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">{session.space.publicCode} · DIMPRO Drop tér</p>
                  <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">{session.space.name}</h1>
                  {session.space.description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{session.space.description}</p> : null}
                </div>
                <button type="button" onClick={() => void signOut()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700"><LogOut size={16} /> Kilépés</button>
              </div>
            </header>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={Users} label="Bejelentkezett tag" value={session.membership.displayName} note={session.membership.roleLabel} />
              <SummaryCard icon={CalendarClock} label="Hozzáférés vége" value={formatDate(session.effectiveAccessEndsAt)} note={session.runtimeMode === "writable" ? "A tér írható" : "Csak olvasható állapot"} />
              <SummaryCard icon={Boxes} label="Tér csomagjai" value={`${session.packageCount} db`} note={permissionSet.has("package.create") ? "Saját csomag létrehozható" : "Csak megosztott csomagok"} />
              <SummaryCard icon={FolderKanban} label="Kapcsolódó projektek" value={`${session.projects.length} db`} note={session.projects[0]?.projectName || "Nincs projektkapcsolat"} />
            </div>

            <section className="mt-5 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Szerepkör és műveletek</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{session.membership.roleLabel}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">A vendég külön fizetős licenc nélkül, a térgazda licenckeretében használja a számára engedélyezett funkciókat.</p>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <CapabilityCard icon={Boxes} enabled={permissionSet.has("package.create")} title="Saját csomag készítése" note={permissionSet.has("package.create") ? "Aktív mini csomagkártyás munkatér és e-mailes megosztás." : "Ehhez közreműködői vagy admin szerepkör szükséges."} />
                <CapabilityCard icon={FileUp} enabled={permissionSet.has("file.upload") && session.fileUploadEnabled} title="Fájlfeltöltés" note={session.fileUploadEnabled ? "Privát S3-feltöltés, folytatható átvitel és automatikus vírusellenőrzés aktív." : "A tárhelyfeltöltés jelenleg nem áll készen."} />
                <CapabilityCard icon={MessageSquareText} enabled={permissionSet.has("comment.write")} title="Megjegyzések" note={permissionSet.has("comment.write") ? "Csomag- és fájlszintű megjegyzések aktívak." : "A szerepkör nem enged megjegyzést."} />
                <CapabilityCard icon={ShieldCheck} enabled={permissionSet.has("file.download")} title="Letöltés" note={permissionSet.has("file.download") ? "A tisztának minősített fájlok biztonságos linken letölthetők." : "A szerepkör nem enged letöltést."} />
              </div>
            </section>

            <DropSpacePackagePanel />

            <section className="mt-5 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Projektkapcsolatok</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">Door / Dock / Drive előkészítés</h2>
              {session.projects.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {session.projects.map((project) => (
                    <article key={project.projectId} className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
                      <strong className="text-sm text-slate-950">{project.projectName}</strong>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{project.syncToDock ? "Megjelenik a Dock projektmunkatérben." : "Dock-szinkron kikapcsolva."} {project.archiveToDrive ? "Drive-archiválás előkészítve." : "Drive-archiválás nincs bekapcsolva."}</p>
                    </article>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm font-semibold text-slate-500">Ehhez a térhez még nincs projekt rendelve.</p>}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value, note }: { icon: typeof Users; label: string; value: string; note: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-teal-700"><Icon size={17} /><span className="text-[10px] font-black uppercase tracking-[0.12em]">{label}</span></div><strong className="mt-3 block text-lg text-slate-950">{value}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{note}</span></article>;
}

function CapabilityCard({ icon: Icon, enabled, title, note }: { icon: typeof Boxes; enabled: boolean; title: string; note: string }) {
  return <article className={`rounded-2xl border p-4 ${enabled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div className={`flex items-center gap-2 ${enabled ? "text-emerald-800" : "text-slate-500"}`}><Icon size={17} /><strong className="text-sm">{title}</strong></div><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{note}</p></article>;
}
