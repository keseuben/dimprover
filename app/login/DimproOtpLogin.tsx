"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock3, LockKeyhole, Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";
import DimproMotionBackdrop from "@/components/layout/DimproMotionBackdrop";

type MessageTone = "neutral" | "success" | "error";

const accessStates = [
  "Fejlesztés alatt",
  "Tesztüzem",
  "Korlátozott hozzáférés",
  "Előfizetői hozzáférés",
];

function getFriendlyAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("nem jogosult") || normalized.includes("nincs engedélyezve") || normalized.includes("naplóztuk")) {
    return "Ez az e-mail cím jelenleg nincs engedélyezve a DIMPRO használatára. A próbálkozást naplóztuk.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Túl sok kódkérés történt rövid időn belül. Várj néhány percet, majd próbáld újra.";
  }

  if (normalized.includes("invalid") || normalized.includes("expired") || normalized.includes("token")) {
    return "A belépési kód hibás vagy lejárt. Kérj új kódot.";
  }

  if (normalized.includes("email")) {
    return "Az e-mail küldése nem sikerült. Ellenőrizd a címet, majd próbáld újra.";
  }

  return "A belépési művelet nem sikerült. Próbáld újra néhány perc múlva.";
}

export function DimproOtpLogin() {
  const router = useRouter();
  const codeInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("Add meg az e-mail címedet, és küldünk egy egyszer használatos belépési kódot.");
  const [messageTone, setMessageTone] = useState<MessageTone>("neutral");

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();
  const canSendCode = cleanEmail.includes("@") && cleanEmail.length > 5 && !loading && cooldown === 0;
  const canLogin = codeSent && cleanCode.length === 6 && !loading;

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("dimpro_last_login_email");
    if (savedEmail) setEmail(savedEmail);
    const params = new URLSearchParams(window.location.search);
    if (params.get("access") === "blocked") {
      setMessageTone("error");
      setMessage("Ez a bejelentkezett fiók jelenleg nincs engedélyezve a DIMPRO használatára.");
    }
  }, []);

  useEffect(() => {
    if (!codeSent) return;
    codeInputRef.current?.focus();
  }, [codeSent]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    if (!canSendCode) return;

    setLoading(true);
    setMessageTone("neutral");
    setMessage("Belépési kód küldése...");

    const response = await fetch("/api/dimpro-auth/request-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: cleanEmail }),
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    setLoading(false);

    if (!response.ok || !data?.ok) {
      setMessageTone("error");
      setMessage(data?.error ? getFriendlyAuthError(data.error) : "A belépési kód küldése nem sikerült.");
      return;
    }

    window.localStorage.setItem("dimpro_last_login_email", cleanEmail);
    setCodeSent(true);
    setCode("");
    setCooldown(60);
    setMessageTone("success");
    setMessage("A hatjegyű belépési kódot elküldtük. Nézd meg a Beérkezett, Promóciók és Spam mappát is.");
    window.setTimeout(() => codeInputRef.current?.focus(), 80);
  }

  async function loginWithCode(codeOverride?: string) {
    const tokenCode = (codeOverride ?? cleanCode).trim();
    if (!codeSent || tokenCode.length !== 6 || loading) return;

    setLoading(true);
    setMessageTone("neutral");
    setMessage("Belépési kód ellenőrzése...");

    const response = await fetch("/api/dimpro-auth/verify-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, token: tokenCode }),
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    setLoading(false);

    if (!response.ok || !data?.ok) {
      setMessageTone("error");
      setMessage(data?.error ? getFriendlyAuthError(data.error) : "Hibás vagy lejárt belépési kód.");
      return;
    }

    const now = Date.now().toString();
    window.localStorage.setItem("dimpro_login_started_at", now);
    window.localStorage.setItem("dimprover_login_started_at", now);
    window.localStorage.setItem("dimpro_last_login_email", cleanEmail);

    setMessageTone("success");
    setMessage("Sikeres belépés. A DIMPRO modulválasztó megnyitása...");
    router.push("/account/modules");
    router.refresh();
  }

  function changeEmail() {
    setCodeSent(false);
    setCode("");
    setCooldown(0);
    setMessageTone("neutral");
    setMessage("Add meg az e-mail címedet, és küldünk egy egyszer használatos belépési kódot.");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f2f8f7] text-slate-900">
      <div className="absolute inset-0 dimpro-architect-grid opacity-65" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(13,148,136,0.18),transparent_31%),radial-gradient(circle_at_86%_74%,rgba(34,197,94,0.10),transparent_36%)]" />
      <div className="absolute inset-y-0 left-0 hidden w-[41%] bg-[linear-gradient(135deg,#061814,#04201b_52%,#03100e)] lg:block" />
      <div className="absolute left-0 top-0 hidden h-full w-[41%] opacity-70 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(20,184,166,0.25),transparent_32%),linear-gradient(112deg,transparent_0_38%,rgba(45,212,191,0.10)_38.2%,transparent_39%_100%),linear-gradient(28deg,transparent_0_62%,rgba(132,204,22,0.08)_62.2%,transparent_63%_100%)]" />
      </div>

      <section className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="flex min-h-[38vh] flex-col px-8 py-8 text-white lg:min-h-screen lg:px-12 lg:py-10">
          <div className="flex flex-col items-start gap-3">
            <Image
              src="/dimpro-icon.svg"
              alt="DIMPRO"
              width={132}
              height={132}
              priority
              className="h-28 w-28 object-contain drop-shadow-[0_0_42px_rgba(45,212,191,0.58)] md:h-32 md:w-32"
            />
            <div>
              <div className="text-lg font-bold tracking-[0.24em] text-white">DIMPRO</div>
              <div className="mt-2 text-[12px] uppercase tracking-[0.20em] text-teal-100/75">
                Digitális műszaki projektvezérlő rendszer
              </div>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center text-center lg:items-start lg:text-left">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-teal-100/70">
              Egy fiók · több DIMPRO modul
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
              Egyszerű belépés<br />
              biztonságos e-mail-kóddal
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300 md:text-base">
              Nem kell külön regisztrációs űrlap vagy kötelező jelszó. Az első kódkérés automatikusan létrehozza a DIMPRO-fiókot.
            </p>

            <div className="mt-8 w-full max-w-md px-1 py-3">
              <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-2">
                <div className="absolute left-[12.5%] right-[12.5%] top-4 hidden h-px bg-gradient-to-r from-teal-300/55 via-white/16 to-white/8 sm:block" />
                {accessStates.map((state, index) => (
                  <div key={state} className="relative flex flex-row items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
                    <div className={index === 0 ? "relative z-10 h-3 w-3 rounded-full border border-teal-100 bg-teal-300 shadow-[0_0_18px_rgba(45,212,191,0.65)]" : "relative z-10 h-2.5 w-2.5 rounded-full border border-slate-500/55 bg-slate-800/80"} />
                    <div className={index === 0 ? "text-left text-xs font-semibold uppercase tracking-[0.13em] text-teal-100 sm:text-center" : "text-left text-xs font-medium uppercase tracking-[0.11em] text-slate-500 sm:text-center"}>
                      {state}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center overflow-hidden bg-transparent px-6 py-10 lg:px-12">
          <DimproMotionBackdrop mode="login" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(240,253,250,0.55),rgba(236,253,245,0.38))]" />

          <div className="relative z-10 w-full max-w-xl">
            <div className="mb-7 rounded-[2rem] border border-teal-100/90 bg-white/74 p-5 shadow-[0_24px_90px_rgba(15,118,110,0.13)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">DIMPRO belépés</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    Belépés a modulokhoz
                  </h2>
                </div>
                <div className="rounded-2xl bg-teal-50 p-3 text-teal-700 ring-1 ring-teal-100">
                  <LockKeyhole className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-teal-100/90 bg-white/80 p-6 shadow-[0_30px_100px_rgba(15,118,110,0.15)] backdrop-blur-2xl md:p-8">
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-600">E-mail cím</span>
                  <div className="flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-[#f8fbfa] px-4 shadow-inner shadow-slate-200/50 transition focus-within:border-teal-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-teal-100">
                    <Mail className="h-5 w-5 text-teal-600" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (codeSent) changeEmail();
                        else {
                          setMessageTone("neutral");
                          setMessage("Add meg az e-mail címedet, és küldünk egy egyszer használatos belépési kódot.");
                        }
                      }}
                      placeholder="nev@ceg.hu"
                      className="w-full bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
                      autoComplete="email"
                      disabled={loading}
                    />
                    {codeSent ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                  </div>
                </label>

                <button
                  type="button"
                  onClick={sendCode}
                  disabled={!canSendCode}
                  className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_42px_rgba(13,148,136,0.30)] transition hover:scale-[1.01] hover:from-teal-600 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {cooldown > 0 ? <Clock3 className="h-5 w-5" /> : codeSent ? <RefreshCw className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                  {loading && !codeSent ? "Küldés..." : cooldown > 0 ? `Újraküldés ${cooldown} mp múlva` : codeSent ? "Új kód küldése" : "Kód küldése"}
                </button>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-1">
                  <div className="h-px bg-slate-200" />
                  <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">
                    6 számjegy
                  </span>
                  <div className="h-px bg-slate-200" />
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-600">Belépési kód</span>
                  <div className={codeSent ? "relative rounded-2xl border border-teal-200/90 bg-white/86 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_14px_34px_rgba(13,148,136,0.10)] transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100" : "relative rounded-2xl border border-slate-200 bg-[#f8fbfa] p-3 opacity-55 shadow-inner shadow-slate-200/50"}>
                    <input
                      ref={codeInputRef}
                      type="text"
                      value={code}
                      onChange={(event) => {
                        const nextCode = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setCode(nextCode);
                        setMessageTone("neutral");
                        if (codeSent && nextCode.length === 6 && !loading) {
                          window.setTimeout(() => loginWithCode(nextCode), 80);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canLogin) void loginWithCode();
                      }}
                      aria-label="Hatjegyű belépési kód"
                      className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-teal-600 outline-none selection:bg-transparent"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      disabled={!codeSent || loading}
                    />
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: 6 }).map((_, index) => {
                        const digit = code[index];
                        const active = codeSent && index === Math.min(code.length, 5);
                        return (
                          <div key={index} className={active ? "flex h-12 items-center justify-center rounded-xl border border-teal-400 bg-teal-50 text-xl font-bold text-slate-950 shadow-[0_0_0_4px_rgba(13,148,136,0.10)]" : "flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-xl font-bold text-slate-950"}>
                            {digit || <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => void loginWithCode()}
                  disabled={!canLogin}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-900/10 bg-[#06231d] text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_42px_rgba(6,35,29,0.24)] transition hover:bg-[#0a342b] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {loading && codeSent ? "Belépés..." : "Belépés"}
                  <ArrowRight className="h-5 w-5" />
                </button>

                <div className={messageTone === "error" ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-800" : messageTone === "success" ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800" : "rounded-2xl border border-teal-100 bg-teal-50/80 px-4 py-3 text-center text-sm font-medium text-teal-800"}>
                  {message}
                </div>

                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/86 p-4 sm:grid-cols-2">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Jelszó nélküli belépés</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Nincs elfelejthető vagy újrahasznált jelszó.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Egyszer használatos kód</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">A kód rövid ideig érvényes és csak egyszer használható.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-4 text-xs leading-5 text-slate-500">
                  <p className="font-semibold text-slate-700">© 2026 DIMPRO.hu – Minden jog fenntartva.</p>
                  <p className="mt-1">A használat érvényes DIMPRO-hozzáféréshez és jogosultsághoz köthető.</p>
                </div>
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-slate-500">
              DIMPRO · egyszer használatos e-mail-kódos belépés · közös modulaccount
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
