"use client";

import React, { useState } from "react";

import {
  Search,
  Bell,
  Building2,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  BarChart3,
  ClipboardList,
  FileText,
  CalendarDays,
  Users,
} from "lucide-react";

const mobileMenuItems = [
  { Icon: BarChart3, label: "Dashboard", href: "/dashboard" },
  { Icon: Building2, label: "Projektek", href: "/projektek/1" },
  { Icon: CalendarDays, label: "Ütemterv", href: "/utemezes" },
  { Icon: ClipboardList, label: "Jegyzőkönyvek", href: "/jegyzokonyvek" },
  { Icon: FileText, label: "Dokumentumok", href: "/dokumentumok" },
  { Icon: Users, label: "Partnerek", href: "/partnerek" },
];

export default function TopBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="flex h-16 items-center justify-between bg-blue-700 px-5 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
            aria-label="Mobil menü megnyitása"
          >
            <Menu size={22} />
          </button>

          
<div className="text-2xl font-bold tracking-wide">
  DIMPROVER
</div>

          <div className="hidden w-[520px] items-center gap-2 rounded-lg bg-white px-4 py-2 text-slate-700 md:flex">
            <Search size={18} className="text-slate-400" />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Keresés projektekben, dokumentumokban, jegyzőkönyvekben..."
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="hidden items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm font-medium md:flex">
            <Building2 size={16} />
            Projekt választása
            <ChevronDown size={16} />
          </button>

          <div className="relative">
            <Bell size={20} />
            <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-1.5 text-[10px] font-bold">
              5
            </span>
          </div>

          <div className="hidden items-center gap-1 rounded-lg border border-white/30 bg-white/10 p-1 md:flex">
            <button
              className="rounded-md p-1.5 text-white hover:bg-white/20"
              title="Világos nézet"
            >
              <Sun size={16} />
            </button>

            <button
              className="rounded-md p-1.5 text-white hover:bg-white/20"
              title="Sötét nézet"
            >
              <Moon size={16} />
            </button>

            <button
              className="rounded-md bg-white p-1.5 text-blue-700"
              title="Napfényes nézet"
            >
              <Monitor size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-700">
              K
            </div>

            <div className="hidden text-sm leading-tight md:block">
              <div className="font-semibold">Keserű Benjámin</div>
              <div className="text-xs text-blue-100">Projektvezető</div>
            </div>

            <ChevronDown size={16} />
          
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />

          <aside className="absolute left-0 top-0 h-full w-72 bg-slate-950 px-6 py-6 text-white shadow-2xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                
<div className="text-2xl font-bold tracking-[0.18em]">
  DIMPROVER
</div>
                <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                  Projektvezérlés
                </div>
              </div>

              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 hover:bg-white/10"
                aria-label="Mobil menü bezárása"
              >
                <X size={22} />
              </button>
            </div>

            <nav className="space-y-2">
              {mobileMenuItems.map((item) => {
                const Icon = item.Icon;

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                      item.label === "Dashboard"
                        ? "bg-white text-slate-950"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}