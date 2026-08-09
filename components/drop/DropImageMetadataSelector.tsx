"use client";

import { Check, MapPin, MapPinOff } from "lucide-react";
import type { DropImageMetadataPolicy } from "./dropUploadPreparation";

export default function DropImageMetadataSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: DropImageMetadataPolicy;
  onChange: (value: DropImageMetadataPolicy) => void;
  disabled?: boolean;
}) {
  const options: Array<{
    value: DropImageMetadataPolicy;
    title: string;
    description: string;
    recommended?: boolean;
    icon: typeof MapPin;
  }> = [
    {
      value: "strip",
      title: "GPS-adatok törlése",
      description: "A helyadatok és az EXIF-metaadatok eltávolításra kerülnek.",
      recommended: true,
      icon: MapPinOff,
    },
    {
      value: "preserve",
      title: "GPS-adatok megőrzése",
      description: "A rendszer az eredeti fájlt tartja meg; méretcsökkentés nem alkalmazható biztonságosan.",
      icon: MapPin,
    },
  ];

  return (
    <fieldset disabled={disabled}>
      <legend className="text-xs font-black uppercase tracking-[0.12em] text-slate-700">Helyadatok és metaadatok</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <label key={option.value} className={`cursor-pointer rounded-xl border p-3 transition ${selected ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white hover:border-cyan-300"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
              <input type="radio" name="drop-image-metadata-policy" value={option.value} checked={selected} onChange={() => onChange(option.value)} className="sr-only" />
              <span className="flex items-start gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-cyan-700 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={17} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">{option.title}</strong>{option.recommended ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-800">Ajánlott</span> : null}</span>
                  <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-600">{option.description}</span>
                </span>
                {selected ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-700 text-white"><Check size={12} aria-hidden="true" /></span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
