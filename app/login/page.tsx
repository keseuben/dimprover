"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  LockKeyhole,
  Send,
  HelpCircle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
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
        shouldCreateUser: false,
      },
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setCodeSent(true);
    setMessage("Belépési kód elküldve.");
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
      setMessage("Hibás vagy lejárt belépési kód.");
      return;
    }

    localStorage.setItem(
      "dimprover_login_started_at",
      Date.now().toString()
    );

    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] px-6 text-white">
      {/* Háttér glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_50%,rgba(0,122,255,0.22),transparent_26%),radial-gradient(circle_at_75%_35%,rgba(37,99,235,0.16),transparent_28%)]" />

      {/* Sötét overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.98),rgba(2,6,23,0.97))]" />

      {/* Blueprint grid */}
      <div className="absolute inset-0 opacity-[0.06]">
        <div className="h-full w-full bg-[linear-gradient(to_right,#2563eb_1px,transparent_1px),linear-gradient(to_bottom,#2563eb_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <section className="relative grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        {/* BAL OLDALI EMBLÉMA */}
        <div className="flex justify-center lg:justify-start">
          <div className="relative -mt-32 flex flex-col items-center justify-center">
            <div className="absolute h-[40rem] w-[40rem] rounded-full bg-blue-500/25 blur-[140px]" />

            <img
              src="/dimprover-logo.png"
              alt=""
              className="relative h-[28rem] w-[28rem] object-contain drop-shadow-[0_0_120px_rgba(0,122,255,1)]"
            />

            {/* FEJLESZTÉSI ÁLLAPOT */}
            <div className="relative -mt-20 flex flex-col items-center gap-3">
              <div className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-5 py-2 text-sm font-medium text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                Zárt fejlesztési fázis
              </div>

              <div className="h-5 w-px bg-slate-600/80" />

              <div className="rounded-full border border-slate-600 bg-slate-800/40 px-5 py-2 text-sm font-medium text-slate-400">
                Tesztüzem
              </div>

              <div className="h-5 w-px bg-slate-600/80" />

              <div className="rounded-full border border-slate-600 bg-slate-800/40 px-5 py-2 text-sm font-medium text-slate-400">
                Korai hozzáférés
              </div>
            </div>
          </div>
        </div>

        {/* LOGIN PANEL */}
        <div className="flex justify-center">
          <div className="relative w-full max-w-xl rounded-[2rem] border border-blue-400/40 bg-slate-950/55 p-10 shadow-[0_0_70px_rgba(37,99,235,0.22)] backdrop-blur-xl">
            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-blue-500/10 via-transparent to-blue-900/10" />

            <div className="relative space-y-7">
              {/* EMAIL */}
              <div className="flex h-16 items-center gap-4 rounded-xl border border-blue-400/35 bg-slate-950/60 px-5 shadow-inner shadow-blue-950/30 focus-within:border-blue-400">
                <Mail className="h-7 w-7 text-blue-400" />

                <div className="h-8 w-px bg-blue-400/40" />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-transparent text-lg text-white outline-none placeholder:text-slate-600"
                  autoComplete="email"
                />
              </div>

              {/* KÓD KÜLDÉS */}
              <button
                onClick={sendCode}
                disabled={loading || !email}
                className="flex h-16 w-full items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_0_35px_rgba(37,99,235,0.45)] transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading && !codeSent ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <Send className="h-8 w-8" />
                )}
              </button>

              {/* ELVÁLASZTÓ */}
              <div className="flex items-center gap-5 py-1">
                <div className="h-px flex-1 bg-blue-400/25" />
                <div className="h-px w-8 bg-blue-400/70" />
                <div className="h-px flex-1 bg-blue-400/25" />
              </div>

              {/* BELÉPÉSI KÓD */}
              <div className="flex h-16 items-center gap-4 rounded-xl border border-blue-400/30 bg-slate-950/60 px-5 shadow-inner shadow-blue-950/30 focus-within:border-blue-400">
                <LockKeyhole className="h-7 w-7 text-blue-400" />

                <input
                  type="text"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  className="w-full bg-transparent text-lg tracking-[0.35em] text-white outline-none placeholder:text-slate-600"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>

              {/* BELÉPÉS */}
              <button
                onClick={loginWithCode}
                disabled={loading || !code || !codeSent}
                className="flex h-16 w-full items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_0_35px_rgba(37,99,235,0.45)] transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-25"
              >
                {loading && codeSent ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <LockKeyhole className="h-8 w-8" />
                )}
              </button>

              {/* ELFELEJTETT JELSZÓ */}
              <button
                disabled
                className="flex h-14 w-full items-center justify-between rounded-xl border border-blue-400/20 bg-slate-950/45 px-5 opacity-45"
              >
                <HelpCircle className="h-7 w-7 text-blue-300" />

                <span className="h-7 w-20 rounded-full bg-blue-900/45" />
              </button>

              {/* VISSZA */}
              <button
                disabled
                className="flex h-14 w-full items-center justify-between rounded-xl border border-blue-400/20 bg-slate-950/45 px-5 opacity-45"
              >
                <ArrowLeft className="h-7 w-7 text-blue-300" />

                <span className="h-7 w-20 rounded-full bg-blue-900/45" />
              </button>

              {/* ÜZENET */}
              {message && (
                <div className="rounded-xl border border-blue-400/25 bg-blue-500/10 px-4 py-3 text-center text-sm text-blue-100">
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}