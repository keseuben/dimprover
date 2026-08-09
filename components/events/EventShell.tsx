type EventShellProps = {
  children: React.ReactNode;
};

type EventPanelProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

type EventInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
};

export function EventShell({ children }: EventShellProps) {
  return <main className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 text-slate-800">{children}</main>;
}

export function EventPanel({ title, description, children }: EventPanelProps) {
  return (
    <section className="rounded-[28px] border border-rose-100 bg-white/90 p-5 shadow-md shadow-rose-100/60">
      <h2 className="text-xl font-black text-slate-800">{title}</h2>
      {description && <p className="mb-5 mt-1 text-sm leading-6 text-slate-500">{description}</p>}
      {children}
    </section>
  );
}

export function EventInput({ label, value, onChange, type = "text" }: EventInputProps) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
      />
    </label>
  );
}

export function EventTextarea({ label, value, onChange, rows = 3 }: EventInputProps & { rows?: number }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
      />
    </label>
  );
}