"use client";

type ResponderLoginProps = {
  name: string;
  code: string;
  error: string;
  onNameChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onContinue: () => void;
};

export default function ResponderLogin({ name, code, error, onNameChange, onCodeChange, onContinue }: ResponderLoginProps) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 px-4 py-10 text-slate-800">
      <section className="mx-auto flex min-h-[82vh] max-w-md items-center">
        <div className="w-full rounded-[32px] border border-amber-200 bg-white/90 p-6 shadow-xl shadow-amber-100">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-600">DIMPRO Eseményszervező</p>
          <h1 className="mt-4 text-3xl font-black text-slate-800">Válaszadó azonosítása</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Add meg a nevedet és egy saját, 4 számjegyű titkos kódot. Ezzel tudod később módosítani a válaszaidat.</p>
          <label className="mt-6 block text-sm font-semibold text-slate-700">Neved / család neve<input value={name} onChange={(event) => onNameChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-slate-800 outline-none focus:border-amber-400" placeholder="pl. Kati vagy Nagy család" /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Saját 4 számjegyű kód<input value={code} onChange={(event) => onCodeChange(event.target.value.slice(0, 4))} onKeyDown={(event) => event.key === "Enter" && onContinue()} inputMode="numeric" type="password" maxLength={4} className="mt-2 w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-center text-3xl font-black tracking-[0.35em] text-slate-800 outline-none focus:border-amber-400" placeholder="••••" /></label>
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          <button onClick={onContinue} className="mt-5 w-full rounded-2xl bg-amber-400 p-4 font-black text-slate-900 transition hover:bg-amber-500">Tovább az eseményhez</button>
          <p className="mt-4 text-xs leading-5 text-slate-500">A kódot jegyezd meg. Ha később újra belépsz, ugyanezzel a névvel és kóddal tudod folytatni.</p>
        </div>
      </section>
    </main>
  );
}