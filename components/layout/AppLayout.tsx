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
import TopBar from "./TopBar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  const leftWidth = sidebarCollapsed ? 72 : 260;
  const rightWidth = rightSidebarCollapsed ? 72 : 300;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <TopBar />
      
      {/* MOBILE */}
      <div className="flex flex-col lg:hidden">
        <main className="px-4 py-5">{children}</main>

        <div className="border-t border-slate-200 bg-white">
          <details className="border-b border-slate-200">
            <summary className="cursor-pointer px-4 py-4 font-medium">
              Naptár és heti áttekintő
            </summary>

            <RightSidebar collapsed={false} />
          </details>
        </div>
      </div>



      {/* DESKTOP CONTROL BUTTONS */}
      <button
        type="button"
        onClick={() => setSidebarCollapsed((prev) => !prev)}
        className="fixed top-[88px] z-[9999] hidden h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md hover:bg-slate-50 hover:text-slate-900 lg:flex"
        style={{ left: leftWidth - 16 }}
        title={sidebarCollapsed ? "Navigáció kinyitása" : "Navigáció becsukása"}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen size={17} />
        ) : (
          <PanelLeftClose size={17} />
        )}
      </button>

      <button
        type="button"
        onClick={() => setRightSidebarCollapsed((prev) => !prev)}
        className="fixed top-[88px] z-[9999] hidden h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md hover:bg-slate-50 hover:text-slate-900 lg:flex"
        style={{ right: rightWidth - 16 }}
        title={
          rightSidebarCollapsed
            ? "Információs panel kinyitása"
            : "Információs panel becsukása"
        }
      >
        {rightSidebarCollapsed ? (
          <PanelRightOpen size={17} />
        ) : (
          <PanelRightClose size={17} />
        )}
      </button>

      {/* DESKTOP */}
      <div
        className="hidden min-h-[calc(100vh-64px)] lg:grid"
        style={{
          gridTemplateColumns: `${leftWidth}px minmax(0, 1fr) ${rightWidth}px`,
        }}
      >
        {/* LEFT SIDEBAR */}
        <div className="min-w-0 overflow-hidden border-r border-slate-200 bg-white">
          <Sidebar collapsed={sidebarCollapsed} />
        </div>

        {/* MAIN */}
        <main className="min-w-0 overflow-x-hidden px-8 py-7">
          {children}
        </main>

        {/* RIGHT SIDEBAR */}
        <div className="min-w-0 overflow-hidden border-l border-slate-200 bg-white">
          <RightSidebar
  collapsed={rightSidebarCollapsed}
  onOpen={() => setRightSidebarCollapsed(false)}
/>
        </div>
      </div>
    </div>
  );
}