"use client";

type Props = {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  badge?: string;
};

export default function CaptureToggleRow({ title, description, checked, onChange, disabled = false, badge }: Props) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-2xl border p-3.5 ${disabled ? "border-slate-200 bg-slate-50 opacity-65" : "border-slate-200 bg-white"}`}>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-sm text-slate-950">{title}</strong>
          {badge ? <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[.08em] text-cyan-800">{badge}</span> : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-6 w-6 shrink-0 accent-teal-700" />
    </label>
  );
}
