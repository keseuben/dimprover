"use client";

import { AlertTriangle, CalendarCheck, CheckCircle2, Loader2, RefreshCw, Save, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type GraphConfig = { configured: boolean; tenantIdConfigured: boolean; clientIdConfigured: boolean; clientSecretConfigured: boolean };

type Props = {
  meetingId: string;
  accessToken: string;
  workspace: MeetingWorkspace;
  locked: boolean;
  refreshWorkspace: () => Promise<void>;
  setStatus: (message: string) => void;
};

const STATUS_LABEL: Record<MeetingWorkspace["teamsAttendance"]["status"], string> = {
  not_configured: "Nincs összekapcsolva",
  ready: "Kapcsolat mentve",
  syncing: "Szinkronizálás folyamatban",
  available: "Teams-adatok beolvasva",
  not_found: "Még nincs elérhető adat",
  permission_required: "Microsoft jogosultság szükséges",
  error: "Szinkronizálási hiba",
};

export default function MeetingTeamsAttendancePanel({ meetingId, accessToken, workspace, locked, refreshWorkspace, setStatus }: Props) {
  const [graphConfig, setGraphConfig] = useState<GraphConfig | null>(null);
  const [organizerUserId, setOrganizerUserId] = useState(workspace.teamsTranscript.organizerUserId || "");
  const [graphOnlineMeetingId, setGraphOnlineMeetingId] = useState(workspace.teamsTranscript.graphOnlineMeetingId || "");
  const [graphCalendarEventId, setGraphCalendarEventId] = useState(workspace.teamsAttendance.graphCalendarEventId || "");
  const [working, setWorking] = useState<"" | "configure" | "import_invited" | "import_attendance">("");

  useEffect(() => {
    setOrganizerUserId(workspace.teamsTranscript.organizerUserId || "");
    setGraphOnlineMeetingId(workspace.teamsTranscript.graphOnlineMeetingId || "");
    setGraphCalendarEventId(workspace.teamsAttendance.graphCalendarEventId || "");
  }, [workspace.teamsAttendance.graphCalendarEventId, workspace.teamsTranscript.graphOnlineMeetingId, workspace.teamsTranscript.organizerUserId]);

  useEffect(() => {
    const query = new URLSearchParams({ meetingId });
    if (accessToken) query.set("accessToken", accessToken);
    fetch(`/api/meeting-assistant/attendance?${query.toString()}`, { cache: "no-store" })
      .then((response) => readJsonResponse<{ config?: GraphConfig }>(response, "A Teams jelenléti Graph-állapot nem tölthető be."))
      .then((data) => setGraphConfig(data.config || null))
      .catch(() => setGraphConfig(null));
  }, [accessToken, meetingId]);

  async function run(operation: "configure" | "import_invited" | "import_attendance") {
    setWorking(operation);
    try {
      const response = await fetch("/api/meeting-assistant/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, accessToken, operation, organizerUserId, graphOnlineMeetingId, graphCalendarEventId }),
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: string; importedNow?: number }>(response, "A Teams jelenléti művelet sikertelen.");
      if (!response.ok || !data.ok) throw new Error(data.error || "A Teams jelenléti művelet sikertelen.");
      await refreshWorkspace();
      setStatus(operation === "configure" ? "A Teams meghívott- és jelenléti kapcsolat adatai mentve." : operation === "import_invited" ? `${data.importedNow || 0} Teams-meghívott beolvasva.` : `${data.importedNow || 0} tényleges Teams-résztvevő jelenléte frissítve.`);
    } catch (error) {
      await refreshWorkspace().catch(() => undefined);
      setStatus(error instanceof Error ? error.message : "A Teams jelenléti művelet sikertelen.");
    } finally {
      setWorking("");
    }
  }

  const integration = workspace.teamsAttendance;
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/50">
      <div className="flex items-start gap-2 border-b border-indigo-200 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"><UsersRound size={15} /></span>
        <div className="min-w-0 flex-1"><div className="text-[11px] font-black text-slate-900">Microsoft Teams meghívottak és tényleges jelenlét</div><div className="mt-0.5 text-[9px] leading-4 text-slate-600">Értekezlet előtt a meghívottak, befejezés után a jelenléti jelentés tölthető be.</div></div>
        <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${integration.status === "available" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : integration.status === "error" || integration.status === "permission_required" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-indigo-200 bg-white text-indigo-700"}`}>{STATUS_LABEL[integration.status]}</span>
      </div>
      <div className="space-y-3 p-3">
        {!graphConfig?.configured && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[9px] leading-4 text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>A Microsoft Graph alkalmazáskapcsolat még nincs teljesen beállítva. Az űrlap és a kézi jelenléti kezelés használható, az automatikus import a Graph-jogosultságok után indul.</span></div>}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">Szervező Entra felhasználóazonosító<input value={organizerUserId} onChange={(event) => setOrganizerUserId(event.target.value)} disabled={locked || Boolean(working)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold normal-case tracking-normal outline-none focus:border-indigo-400 disabled:opacity-50" /></label>
          <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">Graph onlineMeeting ID<input value={graphOnlineMeetingId} onChange={(event) => setGraphOnlineMeetingId(event.target.value)} disabled={locked || Boolean(working)} placeholder="MS... onlineMeeting ID" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold normal-case tracking-normal outline-none focus:border-indigo-400 disabled:opacity-50" /></label>
          <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">Outlook/Teams naptáresemény Graph ID<input value={graphCalendarEventId} onChange={(event) => setGraphCalendarEventId(event.target.value)} disabled={locked || Boolean(working)} placeholder="AAMk... eseményazonosító" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold normal-case tracking-normal outline-none focus:border-indigo-400 disabled:opacity-50" /></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void run("configure")} disabled={locked || Boolean(working)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[9px] font-black text-indigo-800 disabled:opacity-40">{working === "configure" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Kapcsolat mentése</button>
          <button type="button" onClick={() => void run("import_invited")} disabled={locked || Boolean(working) || !organizerUserId.trim() || !graphCalendarEventId.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-[9px] font-black text-white disabled:opacity-40">{working === "import_invited" ? <Loader2 size={12} className="animate-spin" /> : <CalendarCheck size={12} />} Teams meghívottak betöltése</button>
          <button type="button" onClick={() => void run("import_attendance")} disabled={locked || Boolean(working) || !organizerUserId.trim() || !graphOnlineMeetingId.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[9px] font-black text-white disabled:opacity-40">{working === "import_attendance" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Tényleges jelenlét frissítése</button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[9px] leading-4 text-slate-600"><div><b>Meghívottak utolsó importja:</b> {integration.lastInviteSyncAt ? new Date(integration.lastInviteSyncAt).toLocaleString("hu-HU") : "még nem történt"} · {integration.importedInviteCount} fő</div><div><b>Jelenléti jelentés utolsó importja:</b> {integration.lastAttendanceSyncAt ? new Date(integration.lastAttendanceSyncAt).toLocaleString("hu-HU") : "még nem történt"} · {integration.importedAttendanceCount} fő</div></div>
        {integration.lastError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[9px] leading-4 text-rose-800">{integration.lastError}</div>}
        <div className="flex items-start gap-2 text-[9px] leading-4 text-slate-500"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" /><span>A Teamsből származó adatok forrásjelölést kapnak. A szervező kézzel javíthatja a nevet, szervezetet és részvételi státuszt.</span></div>
      </div>
    </div>
  );
}
