"use client";

type EventLoginProps = {
  code: string;
  error: string;
  onCodeChange: (value: string) => void;
  onUnlock: () => void;
};

export default function EventLogin({ code, error, onCodeChange, onUnlock }: EventLoginProps) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 px-4 py-10 text-slate-800">
      <section className="mx-auto flex min-h-[82vh] max-w-md items-center">
        <div className="w-full rounded-[32px] border border-rose-200 bg-white/90 p-6 shadow-xl shadow-rose-100">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-500">DIMPRO Eseményszervező</p>
          <h1 className="mt-4 text-3xl font-black text-slate-800">Titkos családi esemény</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Add meg a meghívóban kapott belépési kódot. A szervezői belépéshez külön szervezői kód szükséges.
          </p>

          <label className="mt-6 block text-sm font-black text-slate-700">
            Belépési kód
            <input
              value={code}
              onChange={(event) => onCodeChange(event.target.value.trim())}
              onKeyDown={(event) => event.key === "Enter" && onUnlock()}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              type="text"
              maxLength={32}
              aria-label="Belépési kód"
              className="mt-2 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-left text-base font-bold text-slate-800 outline-none focus:border-rose-400 focus:bg-white"
              placeholder="Belépési kód"
            />
          </label>

          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          <button onClick={onUnlock} className="mt-4 w-full rounded-2xl bg-rose-400 p-4 font-black text-white transition hover:bg-rose-500">Belépés</button>
          <p className="mt-4 text-xs leading-5 text-slate-500">Ez egy házon belüli, közvetlen linken elérhető családi szervezőoldal. Kérlek, Mama és Apu előtt maradjon titokban.</p>
        </div>
      </section>
    </main>
  );
}