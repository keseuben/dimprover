"use client";

import {
  Archive,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  Info,
  MessageSquareText,
  Paperclip,
  Pencil,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

const NAV_ITEMS = [
  { id: "meeting-meta", label: "Értekezlet adatai", icon: Settings2, className: "bg-slate-100 text-slate-700" },
  { id: "meeting-attendance", label: "Jelenlévők és meghívottak", icon: Users, className: "bg-teal-100 text-teal-800" },
  { id: "meeting-live-minutes", label: "Teljes összefüggő emlékeztető / jegyzőkönyv", icon: FileText, className: "bg-teal-100 text-teal-900" },
  { id: "meeting-agenda", label: "Napirend és jegyzőkönyvi tartalom", icon: ClipboardList, className: "bg-indigo-100 text-indigo-800" },
  { id: "meeting-shared-notes", label: "Megosztott jegyzet", icon: MessageSquareText, className: "bg-sky-100 text-sky-800" },
  { id: "meeting-text-entries", label: "Szöveges bejegyzések", icon: MessageSquareText, className: "bg-cyan-100 text-cyan-800" },
  { id: "meeting-attachments", label: "Képek és mellékletek", icon: Paperclip, className: "bg-violet-100 text-violet-800" },
  { id: "meeting-actions", label: "Döntések, feladatok és kérdések", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-800" },
] as const;

type Props = {
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  allowRoleSwitch: boolean;
  refreshing: boolean;
  onRoleChange: (role: MeetingViewRole) => void;
  onRefresh: () => void;
  onOpenArchive: () => void;
  onOpenAi: () => void;
  onOpenEditorAccess: () => void;
  onOpenHelp: () => void;
};

export default function MeetingCompactHeader({
  workspace,
  role,
  allowRoleSwitch,
  refreshing,
  onRoleChange,
  onRefresh,
  onOpenArchive,
  onOpenAi,
  onOpenEditorAccess,
  onOpenHelp,
}: Props) {
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    function handleSectionChange(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      setActiveSection(detail?.id || "");
    }
    window.addEventListener("dimpro-meeting-section", handleSectionChange as EventListener);
    return () => window.removeEventListener("dimpro-meeting-section", handleSectionChange as EventListener);
  }, []);

  function activateSection(id: string) {
    window.dispatchEvent(new CustomEvent("dimpro-meeting-section", { detail: { id } }));
    window.setTimeout(() => {
      const target = document.getElementById(id);
      const container = document.querySelector<HTMLElement>("[data-meeting-scroll-container]");
      if (!target || !container) return;
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const nextTop = container.scrollTop + targetRect.top - containerRect.top;
      container.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
    }, 90);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-11 items-center gap-2 px-1.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-600 to-sky-500 text-[10px] font-black text-white">D</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-black text-slate-950">{workspace.minuteNumber || workspace.title}</div>
          <div className="truncate text-[8px] font-semibold text-slate-500">{workspace.projectName} · {workspace.documentLabel}</div>
        </div>
        <span className={`h-2 w-2 shrink-0 rounded-full ${workspace.status === "active" ? "bg-emerald-500" : workspace.status === "published" ? "bg-sky-500" : "bg-amber-500"}`} title={workspace.status} />
        {allowRoleSwitch && (
          <button
            type="button"
            onClick={() => onRoleChange(role === "organizer" ? "participant" : "organizer")}
            title={role === "organizer" ? "Résztvevői nézet megtekintése" : "Szervezői nézet megtekintése"}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
          >
            {role === "organizer" ? <Users size={13} /> : <Settings2 size={13} />}
          </button>
        )}
        <button type="button" onClick={onRefresh} title="Adatok frissítése" className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-1.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => activateSection(item.id)}
              title={`${item.label} – megnyitás a panel tetején`}
              aria-label={item.label}
              aria-pressed={active}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${item.className} ${active ? "border-slate-500 ring-2 ring-slate-300/70" : "border-transparent hover:border-slate-300"}`}
            >
              <Icon size={14} />
            </button>
          );
        })}
        <button type="button" onClick={onOpenArchive} title="Korábbi emlékeztetők, jegyzőkönyvek és feljegyzések" aria-label="Korábbi dokumentumok" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-white hover:bg-slate-700"><Archive size={14} /></button>
        <button
          type="button"
          onClick={onOpenEditorAccess}
          title={role === "organizer" ? "Jegyzőkönyv-szerkesztés átadása" : role === "editor" ? "Szerkesztői mód kezelése" : "Szerkesztői mód aktiválása"}
          aria-label={role === "organizer" ? "Jegyzőkönyv-szerkesztés átadása" : "Szerkesztői mód"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${role === "editor" ? "bg-emerald-600 text-white" : "bg-teal-100 text-teal-800 hover:bg-teal-200"}`}
        >
          <Pencil size={14} />
        </button>
        {role === "organizer" && <button type="button" onClick={onOpenAi} title="AI emlékeztető / jegyzőkönyv megfogalmazása" aria-label="AI dokumentum megfogalmazása" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-200"><Bot size={14} /></button>}
        <button type="button" onClick={onOpenHelp} title="Információ, felhasználói és szerkesztői útmutató" aria-label="Információ és útmutató" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-900 hover:bg-amber-200"><Info size={14} /></button>
      </div>
    </header>
  );
}