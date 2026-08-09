import Link from "next/link";
import { Camera, CheckCircle2, ClipboardList, Download, PawPrint, Sprout, Tractor, Warehouse } from "lucide-react";

function BrandMark() {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-900/10 bg-white shadow-[0_14px_38px_rgba(21,128,61,0.14)]">
      <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-50 to-lime-100">
        <Sprout className="absolute left-1/2 top-1 h-7 w-7 -translate-x-1/2 text-emerald-800" />
        <div className="absolute bottom-1 left-1 right-1 h-4 rounded-t-full border-t-4 border-emerald-800" />
      </div>
    </div>
  );
}

export default function GazdaSegedMarketing() {
  const modules = [
    { icon: ClipboardList, title: "Napi munka", text: "Vetés, talajmunka, permetezés, aratás, öntözés és ellenőrzés.", href: "https://app.dimpro.hu/gazdaseged?view=daily" },
    { icon: PawPrint, title: "Állattartás", text: "Ellés, születés, oltás, kezelés, termékenyítés és elhullás rögzítése.", href: "https://app.dimpro.hu/gazdaseged?view=animals" },
    { icon: Tractor, title: "Gépnapló", text: "Géphasználat, üzemóra, hiba, javítás és karbantartási figyelés.", href: "https://app.dimpro.hu/gazdaseged?view=machines" },
    { icon: Warehouse, title: "Raktár", text: "Termény, takarmány, műtrágya, növényvédőszer és készletmozgás.", href: "https://app.dimpro.hu/gazdaseged?view=warehouse" },
    { icon: Camera, title: "Fotók", text: "Fotó csatolása terepi eseményhez, állathoz, géphibához vagy bizonylathoz.", href: "https://app.dimpro.hu/gazdaseged?view=photos" },
    { icon: Download, title: "Export", text: "CSV, Excel és PDF összesítők előkészítése adminisztrációhoz.", href: "https://app.dimpro.hu/gazdaseged?view=exports" },
  ];

  return (
    <main className="min-h-screen bg-[#f5fbf4] text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_12%,rgba(34,197,94,0.16),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(20,184,166,0.12),transparent_28%),linear-gradient(180deg,#f8fff7_0%,#f5fbf4_48%,#eef8eb_100%)]" />
      <header className="border-b border-emerald-900/10 bg-[#f8fff7]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <Link href="/" className="flex items-center gap-4">
            <BrandMark />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">DIMPRO modul app</p>
              <h1 className="text-2xl font-black tracking-[-0.05em] text-emerald-950">GazdaSegéd</h1>
            </div>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="https://app.dimpro.hu/login" className="rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-emerald-800">Belépés</Link>
            <Link href="https://app.dimpro.hu/gazdaseged" className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white">App megnyitása</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1440px] gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
        <div className="flex flex-col justify-center">
          <div className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-800">Terepi adatgyűjtő és exportáló app</div>
          <h2 className="mt-6 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.07em] text-emerald-950 md:text-7xl">Terepen egyszerű, irodában hasznos.</h2>
          <p className="mt-7 max-w-3xl text-xl leading-9 text-slate-700">A DIMPRO GazdaSegéd egyszerű, magyar nyelvű, mobilközpontú előrögzítő app gazdáknak, telepi dolgozóknak és agrár-adminisztrátoroknak. A gazda gyorsan rögzít, az adminisztrátor rendezett exportból dolgozik.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="https://app.dimpro.hu/login" className="rounded-2xl bg-emerald-700 px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_18px_42px_rgba(34,197,94,0.22)]">Kipróbálás / belépés</Link>
            <a href="#modulok" className="rounded-2xl border border-emerald-200 bg-white px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-emerald-800">Funkciók</a>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Mobil első", "Nagy gombok, kevés mező, gyors rögzítés."],
              ["Role-based", "Gazda Admin, Telepvezető és Dolgozó nézet."],
              ["Export", "Rendezett adatcsomag későbbi adminisztrációhoz."],
            ].map(([title, text]) => (
              <article key={title} className="rounded-2xl border border-emerald-200 bg-white/86 p-5 shadow-[0_14px_42px_rgba(15,23,42,0.06)]">
                <CheckCircle2 className="h-7 w-7 text-emerald-700" />
                <h3 className="mt-3 text-lg font-black text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[2.4rem] border border-white bg-white/82 p-6 shadow-[0_30px_100px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="rounded-[2rem] bg-emerald-950 p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Mai áttekintés</p>
                <h3 className="mt-2 text-3xl font-black tracking-[-0.05em]">Demo Gazdaság</h3>
              </div>
              <BrandMark />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {["18 rögzítés", "7 állatesemény", "3 export"].map((item) => <div key={item} className="rounded-2xl bg-white/10 p-4 text-center text-sm font-black">{item}</div>)}
            </div>
            <div className="mt-5 space-y-3">
              {["Ellés / születés - HU 1234567890", "Permetezés - Felső-dűlő 12.", "Készlet bevét - műtrágya"].map((item) => <div key={item} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950">{item}</div>)}
            </div>
          </div>
        </div>
      </section>

      <section id="modulok" className="mx-auto max-w-[1440px] px-5 pb-16 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <Link key={module.title} href={module.href} className="group rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-[0_18px_52px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_22px_62px_rgba(15,118,110,0.12)]">
              <module.icon className="h-12 w-12 rounded-2xl bg-emerald-700 p-3 text-white" />
              <h3 className="mt-5 text-2xl font-black tracking-[-0.04em] text-slate-950">{module.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{module.text}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.10em] text-emerald-700 transition group-hover:text-emerald-900">
                Modul megnyitása →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
