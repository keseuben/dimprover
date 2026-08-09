"use client";

import { useState } from "react";
import { EventTextarea } from "./EventShell";

type AiIntroAssistantProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  onApply: () => void;
};

export default function AiIntroAssistant({ description, onDescriptionChange, onApply }: AiIntroAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="rounded-[28px] border border-sky-100 bg-white/90 p-5 shadow-md shadow-sky-100/60">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <h2 className="text-xl font-black text-slate-800">AI szövegjavaslat</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Rövid eseményleírás alapján javaslat készülhet a felső szövegre és idézetre.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-sky-100 px-3 py-1 text-sm font-black text-sky-700">
          {isOpen ? "Bezár" : "Megnyit"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-5 border-t border-sky-100 pt-5">
          <EventTextarea label="Esemény rövid leírása" value={description} onChange={onDescriptionChange} rows={5} />
          <button onClick={onApply} className="mt-4 w-full rounded-2xl bg-sky-400 px-5 py-3 font-black text-white transition hover:bg-sky-500">
            AI javaslat készítése
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Ez most házon belüli MVP: a szövegjavaslat helyi sablon alapján készül. Később valódi szerveroldali AI API-ra köthető.
          </p>
        </div>
      )}
    </section>
  );
}