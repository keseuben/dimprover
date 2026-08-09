"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingViewRole } from "@/app/lib/meeting-assistant/types";

export default function MeetingSectionShell({
  id,
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
  accentClass = "text-indigo-700 bg-indigo-50",
  scope,
}: {
  id?: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  accentClass?: string;
  scope?: MeetingViewRole;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!id) return;
    function handleNavigation(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; scope?: MeetingViewRole }>).detail;
      if (detail?.scope && scope && detail.scope !== scope) return;
      setOpen(Boolean(detail?.id) && detail.id === id);
    }
    window.addEventListener("dimpro-meeting-section", handleNavigation as EventListener);
    return () => window.removeEventListener("dimpro-meeting-section", handleNavigation as EventListener);
  }, [id, scope]);

  function toggleSection() {
    if (!id) {
      setOpen((value) => !value);
      return;
    }
    const nextId = open ? "" : id;
    window.dispatchEvent(new CustomEvent("dimpro-meeting-section", { detail: { id: nextId, scope } }));
    if (!nextId) return;
    window.setTimeout(() => {
      const panel = scope ? document.querySelector<HTMLElement>(`[data-meeting-panel-role="${scope}"]`) : null;
      const target = panel?.querySelector<HTMLElement>(`#${nextId}`) || document.getElementById(nextId);
      const container = panel?.querySelector<HTMLElement>("[data-meeting-scroll-container]") || document.querySelector<HTMLElement>("[data-meeting-scroll-container]");
      if (!target || !container) return;
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTo({ top: Math.max(0, container.scrollTop + targetRect.top - containerRect.top), behavior: "smooth" });
    }, 90);
  }

  return (
    <section id={id} className="scroll-mt-[92px] border-b border-slate-200 bg-white">
      <button
        type="button"
        onClick={toggleSection}
        className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-50"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${accentClass}`}><Icon size={13} /></span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-black text-slate-900">{title}</span>
        {badge}
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 px-2 py-2.5">{children}</div>}
    </section>
  );
}