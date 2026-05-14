"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function sendCode() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setCodeSent(true);
    setMessage("A belépési kód elküldve az e-mail címedre.");
  }

  async function loginWithCode() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    setLoading(false);

    if (error) {
      setMessage("Hibás vagy lejárt kód.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.28),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.16),transparent_34%)]" />

      <div className="absolute inset-0 opacity-[0.08]">
        <div className="h-full w-full bg-[linear-gradient(to_right,#60a5fa_1px,transparent_1px),linear-gradient(to_bottom,#60a5fa_1px,transparent_1px)] bg-[size:42px_42px]" />
      </div>

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-blue-400/20 bg-slate-950/80 shadow-2xl shadow-blue-950/40 backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden border-r border-blue-400/10 bg-slate-950/60 p-10 lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/10">
              <ShieldCheck className="h-6 w-6 text-blue-300" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[0.28em] text-blue-300">
                DIMPROVER
              </p>
              <p className="text-xs text-slate-400">
                Digitális Műszaki Projektirányítási Rendszer
              </p>
            </div>
          </div>

          <div className="mt-16">
            <p className="text-sm uppercase tracking-[0.35em] text-blue-300/80">
              Secure access
            </p>
            <h1 className="mt-5 max-w-md text-4xl font-semibold leading-tight">
              Biztonságos belépés projektvezetői környezethez.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-400">
              E-mailben küldött egyszer használatos kóddal léphetsz be a
              DIMPROVER rendszerbe. Jelszómentes, gyors és biztonságos
              azonosítás.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-blue-300">01</p>
              <p className="mt-2">E-mail megadás</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-blue-300">02</p>
              <p className="mt-2">Kód ellenőrzés</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-blue-300">03</p>
              <p className="mt-2">Belépés</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mb-8 lg:hidden">
            <p className="text-lg font-semibold tracking-[0.28em] text-blue-300">
              DIMPROVER
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Digitális Műszaki Projektirányítási Rendszer
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl sm:p-8">
            <div className="mb-7">
              <p className="text-sm uppercase tracking-[0.28em] text-blue-300">
                Kódos belépés
              </p>
              <h2 className="mt-3 text-2xl font-semibold">
                Üdvözlünk újra
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Add meg az e-mail címedet, majd írd be az e-mailben kapott
                belépési kódot.
              </p>
            </div>

            {!codeSent ? (
              <div className="space-y-4">
                <label className="text-sm text-slate-300">E-mail cím</label>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 focus-within:border-blue-400">
                  <Mail className="h-5 w-5 text-blue-300" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="pelda@email.hu"
                    className="w-full bg-transparent text-white outline-none placeholder:text-slate-600"
                  />
                </div>

                <button
                  onClick={sendCode}
                  disabled={loading || !email}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 font-medium text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-5 w-5 animate-spin" />}
                  {loading ? "Küldés..." : "Belépési kód küldése"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="text-sm text-slate-300">Belépési kód</label>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 focus-within:border-blue-400">
                  <KeyRound className="h-5 w-5 text-blue-300" />
                  <input
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Írd be a kapott kódot"
                    className="w-full bg-transparent text-white outline-none placeholder:text-slate-600"
                  />
                </div>

                <button
                  onClick={loginWithCode}
                  disabled={loading || !code}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 font-medium text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-5 w-5 animate-spin" />}
                  {loading ? "Ellenőrzés..." : "Belépés"}
                </button>

                <button
                  onClick={() => {
                    setCodeSent(false);
                    setCode("");
                    setMessage("");
                  }}
                  className="w-full rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Másik e-mail címet adok meg
                </button>
              </div>
            )}

            {message && (
              <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                {message}
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            DIMPROVER Security Access · Supabase Auth · SMTP
          </p>
        </div>
      </section>
    </main>
  );
}