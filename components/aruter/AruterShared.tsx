"use client";

import Link from "next/link";
import { CalendarDays, Home, Moon, Store, Sun, UserCircle2, Wifi } from "lucide-react";

export function AruterBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/aruter" className="flex items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-300 bg-lime-50 text-lg font-black text-emerald-700 shadow-[0_0_24px_rgba(132,204,22,0.20)]">P</span>
      <span>
        <span className="block text-[11px] font-black uppercase tracking-[0.22em] text-slate-700">DIMPRO</span>
        <span className={`${compact ? "text-3xl" : "text-4xl"} -mt-1 block font-black tracking-tight text-teal-700`}>Árutér</span>
      </span>
    </Link>
  );
}

export function AruterTopBar({
  role,
  userName = "Kovácsné",
  shopName = "Kovács Kertészet",
  showSunMode = true,
}: {
  role: string;
  userName?: string;
  shopName?: string;
  showSunMode?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/92 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-5">
          <AruterBrand compact />
          <span className="hidden h-10 w-px bg-slate-200 md:block" />
          <div className="hidden min-w-0 items-center gap-2 text-base font-black text-slate-900 sm:flex">
            <Store size={22} className="text-teal-700" />
            <span className="truncate">{shopName}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 md:flex"><Wifi size={16} /> Kapcsolat: Online</span>
          {showSunMode && <button type="button" className="hidden items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 md:flex"><Sun size={16} /> Napfény mód</button>}
          <span className="hidden items-center gap-2 text-sm font-bold text-slate-700 lg:flex"><CalendarDays size={16} /> 10:24</span>
          <button type="button" className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-2 text-sm font-black text-slate-900 shadow-sm">
            <UserCircle2 size={24} className="text-teal-700" />
            <span className="hidden text-left sm:block"><span className="block leading-4">{userName}</span><span className="block text-[11px] font-bold text-slate-500">{role}</span></span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function AruterMobileBottomNav({ active }: { active: "products" | "cart" | "bookings" | "profile" }) {
  const items = [
    { key: "products", label: "Termékek", href: "/aruter/arufelvevo", icon: Home },
    { key: "cart", label: "Kosár", href: "/aruter/penztar", icon: Store },
    { key: "bookings", label: "Foglalások", href: "/aruter/torzsvasarlo", icon: CalendarDays },
    { key: "profile", label: "Profil", href: "/aruter", icon: UserCircle2 },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <Link key={item.key} href={item.href} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-black ${isActive ? "bg-teal-50 text-teal-700" : "text-slate-500"}`}>
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AruterPageShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <main className={`min-h-screen bg-[#f7fbfb] text-slate-950 ${className}`}>{children}</main>;
}

export function AruterCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[26px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)] ${className}`}>{children}</section>;
}

export function ModeToggle() {
  return <button type="button" className="rounded-full border border-slate-200 bg-white p-2 text-slate-600"><Moon size={18} /></button>;
}
