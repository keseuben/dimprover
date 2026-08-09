"use client";

import { Building2, Check, Loader2, Plus, Save, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MeetingProjectMember, MeetingProjectProfile, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

const emptyProject = { projectId: "", code: "", name: "", location: "", clientName: "", projectManager: "", defaultMeetingType: "Általános egyeztetés" };
const emptyMember = { id: "", name: "", organization: "", functionTitle: "", email: "", phone: "", external: false, active: true, defaultInvite: true };

type ApiResult = { ok: boolean; profiles?: MeetingProjectProfile[]; profile?: MeetingProjectProfile; error?: string };

export default function MeetingProjectProfileModal({ meetingId, accessToken, workspace, postWorkspace, onClose, setStatus }: { meetingId: string; accessToken: string; workspace: MeetingWorkspace; postWorkspace: (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>; onClose: () => void; setStatus: (value: string) => void }) {
  const [profiles, setProfiles] = useState<MeetingProjectProfile[]>([]);
  const [selectedId, setSelectedId] = useState(workspace.projectId);
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const query = useCallback(() => {
    const params = new URLSearchParams({ meetingId });
    if (accessToken) params.set("accessToken", accessToken);
    return params;
  }, [accessToken, meetingId]);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/meeting-assistant/project-profiles?${query().toString()}`, { cache: "no-store" });
      const data = await readJsonResponse<ApiResult>(response, "A projektadatlapok nem tölthetők be.");
      const rows = data.profiles || [];
      setProfiles(rows);
      const nextId = selectedId || rows[0]?.projectId || "";
      setSelectedId(nextId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Betöltési hiba.");
    } finally {
      setLoading(false);
    }
  }, [query, selectedId]);

  useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  const profile = useMemo(() => profiles.find((item) => item.projectId === selectedId) || null, [profiles, selectedId]);
  useEffect(() => {
    if (!profile) { setProjectForm(emptyProject); setSelectedMembers(new Set()); return; }
    setProjectForm({ projectId: profile.projectId, code: profile.code, name: profile.name, location: profile.location, clientName: profile.clientName, projectManager: profile.projectManager, defaultMeetingType: profile.defaultMeetingType });
    setSelectedMembers(new Set(profile.members.filter((item) => item.defaultInvite && item.active).map((item) => item.id)));
  }, [profile]);

  async function post(action: string, body: Record<string, unknown>) {
    const response = await fetch("/api/meeting-assistant/project-profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingId, accessToken, action, ...body }) });
    const data = await readJsonResponse<ApiResult>(response, "A projektművelet sikertelen.");
    if (!response.ok || !data.profile) throw new Error(data.error || "A projektművelet sikertelen.");
    setProfiles((current) => [...current.filter((item) => item.projectId !== data.profile?.projectId), data.profile!].sort((a, b) => a.name.localeCompare(b.name, "hu")));
    setSelectedId(data.profile.projectId);
    return data.profile;
  }

  async function saveProject() {
    if (!projectForm.name.trim()) { setError("A projekt neve kötelező."); return; }
    setSaving(true);
    try {
      await post("upsert_project", { project: projectForm });
      setStatus("A projektadatlap mentve.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A projekt mentése sikertelen."); }
    finally { setSaving(false); }
  }

  async function saveMember() {
    if (!profile || !memberForm.name.trim()) { setError("Válassz projektet, és add meg a tag nevét."); return; }
    setSaving(true);
    try {
      const updated = await post("upsert_member", { projectId: profile.projectId, member: memberForm });
      const saved = updated.members.find((item) => item.email && item.email === memberForm.email) || updated.members.at(-1);
      if (saved?.defaultInvite) setSelectedMembers((current) => new Set([...current, saved.id]));
      setMemberForm(emptyMember);
      setStatus("A projekttag mentve.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A projekttag mentése sikertelen."); }
    finally { setSaving(false); }
  }

  async function removeMember(member: MeetingProjectMember) {
    if (!profile || !window.confirm(`Törlöd a projekt tagjai közül: ${member.name}?`)) return;
    try { await post("remove_member", { projectId: profile.projectId, memberId: member.id }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "A törlés sikertelen."); }
  }

  async function importMembers() {
    if (!profile) return;
    setSaving(true);
    try {
      await postWorkspace("import_project_members", { projectId: profile.projectId, memberIds: [...selectedMembers] });
      setStatus(`${selectedMembers.size} projekttag betöltve a jelenléti listába.`);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A tagok betöltése sikertelen."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[14000] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm">
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white"><Building2 size={18} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-black">Projektadatlap és állandó résztvevők</h2><p className="text-[10px] text-slate-500">A projekt névsora újra felhasználható minden értekezleten.</p></div><button type="button" onClick={onClose} className="rounded-md border p-2"><X size={16} /></button></header>
        {error && <div className="bg-rose-50 px-4 py-2 text-[10px] font-semibold text-rose-800">{error}</div>}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_1fr]">
          <aside className="min-h-0 border-r bg-slate-50 p-3"><button type="button" onClick={() => { setSelectedId(""); setProjectForm(emptyProject); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white"><Plus size={13} /> Új projektadatlap</button><div className="mt-2 h-[calc(100%-42px)] space-y-1.5 overflow-y-auto">{loading ? <Loader2 className="mx-auto mt-8 animate-spin" /> : profiles.map((item) => <button key={item.projectId} type="button" onClick={() => setSelectedId(item.projectId)} className={`w-full rounded-lg border p-2 text-left ${selectedId === item.projectId ? "border-teal-400 bg-white" : "border-slate-200 bg-white/70"}`}><div className="text-[10px] font-black">{item.code || "-"} · {item.name}</div><div className="text-[8px] text-slate-500">{item.members.length} tag · {item.location || "nincs helyszín"}</div></button>)}</div></aside>
          <main className="min-h-0 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><input value={projectForm.code} onChange={(e) => setProjectForm((c) => ({ ...c, code: e.target.value }))} placeholder="Projektkód" className="rounded-lg border px-3 py-2 text-[10px]" /><input value={projectForm.name} onChange={(e) => setProjectForm((c) => ({ ...c, name: e.target.value }))} placeholder="Projekt neve *" className="rounded-lg border px-3 py-2 text-[10px]" /><input value={projectForm.location} onChange={(e) => setProjectForm((c) => ({ ...c, location: e.target.value }))} placeholder="Helyszín" className="rounded-lg border px-3 py-2 text-[10px]" /><input value={projectForm.clientName} onChange={(e) => setProjectForm((c) => ({ ...c, clientName: e.target.value }))} placeholder="Megrendelő" className="rounded-lg border px-3 py-2 text-[10px]" /><input value={projectForm.projectManager} onChange={(e) => setProjectForm((c) => ({ ...c, projectManager: e.target.value }))} placeholder="Projektvezető" className="rounded-lg border px-3 py-2 text-[10px]" /><input value={projectForm.defaultMeetingType} onChange={(e) => setProjectForm((c) => ({ ...c, defaultMeetingType: e.target.value }))} placeholder="Alapértelmezett egyeztetéstípus" className="rounded-lg border px-3 py-2 text-[10px]" /></div>
            <button type="button" onClick={() => void saveProject()} disabled={saving} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white"><Save size={13} /> Projektadatlap mentése</button>
            {profile && <><div className="mt-5 flex items-center justify-between border-b pb-2"><h3 className="text-[12px] font-black">Projekt tagjai</h3><span className="text-[9px] text-slate-500">{selectedMembers.size} kijelölve</span></div><div className="mt-2 space-y-1.5">{profile.members.map((member) => <div key={member.id} className="flex items-start gap-2 rounded-lg border p-2"><input type="checkbox" checked={selectedMembers.has(member.id)} onChange={(e) => setSelectedMembers((current) => { const next = new Set(current); if (e.target.checked) next.add(member.id); else next.delete(member.id); return next; })} className="mt-1" /><div className="min-w-0 flex-1"><div className="text-[10px] font-black">{member.name}</div><div className="text-[8px] text-slate-500">{[member.organization, member.functionTitle, member.email].filter(Boolean).join(" · ")}</div></div><button type="button" onClick={() => void removeMember(member)} className="p-1 text-rose-600"><Trash2 size={12} /></button></div>)}</div><div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-3"><div className="text-[10px] font-black text-teal-900">Új projekttag</div><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><input value={memberForm.name} onChange={(e) => setMemberForm((c) => ({ ...c, name: e.target.value }))} placeholder="Név *" className="rounded-lg border px-2 py-2 text-[10px]" /><input value={memberForm.organization} onChange={(e) => setMemberForm((c) => ({ ...c, organization: e.target.value }))} placeholder="Cég / szervezet" className="rounded-lg border px-2 py-2 text-[10px]" /><input value={memberForm.functionTitle} onChange={(e) => setMemberForm((c) => ({ ...c, functionTitle: e.target.value }))} placeholder="Szerepkör" className="rounded-lg border px-2 py-2 text-[10px]" /><input value={memberForm.email} onChange={(e) => setMemberForm((c) => ({ ...c, email: e.target.value }))} placeholder="E-mail" className="rounded-lg border px-2 py-2 text-[10px]" /></div><button type="button" onClick={() => void saveMember()} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-[9px] font-black text-white"><UserPlus size={12} /> Tag mentése</button></div><button type="button" onClick={() => void importMembers()} disabled={saving || selectedMembers.size === 0} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-40"><Check size={13} /> Kijelölt tagok betöltése a jelenléti listába</button></>}
          </main>
        </div>
      </div>
    </div>
  );
}
