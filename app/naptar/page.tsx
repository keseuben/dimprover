import DimproFullCalendar from "@/components/calendar/DimproFullCalendar";
import AppLayout from "@/components/layout/AppLayout";
import { CalendarDays, DatabaseZap, RefreshCw } from "lucide-react";

function TechnicalPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative z-[1] border-t-4 border-blue-300/80 bg-white/75 px-5 py-4 shadow-[0_10px_24px_rgba(37,99,235,0.12)] backdrop-blur-[3px] ${className}`}>
      <span className="absolute -right-px -bottom-px h-3 w-3 border-b-2 border-r-2 border-cyan-400/70" />
      {children}
    </div>
  );
}

export default function NaptarPage() {
  return (
    <AppLayout>
      <section className="relative mb-0 min-h-screen overflow-hidden px-8 pb-8 pt-7">
        <div className="relative z-[1]">
          <header className="mb-5 grid gap-6 xl:grid-cols-[1fr_520px] xl:items-start">
            <div className="pl-8">
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-slate-800">DIMPROVER modul</p>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-[#008CFF]">Heti szervező naptár</h1>
              <p className="mt-4 max-w-3xl text-base font-semibold text-cyan-500">
                Appba beépíthető, nyílt forrású naptárhoz a legjobb alap szerintem: FullCalendar + saját backend integrációs réteg Google Calendar és Microsoft Graph felé.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="border border-blue-200/80 bg-white/78 px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.04)] backdrop-blur">
                <CalendarDays className="mb-2 text-blue-600" size={18} />
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Frontend</div>
                <div className="mt-1 text-sm font-black text-slate-900">FullCalendar</div>
              </div>
              <div className="border border-blue-200/80 bg-white/78 px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.04)] backdrop-blur">
                <DatabaseZap className="mb-2 text-blue-600" size={18} />
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Backend</div>
                <div className="mt-1 text-sm font-black text-slate-900">Saját API</div>
              </div>
              <div className="border border-blue-200/80 bg-white/78 px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.04)] backdrop-blur">
                <RefreshCw className="mb-2 text-blue-600" size={18} />
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Szinkron</div>
                <div className="mt-1 text-sm font-black text-slate-900">Google + Outlook</div>
              </div>
            </div>
          </header>

          <TechnicalPanel className="mt-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.08em] text-blue-700">Heti szervező naptár</h2>
                <p className="mt-1 text-xs text-slate-500">Nap, Munkahét, Hét, Hónap és Ütemezés nézettel, 00:00-24:00 idősávval és félórás bontással.</p>
              </div>
              <a href="/dashboard" className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800">Vissza a kezdőlapra →</a>
            </div>

            <DimproFullCalendar />
          </TechnicalPanel>
        </div>
      </section>
    </AppLayout>
  );
}
