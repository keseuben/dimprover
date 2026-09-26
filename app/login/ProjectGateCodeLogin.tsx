"use client";

import { FormEvent, useState } from "react";

type LoginResponse = {
  ok?: boolean;
  error?: string;
  next?: string;
};

export function ProjectGateCodeLogin() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/project-gate/dev-access/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json().catch(() => ({})) as LoginResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A belépés sikertelen.");
      window.location.replace(payload.next || "/projektkapu/projects");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A belépés sikertelen.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#061a2f] px-5 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center justify-center">
        <section className="w-full rounded-[28px] border border-sky-400/20 bg-[#0b2742] p-7 shadow-2xl shadow-black/30 sm:p-9">
          <div className="mb-8">
            <div className="mb-4 inline-flex rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-1 text-xs font-black uppercase tracking-[.18em] text-sky-200">
              DIMPRO Projektkapu
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">Belépés</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Add meg a 6 számjegyű Projektkapu hozzáférési kódot.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[.12em] text-slate-400">6 számjegyű kód</span>
              <input
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-2xl border border-sky-300/25 bg-[#071d32] px-5 py-5 text-center font-mono text-3xl font-black tracking-[.35em] text-white outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-300/10"
                aria-label="Projektkapu 6 számjegyű belépési kód"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full rounded-2xl bg-sky-400 px-5 py-4 text-sm font-black uppercase tracking-[.08em] text-[#061a2f] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            >
              {busy ? "Ellenőrzés…" : "Belépés a Projektkapuba"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Ideiglenes DEV/pilot belépés. A végleges Projektkapu azonosítási rendszer külön készül.
          </p>
        </section>
      </div>
    </main>
  );
}
