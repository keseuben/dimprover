"use client";

import React, { useState } from "react";

import NotificationBell from "@/components/notifications/NotificationBell";
import {
  Archive,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileSignature,
  FileText,
  HardHat,
  Menu,
  Monitor,
  Moon,
  ReceiptText,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";

const mobileMenuItems = [
  { Icon: BarChart3, label: "Kezdőlap", href: "/dashboard" },
  { Icon: Building2, label: "Projektek", href: "/projektek" },
  { Icon: FileSignature, label: "Ajánlatkészítés", href: "/ajanlatkeszites" },
  { Icon: CalendarDays, label: "Ütemterv", href: "/utemezes" },
  { Icon: Archive, label: "Projektiktató", href: "/projektiktato" },
  { Icon: ReceiptText, label: "Pénzügyi iktató", href: "/penzugyi-iktato" },
  { Icon: ClipboardList, label: "Jegyzőkönyvek", href: "/jegyzokonyvek" },
  { Icon: FileText, label: "Dokumentumok", href: "/dokumentumok" },
  { Icon: HardHat, label: "Építési napló rögzítő", href: "/enaplo" },
  { Icon: Users, label: "Partnerek", href: "/partnerek" },
  { Icon: Settings, label: "Beállítások", href: "/beallitasok" },
];

export default function TopBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="flex h-16 items-center justify-between bg-[#07111F] px-5 text-white shadow-sm">
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
            <Search size={18} className="text-sky-200/65" />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-sky-200/65"
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

          <NotificationBell buttonClassName="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" />

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
              className="rounded-md bg-white p-1.5 text-sky-700"
              title="Napfényes nézet"
            >
              <Monitor size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-sky-700">
              K
            </div>

            <div className="hidden text-sm leading-tight md:block">
              <div className="font-semibold">Keserű Benjámin</div>
              <div className="text-xs text-sky-100">Projektvezető</div>
            </div>

            <ChevronDown size={16} />
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-[#07111F]/50"
            onClick={() => setMobileMenuOpen(false)}
          />

          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-[#07111F] px-6 py-6 text-white shadow-2xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold tracking-[0.18em]">
                  DIMPROVER
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.25em] text-sky-200/65">
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

            <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {mobileMenuItems.map((item) => {
                const Icon = item.Icon;

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                      item.label === "Kezdőlap"
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
