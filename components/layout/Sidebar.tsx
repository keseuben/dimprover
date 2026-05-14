"use client";

import React from "react";
import SessionCountdown from "@/components/auth/SessionCountdown";
import LogoutButton from "@/components/auth/LogoutButton";
import {
  ClipboardList,
  Building2,
  FileText,
  CalendarDays,
  Users,
  BarChart3,
} from "lucide-react";

type SidebarProps = {
  collapsed?: boolean;
  onOpen?: () => void;
};

const menuItems = [
  { Icon: BarChart3, label: "Kezdőlap", href: "/dashboard" },
  { Icon: Building2, label: "Projektek", href: "/projektek" },
  { Icon: CalendarDays, label: "Ütemterv", href: "/utemezes" },
  { Icon: ClipboardList, label: "Jegyzőkönyvek", href: "/jegyzokonyvek" },
  { Icon: FileText, label: "Dokumentumok", href: "/dokumentumok" },
  { Icon: FileText, label: "Építési napló rögzítő", href: "/enaplo",
},
  { Icon: Users, label: "Partnerek", href: "/partnerek" },
  
];

export default function Sidebar({
  collapsed = false,
  onOpen,
}: SidebarProps) {
  return (
    <aside
      className={`flex h-full flex-col overflow-hidden bg-slate-950 py-7 text-white transition-all duration-300 ${
        collapsed ? "w-[72px] px-3" : "w-[260px] px-6"
      }`}
    >
      {/* LOGO */}
      <div className={`mb-10 ${collapsed ? "text-center" : ""}`}>
        <h1
          className={`font-bold tracking-[0.18em] transition-all duration-300 ${
            collapsed ? "text-lg" : "text-3xl"
          }`}
        >
          {collapsed ? "D" : "DIMPRO"}
        </h1>

        {!collapsed && (
          <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-400">
            Projektvezérlés
          </p>
        )}
      </div>

      {/* MENU */}
      <nav className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.Icon;

          return (
            <a
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={() => {
  if (collapsed) {
    onOpen?.();
  }
}}
              className={`group flex items-center rounded-xl text-sm transition-all duration-200 ${
                collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-3"
              } ${
                item.label === "Kezdőlap"
                  ? "bg-white text-slate-950"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon
                size={18}
                className="shrink-0 transition-transform duration-200 group-hover:scale-105"
              />

              {!collapsed && <span className="truncate">{item.label}</span>}
            </a>
          );
        })}
      </nav>

      {/* SESSION + LOGOUT PARTNEREK ALATT */}
      <div className="mt-8 space-y-3 border-t border-slate-800 pt-5">
        <LogoutButton collapsed={collapsed} />

        {!collapsed && <SessionCountdown />}
      </div>
    </aside>
  );
}