"use client";

import { BookOpenText, ChevronRight, HelpCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

const helpByPath: Record<string, { title: string; intro: string; steps: string[] }> = {
  "/": {
    title: "Kezdőlap használata",
    intro: "A kezdőlapon a napi projektállapot, sürgős teendők, gyorslinkek és ütemezési áttekintő jelenik meg.",
    steps: [
      "A felső keresővel projektre, dokumentumra és jegyzőkönyvre lehet keresni.",
      "A kedvenc munkalinkekből külső rendszerek vagy belső modulok nyithatók.",
      "A kártyák az aktuális projektterhelést és a következő határidőket mutatják.",
      "A Fókuszkép Ctrl+Alt+F billentyűvel vagy 8 perc inaktivitás után nyílik meg.",
    ],
  },
  "/dashboard": {
    title: "Kezdőlap használata",
    intro: "A kezdőlapon a napi projektállapot, sürgős teendők, gyorslinkek és ütemezési áttekintő jelenik meg.",
    steps: [
      "A felső keresővel projektre, dokumentumra és jegyzőkönyvre lehet keresni.",
      "A kedvenc munkalinkekből külső rendszerek vagy belső modulok nyithatók.",
      "A kártyák az aktuális projektterhelést és a következő határidőket mutatják.",
      "A Fókuszkép Ctrl+Alt+F billentyűvel vagy 8 perc inaktivitás után nyílik meg.",
    ],
  },
  "/projektek": {
    title: "Projektek modul",
    intro: "Itt lehet projektet megnyitni, státuszt ellenőrizni és projektadatokat rendezni.",
    steps: ["Válassz projektet a listából.", "Ellenőrizd az előrehaladást és a státuszt.", "A kapcsolódó dokumentumokat és feladatokat a jobb oldali panel segíti."],
  },
  "/utemezes": {
    title: "Ütemezés modul",
    intro: "Az ütemterv feladatok, határidők és függőségek kezelésére szolgál.",
    steps: ["Hozz létre munkafázist vagy részfeladatot.", "Állítsd be a kezdő- és záródátumot.", "A függőségekkel megadható, mi mi után következik."],
  },
};

const fallbackHelp = {
  title: "Oldal súgó",
  intro: "Az aktuális oldalhoz tartozó rövid munkafolyamat-leírás itt jelenik meg.",
  steps: ["Olvasd át a fő mezőket.", "A jobb alsó gyorsikonok munka közben nyitva tarthatók.", "A későbbi fejlesztésben oldalanként részletes leírás kapcsolható ide."],
};

export default function ContextHelpFloating() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const help = useMemo(() => helpByPath[pathname || "/"] ?? fallbackHelp, [pathname]);

  return (
    <div className="fixed bottom-7 right-[16.5rem] z-[10000] hidden lg:block">
      {open ? (
        <div className="mb-3 w-[380px] rounded-2xl border border-sky-200 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <BookOpenText size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-950">{help.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{help.intro}</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Súgó bezárása">
              <X size={17} />
            </button>
          </div>
          <div className="grid gap-2">
            {help.steps.map((step) => (
              <div key={step} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                <ChevronRight size={15} className="mt-0.5 shrink-0 text-sky-500" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-300 bg-blue-600 text-white shadow-xl shadow-slate-900/20 hover:bg-blue-500"
        title="Oldal súgó / munkafolyamat magyarázat"
      >
        <HelpCircle size={24} />
      </button>
    </div>
  );
}
