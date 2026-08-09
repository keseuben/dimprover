"use client";

import { useRef } from "react";

export default function DropSixDigitCodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  label = "Hatjegyű kód",
  tone = "cyan",
  autoFocus = false,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  label?: string;
  tone?: "cyan" | "amber" | "teal";
  autoFocus?: boolean;
  id?: string;
}) {
  const lastCompletedRef = useRef("");
  const border = tone === "amber"
    ? "border-amber-300 focus:border-amber-500 focus:ring-amber-100"
    : tone === "teal"
      ? "border-teal-300 focus:border-teal-600 focus:ring-teal-100"
      : "border-cyan-300 focus:border-cyan-600 focus:ring-cyan-100";

  function update(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, 6);
    if (next.length < 6) lastCompletedRef.current = "";
    onChange(next);
    if (next.length === 6 && next !== lastCompletedRef.current && onComplete) {
      lastCompletedRef.current = next;
      window.setTimeout(() => onComplete(next), 0);
    }
  }

  return (
    <label className="block min-w-0 flex-1" htmlFor={id}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.1em] text-slate-600">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(event) => update(event.target.value)}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (/\d/.test(pasted)) {
            event.preventDefault();
            update(pasted);
          }
        }}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        enterKeyHint="done"
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={6}
        aria-describedby={id ? `${id}-hint` : undefined}
        className={`min-h-14 w-full rounded-xl border bg-white px-5 py-3 text-center text-2xl font-black tracking-[0.38em] text-slate-950 outline-none transition focus:ring-4 disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-500 ${border}`}
        placeholder="000000"
      />
      <span id={id ? `${id}-hint` : undefined} className="mt-1.5 block text-[11px] font-semibold leading-5 text-slate-500">
        A hatodik számjegy után az ellenőrzés automatikusan elindul.
      </span>
    </label>
  );
}
