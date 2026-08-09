"use client";

import { Check, Image as ImageIcon } from "lucide-react";
import {
  DROP_IMAGE_SIZE_PRESETS,
  type DropImageSizePreset,
} from "./dropUploadPreparation";

const orderedPresets: DropImageSizePreset[] = ["large", "medium", "small", "original"];

export default function DropImageSizeSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  recommendedPreset = "medium",
  preserveMetadata = false,
}: {
  value: DropImageSizePreset;
  onChange: (value: DropImageSizePreset) => void;
  disabled?: boolean;
  compact?: boolean;
  recommendedPreset?: DropImageSizePreset;
  preserveMetadata?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700">
        <ImageIcon size={15} aria-hidden="true" /> Képméret
      </legend>
      <div className={`mt-2 grid gap-2 ${compact ? "grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
        {orderedPresets.map((preset) => {
          const option = DROP_IMAGE_SIZE_PRESETS[preset];
          const selected = value === preset;
          const presetDisabled = disabled || (preserveMetadata && preset !== "original");
          return (
            <label
              key={preset}
              className={`relative cursor-pointer rounded-xl border px-3 py-3 transition ${selected ? "border-cyan-600 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-300"} ${presetDisabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="drop-image-size-preset"
                value={preset}
                checked={selected}
                disabled={presetDisabled}
                onChange={() => onChange(preset)}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2"><strong className={`text-sm ${selected ? "text-cyan-950" : "text-slate-950"}`}>{option.label}</strong>{recommendedPreset === preset ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-800">Ajánlott</span> : null}</span>
                {selected ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-700 text-white"><Check size={12} aria-hidden="true" /></span> : null}
              </span>
              <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-slate-600">{option.description}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">{preserveMetadata ? "GPS/EXIF megőrzésekor a rendszer az eredeti fájlt tartja meg, ezért a méretcsökkentett fokozatok nem választhatók." : "A Nagy, Közepes és Kicsi mód a kiválasztott metaadat-szabály szerint készül."}</p>
    </fieldset>
  );
}
