"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Calculator, ClipboardList, FileText, Lightbulb, LockKeyhole, MessageCircle, ScanLine, ShieldCheck, Store, Target, UserCircle2 } from "lucide-react";

const DEMO_CODE = "900407";
const DEMO_STORAGE_KEY = "dimpro-public-demo-linked";

const publicCards = [
  { title: "Vállalkozási munkafolyamatok", text: "Előkészítés alatt álló digitális segédprogram kategória.", status: "Fejlesztés alatt", icon: BriefcaseBusiness },
  { title: "Műszaki / dokumentációs segédprogramok", text: "Előkészítés alatt álló digitális segédprogram kategória.", status: "Fejlesztés alatt", icon: FileText },
  { title: "Ügyfél- és licenckezelés", text: "Aktív ügyfélfelület meglévő DIMPRO hozzáféréssel.", status: "Aktív felület", icon: UserCircle2, href: "https://license.dimpro.hu/customer", live: true },
];

const detailedCards = [
  { title: "DIMPRO Árutér", text: "Külső árutér, pult, raktár és pénztár közötti papírmentes árurögzítés előkészített appfelülete.", status: "Aktív fejlesztési link", icon: Store, href: "https://aruter.dimpro.hu" },
  { title: "DIMPRO Felújítási Gyorskalkulátor", text: "Felújítási költségbecslés, kalkulációs változatok és későbbi költségkontroll előkészítése.", status: "Aktív fejlesztési link", icon: Calculator, href: "/felujitasi-gyorskalkulator" },
  { title: "DIMPRO Ingatlanfelmérő", text: "Tabletes energetikai és műszaki helyszíni felmérés alaprajzzal, tájolással, szerkezeti és gépészeti adatfelvétellel.", status: "Működő MVP", icon: ScanLine, href: "/ingatlanfelmero" },
  { title: "DIMPRO vállalati feladatszervezési munkatér", text: "OneDrive / SharePoint mappából indítható vállalati munkatér feladatokhoz, naptárhoz, belső folyamatokhoz és jogosultságkezelt használathoz.", status: "Aktív fejlesztési link", icon: BriefcaseBusiness, href: "/account/modules" },
  { title: "DIMPRO GazdaSegéd", text: "Egyszerű, terepen is átlátható gazdasági segédapp állattartási, növénytermesztési és napi gazdasági feladatok rögzítéséhez, például ellés, oltás, kezelés, takarmányozás, munkanapló és teendők előkészítésével.", status: "Fejlesztési ötlet / előkészítés alatt", icon: BriefcaseBusiness, href: "/gazdaseged" },
  { title: "DIMPRO Fájlműhely helyi (asztali) segédprogram", text: "Helyi gépen futó fájlkezelő és dokumentum-előkészítő segédprogram mérnöki munkákhoz.", status: "Fejlesztés alatti segédprogram", icon: FileText },
  { title: "DIMPROVER", text: "Digitális Műszaki Projektvezérlő Rendszer építőipari és mérnöki projektmunkákhoz, dokumentumokhoz, jegyzőkönyvekhez és ütemezéshez.", status: "Aktív fejlesztési link", icon: ClipboardList, href: "https://dimprover.hu" },
  { title: "DIMPRO ügyfélfelület", text: "Aktív ügyfél- és licenckezelő felület meglévő DIMPRO ügyfelek számára.", status: "Aktív ügyfélfelület", icon: UserCircle2, href: "https://license.dimpro.hu/customer" },
];

function Logo() {
  return <div className="grid h-11 w-11 place-items-center rounded-2xl border border-lime-300 bg-white shadow-sm"><div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-800 text-sm font-black text-white">P</div></div>;
}

function Card({ item }: { item: (typeof publicCards)[number] | (typeof detailedCards)[number] }) {
  const Icon = item.icon;
  const live = "live" in item && item.live;
  const content = <><div className={live ? "mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-lime-200" : "mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-lime-100 text-teal-700"}><Icon size={32} /></div><h3 className={live ? "text-xl font-black text-white" : "text-xl font-black text-slate-950"}>{item.title}</h3><p className={live ? "mt-4 text-sm font-semibold leading-7 text-teal-50/85" : "mt-4 text-sm font-semibold leading-7 text-slate-600"}>{item.text}</p><span className={live ? "mt-6 inline-flex rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-teal-950" : "mt-6 inline-flex rounded-full bg-lime-50 px-4 py-2 text-xs font-black text-teal-700"}>{item.status}</span>{"href" in item && item.href ? <span className={live ? "mt-5 inline-flex items-center gap-2 text-sm font-black text-lime-200" : "mt-5 inline-flex items-center gap-2 text-sm font-black text-teal-700"}>Megnyitás <ArrowRight size={17} /></span> : null}</>;
  const className = live ? "rounded-[1.75rem] border border-teal-700 bg-gradient-to-br from-teal-800 to-slate-950 p-7 shadow-[0_24px_70px_rgba(15,118,110,0.24)] transition hover:-translate-y-1" : "rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_55px_rgba(15,23,42,0.07)] transition hover:-translate-y-1";
  if ("href" in item && item.href) return <Link href={item.href} className={className}>{content}</Link>;
  return <article className={className}>{content}</article>;
}

export function DimproPublicLanding() {
  const [linked, setLinked] = useState(false);
  const [showCodeCard, setShowCodeCard] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [, setBrandTapCount] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DEMO_STORAGE_KEY) === "1") {
        setLinked(true);
      }
    } catch {
      // Ha a böngésző tiltja a localStorage-t, a bemutató nézet csak az aktuális munkamenetben marad aktív.
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && showCodeCard) {
        setShowCodeCard(false);
        setCode("");
        setCodeError("");
        return;
      }
      if (event.ctrlKey && event.altKey && event.key === "0") {
        event.preventDefault();
        if (linked) {
          setLinked(false);
          try {
            window.localStorage.removeItem(DEMO_STORAGE_KEY);
          } catch {
            // Nincs teendő, ha a böngésző nem engedi a localStorage törlést.
          }
          setShowCodeCard(false);
          setCode("");
          setCodeError("");
          return;
        }
        setShowCodeCard(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [linked, showCodeCard]);

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim() === DEMO_CODE) {
      setLinked(true);
      try {
        window.localStorage.setItem(DEMO_STORAGE_KEY, "1");
      } catch {
        // Nincs teendő, ha a böngésző nem engedi a localStorage mentést.
      }
      setShowCodeCard(false);
      setCode("");
      setCodeError("");
      return;
    }
    setCodeError("Hibás hozzáférési kód.");
  }

  function openCodeFromBrandTap() {
    setBrandTapCount((current) => {
      const next = current + 1;
      if (next >= 5) {
        setShowCodeCard(true);
        setCode("");
        setCodeError("");
        return 0;
      }
      window.setTimeout(() => setBrandTapCount(0), 1600);
      return next;
    });
  }

  const cards = linked ? detailedCards : publicCards;

  return <><main className="min-h-screen overflow-hidden bg-[#f7fbf9] text-slate-950"><header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-xl"><div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-5 py-4 xl:px-10"><div onClick={openCodeFromBrandTap} className="flex cursor-pointer items-center gap-4"><Logo /><div><div className="text-2xl font-black uppercase tracking-[0.24em]">DIMPRO</div><div className="hidden text-sm font-semibold text-slate-500 md:block">digitális munkafolyamat-rendszerek vállalkozásoknak</div></div></div><div className="flex items-center gap-3">{linked ? <span className="hidden rounded-full bg-amber-50 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-700 lg:inline-flex">linkes bemutató nézet</span> : null}<Link href="https://license.dimpro.hu/customer" className="inline-flex items-center gap-2 rounded-2xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm font-black text-teal-800 hover:bg-lime-100"><UserCircle2 size={18} /> Ügyfélfelület</Link></div></div></header><section className="relative border-b border-slate-200/70 bg-white"><div className="absolute inset-0 opacity-[0.24] [background-image:linear-gradient(rgba(20,184,166,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.12)_1px,transparent_1px)] [background-size:58px_58px]" /><div className="relative mx-auto grid max-w-[1680px] gap-10 px-6 py-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] xl:px-10 xl:py-16"><div className="flex flex-col justify-center"><p className="mb-7 inline-flex w-fit rounded-full border border-lime-200 bg-lime-50 px-4 py-2 text-sm font-black text-teal-800 shadow-sm">Fejlesztés alatt álló DIMPRO modulok</p><h1 className="max-w-[660px] break-words text-[32px] font-black leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-[38px] md:text-[44px] xl:text-[50px]">Kisebb digitális appok napi munkafolyamatokra.</h1><p className="mt-6 max-w-[720px] text-base font-semibold leading-7 text-slate-600 sm:text-lg md:leading-8">{linked ? "A linkes bemutató nézetben a jelenlegi fejlesztési irányok konkrétabb kártyái is láthatók." : "Üzleti, műszaki és vállalati munkafolyamatokat támogató digitális segédprogramok előkészítése."}</p><div className="mt-8 flex flex-col gap-4 sm:flex-row md:mt-10"><Link href="https://license.dimpro.hu/customer" className="inline-flex items-center justify-center gap-3 rounded-2xl bg-teal-700 px-6 py-4 text-base font-black text-white shadow-[0_18px_42px_rgba(15,118,110,0.25)] hover:bg-teal-800">Ügyfélfelület <ArrowRight size={20} /></Link><Link href="mailto:info@dimpro.hu?subject=DIMPRO modul ötlet" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-4 text-base font-black text-slate-900 shadow-sm hover:bg-slate-50">Modulötlet beküldése</Link></div><div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-slate-500 md:mt-10 md:gap-x-6"><span className="inline-flex items-center gap-2"><ShieldCheck size={18} className="text-lime-500" /> Fejlesztés alatt</span><span className="inline-flex items-center gap-2"><Target size={18} className="text-lime-500" /> Célzott appok</span><span className="inline-flex items-center gap-2"><LockKeyhole size={18} className="text-lime-500" /> Kódvédett bemutató</span></div></div><div className="relative flex items-center justify-center"><div className="w-full max-w-[560px] rounded-[2.25rem] border border-lime-200 bg-white/92 p-6 shadow-[0_24px_80px_rgba(15,118,110,0.14)] backdrop-blur md:p-8"><div className="mb-6 flex items-center gap-4"><Logo /><div><div className="text-3xl font-black uppercase tracking-[0.20em] text-slate-950">DIMPRO</div><p className="mt-2 text-sm font-bold leading-6 text-slate-500">{linked ? "Linkes bemutató nézet" : "Nyilvános fejlesztési bemutatkozó oldal"}</p></div></div><div className="grid gap-3">{cards.map((item) => { const Icon = item.icon; const live = "live" in item && item.live; const targetHref = "href" in item ? item.href : undefined; const className = live ? "flex gap-4 rounded-2xl border border-teal-700 bg-gradient-to-br from-teal-800 to-slate-950 p-4 text-white transition hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,118,110,0.20)]" : "flex gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:bg-white hover:shadow-[0_18px_46px_rgba(15,23,42,0.08)]"; const content = <><span className={live ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lime-200" : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lime-100 text-teal-700"}><Icon size={27} /></span><span><span className="block text-sm font-black">{item.title}</span><span className={live ? "mt-1 block text-xs font-black uppercase tracking-[0.13em] text-lime-200" : "mt-1 block text-xs font-black uppercase tracking-[0.13em] text-teal-700"}>{item.status}</span>{targetHref ? <span className={live ? "mt-2 inline-flex items-center gap-2 text-xs font-black text-lime-200" : "mt-2 inline-flex items-center gap-2 text-xs font-black text-teal-700"}>Megnyitás <ArrowRight size={14} /></span> : null}</span></>; return targetHref ? <Link key={item.title} href={targetHref} className={className}>{content}</Link> : <div key={item.title} className={className}>{content}</div>; })}</div></div></div></div></section><section id="fejlesztesek" className={linked ? "mx-auto grid max-w-[1680px] gap-7 px-6 py-10 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 xl:px-10" : "mx-auto grid max-w-[1680px] gap-7 px-6 py-10 md:grid-cols-3 xl:px-10"}>{cards.map((item) => <Card key={item.title} item={item} />)}</section><section className="mx-auto max-w-[1680px] px-6 pb-12 xl:px-10"><div className="grid gap-7 lg:grid-cols-[1fr_1.35fr]"><div className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_55px_rgba(15,23,42,0.07)]"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-lime-100 text-teal-700"><Lightbulb size={33} /></div><h3 className="text-xl font-black text-slate-950">Van jó ötleted?</h3><p className="mt-4 text-sm font-semibold leading-7 text-slate-600">Ha hiányzik egy modul a saját munkafolyamatodhoz, írd meg nekünk, és lehet, hogy a következő DIMPRO app pont erre épül.</p><Link href="mailto:info@dimpro.hu?subject=DIMPRO modul ötlet" className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-teal-700 px-5 py-3 text-sm font-black text-white hover:bg-teal-800">Ötlet beküldése <ArrowRight size={18} /></Link></div><div className="rounded-[1.75rem] border border-lime-200 bg-lime-50 p-7 shadow-[0_18px_55px_rgba(15,23,42,0.06)]"><h3 className="text-2xl font-black tracking-[-0.03em] text-teal-700">Hamarosan induló DIMPRO fejlesztések</h3><p className="mt-3 text-sm font-black leading-7 text-teal-900">A DIMPRO jelenleg fejlesztési időszakban van. A nyilvános oldalon csak a fő irányok láthatók, részletes belső ütemezés és fejlesztői hivatkozások nélkül.</p><div className="mt-7 grid gap-3 text-sm font-semibold text-slate-700 md:grid-cols-3"><span className="inline-flex items-center gap-2"><MessageCircle size={20} className="text-teal-700" /> Modulötlet fogadás</span><span className="inline-flex items-center gap-2"><ShieldCheck size={20} className="text-lime-500" /> Visszafogott nyilvános tartalom</span><span className="inline-flex items-center gap-2"><UserCircle2 size={20} className="text-teal-700" /> Aktív ügyfélfelület</span></div></div></div></section></main>{showCodeCard ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-5 backdrop-blur-sm"><form onSubmit={submitCode} className="w-full max-w-md rounded-[2rem] border border-lime-200 bg-white p-7 shadow-[0_30px_100px_rgba(15,23,42,0.24)]"><div className="mb-5 flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-lime-100 text-teal-700"><LockKeyhole size={30} /></div><div><h2 className="text-2xl font-black tracking-[-0.03em] text-slate-950">Bemutató nézet megnyitása</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Add meg a hozzáférési kódot a részletesebb, linkes bemutató felület megjelenítéséhez.</p></div></div><label className="text-xs font-black uppercase tracking-[0.15em] text-teal-700" htmlFor="dimpro-demo-code">Hozzáférési kód</label><input id="dimpro-demo-code" type="password" value={code} onChange={(event) => { setCode(event.target.value); setCodeError(""); }} autoFocus inputMode="numeric" autoComplete="off" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-lg font-black tracking-[0.18em] text-slate-950 outline-none transition focus:border-lime-400 focus:bg-white focus:ring-4 focus:ring-lime-100" placeholder="••••••" />{codeError ? <p className="mt-3 text-sm font-black text-red-600">{codeError}</p> : null}<div className="mt-6 flex flex-col gap-3 sm:flex-row"><button type="submit" className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 py-4 text-sm font-black text-white shadow-[0_16px_42px_rgba(15,118,110,0.20)] hover:bg-teal-800">Megnyitás <ArrowRight size={18} /></button><button type="button" onClick={() => { setShowCodeCard(false); setCode(""); setCodeError(""); }} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-800 hover:bg-slate-50">Mégsem</button></div></form></div> : null}</>;
}
