"use client";

import React, { useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import Sidebar from "./Sidebar";
import RightSidebar from "./RightSidebar";
import QuickNoteFloating from "./QuickNoteFloating";
import FocusViewOverlay from "./FocusViewOverlay";
import ContextHelpFloating from "./ContextHelpFloating";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(true);

  const leftWidth = sidebarCollapsed ? 72 : 260;
  const rightWidth = rightSidebarCollapsed ? 72 : 300;

  return (
    <div className="min-h-screen dimpro-architect-grid text-slate-900">
      <FocusViewOverlay />
      <ContextHelpFloating />
      <QuickNoteFloating />
      <div className="flex flex-col lg:hidden">
        <div className="border-b border-slate-200 bg-[#07111F] px-4 py-4 text-white">
          <div className="text-lg font-bold tracking-[0.18em]">DIMPROVER</div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-sky-200/75">
            Digitális műszaki projektkönyv
          </div>
        </div>
        <main className="px-4 py-5">{children}</main>

        <div className="border-t border-slate-200 bg-white/85 backdrop-blur">
          <details className="border-b border-slate-200">
            <summary className="cursor-pointer px-4 py-4 font-medium">
              Naptár és heti áttekintő
            </summary>
            <RightSidebar collapsed={false} />
          </details>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSidebarCollapsed((prev) => !prev)}
        className="fixed top-8 z-[9999] hidden h-8 w-8 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-500 shadow-md hover:bg-sky-50 hover:text-sky-700 lg:flex"
        style={{ left: leftWidth - 16 }}
        title={sidebarCollapsed ? "Navigáció kinyitása" : "Navigáció becsukása"}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>

      <button
        type="button"
        onClick={() => setRightSidebarCollapsed((prev) => !prev)}
        className="fixed top-8 z-[9999] hidden h-8 w-8 items-center justify-center rounded-full border border-sky-100 bg-white text-slate-500 shadow-md hover:bg-sky-50 hover:text-sky-700 lg:flex"
        style={{ right: rightWidth - 16 }}
        title={rightSidebarCollapsed ? "Információs panel kinyitása" : "Információs panel becsukása"}
      >
        {rightSidebarCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
      </button>

      <div
        className="hidden min-h-screen lg:grid"
        style={{ gridTemplateColumns: `${leftWidth}px minmax(0, 1fr) ${rightWidth}px` }}
      >
        <div className="relative z-40 min-w-0 overflow-visible border-r border-sky-900/25">
          <Sidebar collapsed={sidebarCollapsed} />
        </div>

        <main className="relative z-10 min-w-0 overflow-x-hidden py-0 pl-0 pr-5">
          <div
            data-title-mode={sidebarCollapsed && rightSidebarCollapsed ? "long" : !sidebarCollapsed && !rightSidebarCollapsed ? "short" : "medium"}
            className="group/main min-h-screen border-r border-slate-200/70 bg-white/78 p-0 shadow-[inset_18px_0_46px_rgba(15,23,42,0.035),18px_0_42px_rgba(15,23,42,0.055)] backdrop-blur-xl"
          >
            {children}
          </div>
        </main>

        <div className="relative z-[9998] min-w-0 overflow-visible border-l border-slate-300/45 bg-transparent">
          <RightSidebar collapsed={rightSidebarCollapsed} onOpen={() => setRightSidebarCollapsed(false)} />
        </div>
      </div>
    </div>
  );
}
