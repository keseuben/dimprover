"use client";

import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePersistentCollapse } from "./usePersistentCollapse";

type ModulePanelProps = {
  title?: string;
  subtitle?: string;
  defaultCollapsed?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  storageKey?: string;
};

export default function ModulePanel({ title, subtitle, defaultCollapsed = false, actions, children, className = "", contentClassName = "", storageKey }: ModulePanelProps) {
  const panelStorageKey = storageKey ?? `module-panel:${title ?? "untitled"}`;
  const [collapsed, , toggleCollapsed] = usePersistentCollapse(panelStorageKey, defaultCollapsed);

  return (
    <section className={`relative overflow-hidden border border-blue-200/70 bg-white/75 shadow-[0_10px_24px_rgba(37,99,235,0.10)] backdrop-blur-[2px] ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-blue-100/80 px-5 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-base font-black text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex items-center gap-1 border border-blue-200 bg-white/75 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-blue-600 shadow-sm hover:bg-blue-50"
            >
              {collapsed ? "Megnyitás" : "Összecsukás"}
              {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
          </div>
        </div>
      )}
      {!collapsed && <div className={contentClassName}>{children}</div>}
    </section>
  );
}
