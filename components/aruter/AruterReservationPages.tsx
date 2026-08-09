"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  Home,
  PackageCheck,
  Search,
  Store,
} from "lucide-react";
import type { AruterPublicReservation, AruterPublicReservationStatus } from "@/app/lib/aruter/publicReservation";
import { aruterDemoBusiness } from "@/app/lib/aruter/publicOfferData";
import { AruterBrand, AruterCard, AruterPageShell, ModeToggle } from "./AruterShared";

const statusLabels: Record<AruterPublicReservationStatus, string> = {
  new: "Új foglalás",
  confirmed: "Visszaigazolva",
  preparing: "Előkészítés alatt",
  ready: "Átvehető",
  picked_up: "Átvéve",
  cancelled: "Törölve",
};

const statusStyles: Record<AruterPublicReservationStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-100",
  confirmed: "bg-cyan-50 text-cyan-700 border-cyan-100",
  preparing: "bg-amber-50 text-amber-700 border-amber-100",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-100",
  picked_up: "bg-slate-100 text-slate-700 border-slate-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-100",
};

function StatusPill({ status }: { status: AruterPublicReservationStatus }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyles[status]}`}>{statusLabels[status]}</span>;
}

function reservationTotal(reservation: AruterPublicReservation) {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(reservation.quantity * reservation.productPrice);
}

function AdminShell({ children, active }: { children: React.ReactNode; active: "foglalasok" | "elokeszites" }) {
  const menu = [
    { label: "Vezérlőpult", href: "/aruter/ajanlatoldal", icon: Home, key: "dashboard" },
    { label: "Foglalások", href: "/aruter/foglalasok", icon: ClipboardList, key: "foglalasok" },
    { label: "Előkészítés", href: "/aruter/elokeszites", icon: PackageCheck, key: "elokeszites" },
    { label: "Nyilvános oldal", href: "/aruter/kovacs-kerteszet", icon: Store, key: "public" },
  ];

  return (
    <AruterPageShell>
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white p-6 lg:block">
          <AruterBrand compact />
          <nav className="mt-8 space-y-2">
            {menu.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === active;
              return (
                <Link key={item.key} href={item.href} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-black ${isActive ? "bg-teal-700 text-white shadow-lg" : "text-slate-700 hover:bg-teal-50"}`}>
                  <Icon size={20} />{item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <section className="min-w-0">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
            <label className="hidden h-12 w-[520px] items-center gap-3 rounded-2xl border border-slate-200 px-4 md:flex">
              <Search size={18} /><input className="flex-1 outline-none" placeholder="Keresés foglalásra, vásárlóra, termékre..." />
            </label>
            <div className="ml-auto flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3"><Store size={18} className="text-teal-700" />{aruterDemoBusiness.name}<ChevronDown size={16} /></div>
            <ModeToggle />
            <CircleUserRound className="text-teal-700" />
          </header>
          {children}
        </section>
      </div>
    </AruterPageShell>
  );
}

function usePublicReservations() {
  const [reservations, setReservations] = useState<AruterPublicReservation[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReservations() {
    setLoading(true);
    try {
      const response = await fetch(`/api/aruter/public-reservations?businessSlug=${aruterDemoBusiness.slug}`);
      const result = await response.json() as { ok: boolean; data?: AruterPublicReservation[] };
      if (result.ok && result.data) setReservations(result.data);
    } finally {
      setLoading(false);
    }
  }

  async function updateReservationStatus(id: string, status: AruterPublicReservationStatus) {
    const response = await fetch(`/api/aruter/public-reservations/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json() as { ok: boolean; data?: AruterPublicReservation };
    if (result.ok && result.data) {
      setReservations((items) => items.map((item) => item.id === id ? result.data! : item));
    }
  }

  useEffect(() => {
    void loadReservations();
  }, []);

  return { reservations, loading, updateReservationStatus, reload: loadReservations };
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center font-bold text-slate-500">{text}</div>;
}

export function AruterReservationsPage() {
  const { reservations, loading, updateReservationStatus } = usePublicReservations();

  const stats = [
    { label: "Új", value: reservations.filter((item) => item.status === "new").length },
    { label: "Előkészítés alatt", value: reservations.filter((item) => item.status === "preparing").length },
    { label: "Átvehető", value: reservations.filter((item) => item.status === "ready").length },
    { label: "Átvéve", value: reservations.filter((item) => item.status === "picked_up").length },
  ];

  return (
    <AdminShell active="foglalasok">
      <main className="p-5 md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-black uppercase tracking-[0.16em] text-teal-700">DIMPRO Árutér</p><h1 className="text-4xl font-black">Foglalások</h1></div>
          <Link href="/aruter/kovacs-kerteszet" className="rounded-2xl bg-teal-700 px-5 py-3 font-black text-white">Nyilvános oldal megnyitása</Link>
        </div>
        <div className="mb-6 grid gap-4 md:grid-cols-4">{stats.map((stat) => <AruterCard key={stat.label} className="p-5"><p className="text-sm font-bold text-slate-500">{stat.label}</p><b className="text-4xl text-teal-700">{stat.value}</b></AruterCard>)}</div>
        {loading ? <EmptyState text="Foglalások betöltése..." /> : reservations.length === 0 ? <EmptyState text="Még nincs mentett nyilvános foglalás. Próbáld ki a /aruter/kovacs-kerteszet oldalon." /> : (
          <AruterCard className="overflow-hidden">
            <div className="grid grid-cols-[1.1fr_1fr_120px_140px_170px] gap-3 bg-slate-50 p-4 text-sm font-black text-slate-500">
              <span>Vásárló</span><span>Termék</span><span>Átvétel</span><span>Összeg</span><span>Állapot</span>
            </div>
            {reservations.map((reservation) => (
              <div key={reservation.id} className="grid grid-cols-[1.1fr_1fr_120px_140px_170px] items-center gap-3 border-t border-slate-100 p-4 text-sm">
                <div><b className="text-base">{reservation.customerName}</b><p className="text-slate-500">{reservation.phone}{reservation.email ? ` · ${reservation.email}` : ""}</p></div>
                <div><b>{reservation.quantity} {reservation.productUnit} {reservation.productName}</b><p className="text-slate-500">{reservation.note || reservation.productDescription}</p></div>
                <b>{reservation.pickupSlotLabel}</b>
                <b>{reservationTotal(reservation)}</b>
                <div className="flex flex-col gap-2"><StatusPill status={reservation.status} /><div className="flex gap-1"><button onClick={() => updateReservationStatus(reservation.id, "confirmed")} className="rounded-lg border px-2 py-1 text-xs font-black">OK</button><button onClick={() => updateReservationStatus(reservation.id, "preparing")} className="rounded-lg border px-2 py-1 text-xs font-black">Elők.</button><button onClick={() => updateReservationStatus(reservation.id, "ready")} className="rounded-lg border px-2 py-1 text-xs font-black">Kész</button></div></div>
              </div>
            ))}
          </AruterCard>
        )}
      </main>
    </AdminShell>
  );
}

export function AruterPreparationPage() {
  const { reservations, loading, updateReservationStatus } = usePublicReservations();
  const activeReservations = reservations.filter((item) => ["new", "confirmed", "preparing", "ready"].includes(item.status));

  return (
    <AdminShell active="elokeszites">
      <main className="p-5 md:p-8">
        <div className="mb-6"><p className="text-sm font-black uppercase tracking-[0.16em] text-teal-700">DIMPRO Árutér</p><h1 className="text-4xl font-black">Előkészítés</h1><p className="mt-2 font-semibold text-slate-600">A nyilvános ajánlatoldalról érkezett foglalások összekészítése és átvételre állítása.</p></div>
        {loading ? <EmptyState text="Előkészítési lista betöltése..." /> : activeReservations.length === 0 ? <EmptyState text="Nincs aktív előkészítendő foglalás." /> : (
          <div className="grid gap-4 xl:grid-cols-3">
            {activeReservations.map((reservation) => (
              <AruterCard key={reservation.id} className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-2xl font-black">{reservation.pickupSlotLabel}</h2><p className="font-bold text-slate-500">{reservation.customerName}</p></div><StatusPill status={reservation.status} /></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-bold text-slate-500">Termék</p><b className="text-xl">{reservation.quantity} {reservation.productUnit} {reservation.productName}</b><p className="mt-1 text-sm font-semibold text-slate-500">{reservation.note || reservation.productDescription}</p></div>
                <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => updateReservationStatus(reservation.id, "preparing")} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 font-black text-amber-700">Előkészítés alatt</button><button onClick={() => updateReservationStatus(reservation.id, "ready")} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 font-black text-emerald-700">Átvehető</button><button onClick={() => updateReservationStatus(reservation.id, "picked_up")} className="col-span-2 rounded-2xl bg-teal-700 px-3 py-3 font-black text-white"><Check className="inline" size={18} /> Átvéve</button></div>
              </AruterCard>
            ))}
          </div>
        )}
      </main>
    </AdminShell>
  );
}
