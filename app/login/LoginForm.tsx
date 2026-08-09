"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";

type AuthState = "idle" | "loading" | "success" | "error";
type LoginBrand = "dimpro" | "dimprover";

type LoginFormProps = {
  productName: string;
  accountName: string;
  supportEmail: string;
  brand: LoginBrand;
};

export function LoginForm({ productName, accountName, supportEmail, brand }: LoginFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [state, setState] = useState<AuthState>("idle");
  const [message, setMessage] = useState(`Add meg a ${accountName} e-mail címét és jelszavát.`);

  const cleanEmail = email.trim();
  const canSubmit = cleanEmail.includes("@") && password.length >= 6 && state !== "loading";
  const canResendConfirmation = cleanEmail.includes("@") && state !== "loading";
  const isDimprover = brand === "dimprover";
  const focusRingClass = isDimprover
    ? "focus-within:border-cyan-300 focus-within:ring-4 focus-within:ring-cyan-100"
    : "focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100";
  const primaryButtonClass = isDimprover
    ? "bg-gradient-to-r from-blue-700 to-cyan-500 shadow-[0_18px_48px_rgba(34,211,238,0.18)]"
    : "bg-gradient-to-r from-teal-700 to-emerald-600 shadow-[0_18px_48px_rgba(13,148,136,0.25)]";
  const accentTextClass = isDimprover ? "text-cyan-700 hover:text-blue-700" : "text-teal-700 hover:text-emerald-600";

  function getCurrentLoginUrl() {
    if (typeof window === "undefined") {
      return "https://dimprover.hu/login";
    }

    return `${window.location.origin}/login`;
  }

  function resetNeutralMessage() {
    setMessage(`Add meg a ${accountName} e-mail címét és jelszavát.`);
    setState("idle");
  }

  function getAuthErrorMessage(errorMessage: string) {
    const normalized = errorMessage.toLowerCase();

    if (normalized.includes("invalid login credentials")) {
      return "Sikertelen belépés. Ha most aktiváltad a fiókot, előbb erősítsd meg az e-mailben kapott linkkel. Ha nem kaptál e-mailt, nyomd meg lent a Megerősítő email újraküldése gombot.";
    }

    if (normalized.includes("email not confirmed") || normalized.includes("not confirmed")) {
      return "Az e-mail cím még nincs megerősítve. Nyisd meg a megerősítő e-mailben kapott linket, vagy kérj új megerősítő emailt az alsó gombbal.";
    }

    if (normalized.includes("user already registered") || normalized.includes("already registered")) {
      return "Ehhez az e-mail címhez már indult fiókaktiválás. Ha nem kaptál megerősítő e-mailt, használd a Megerősítő email újraküldése gombot.";
    }

    if (normalized.includes("email rate limit") || normalized.includes("rate limit")) {
      return "Túl sok e-mail kérés történt rövid időn belül. Várj néhány percet, majd próbáld újra.";
    }

    return errorMessage;
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setState("error");
      setMessage("Adj meg érvényes e-mail címet és legalább 6 karakteres jelszót.");
      return;
    }

    setState("loading");
    setMessage("Belépés ellenőrzése...");

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      setState("error");
      setMessage(getAuthErrorMessage(error.message));
      return;
    }

    if (rememberMe) {
      window.localStorage.setItem("dimpro_remember_login", "true");
    } else {
      window.localStorage.removeItem("dimpro_remember_login");
    }

    setState("success");
    setMessage(`Sikeres belépés. Átirányítás a ${productName} modulválasztóba...`);
    router.refresh();
    router.push("/account/modules");
  }

  async function handleRegister() {
    if (!canSubmit) {
      setState("error");
      setMessage("Első belépéshez add meg az e-mail címedet és egy legalább 6 karakteres új jelszót.");
      return;
    }

    setState("loading");
    setMessage(`${productName} fiók aktiválása...`);

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: getCurrentLoginUrl(),
      },
    });

    if (error) {
      setState("error");
      setMessage(getAuthErrorMessage(error.message));
      return;
    }

    setState("success");
    setMessage("Fiókaktiválás elindítva. Ha a rendszer e-mail megerősítést kér, ellenőrizd a Beérkezett, Spam/Promóciók és Levélszemét mappát. Ha nem érkezik meg, használd a Megerősítő email újraküldése gombot.");
  }

  async function handleResendConfirmation() {
    if (!canResendConfirmation) {
      setState("error");
      setMessage("Megerősítő e-mail újraküldéséhez először add meg az e-mail címedet.");
      return;
    }

    setState("loading");
    setMessage("Megerősítő email újraküldése...");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail,
      options: {
        emailRedirectTo: getCurrentLoginUrl(),
      },
    });

    if (error) {
      setState("error");
      setMessage(getAuthErrorMessage(error.message));
      return;
    }

    setState("success");
    setMessage("Megerősítő email újraküldve. Nézd meg a Beérkezett, Spam/Promóciók és Levélszemét mappát is. Néhány perc késés előfordulhat.");
  }

  async function handlePasswordReset() {
    if (!cleanEmail.includes("@")) {
      setState("error");
      setMessage("Jelszó-visszaállításhoz először add meg az e-mail címedet.");
      return;
    }

    setState("loading");
    setMessage("Jelszó-visszaállító e-mail küldése...");

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: getCurrentLoginUrl(),
    });

    if (error) {
      setState("error");
      setMessage(getAuthErrorMessage(error.message));
      return;
    }

    setState("success");
    setMessage("Jelszó-visszaállító e-mail elküldve.");
  }

  return (
    <form onSubmit={handleLogin} className="mt-9 space-y-5">
      <label className="block">
        <span className="text-base font-black text-slate-950">Email cím</span>
        <div className={`mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-inner transition ${focusRingClass}`}>
          <span className="text-2xl text-slate-500">✉</span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              resetNeutralMessage();
            }}
            placeholder="pelda@ceg.hu"
            autoComplete="email"
            className="w-full bg-transparent text-lg font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          />
        </div>
      </label>

      <label className="block">
        <span className="text-base font-black text-slate-950">Jelszó</span>
        <div className={`mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-inner transition ${focusRingClass}`}>
          <span className="text-2xl text-slate-500">▣</span>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              resetNeutralMessage();
            }}
            placeholder="••••••••••••"
            autoComplete="current-password"
            className="w-full bg-transparent text-lg font-semibold text-slate-950 outline-none placeholder:text-slate-400"
          />
          <span className="text-xl text-slate-400">◉</span>
        </div>
      </label>

      <div className="flex items-center justify-between gap-4 text-base font-semibold text-slate-600">
        <label className="flex cursor-pointer items-center gap-3">
          <button
            type="button"
            onClick={() => setRememberMe((current) => !current)}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-sm text-white ${rememberMe ? (isDimprover ? "bg-blue-700" : "bg-teal-600") : "bg-slate-300"}`}
            aria-label="Emlékezz rám kapcsoló"
          >
            ✓
          </button>
          Emlékezz rám
        </label>
        <button type="button" onClick={handlePasswordReset} className={accentTextClass}>
          Elfelejtett jelszó?
        </button>
      </div>

      <div
        className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
          state === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : state === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {message}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`flex w-full items-center justify-center gap-4 rounded-2xl px-6 py-5 text-2xl font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${primaryButtonClass}`}
      >
        {state === "loading" ? "Ellenőrzés..." : "Belépés"} <span>→</span>
      </button>

      <div className="flex items-center gap-5 py-2 text-base font-semibold text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        vagy
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className={`${isDimprover ? "border-blue-100 bg-blue-50/70" : "border-emerald-100 bg-emerald-50/70"} rounded-3xl border p-4`}>
        <p className={`${isDimprover ? "text-blue-800" : "text-emerald-800"} text-sm font-black uppercase tracking-[0.14em]`}>Nincs még jelszavad?</p>
        <p className={`${isDimprover ? "text-blue-950" : "text-emerald-900"} mt-2 text-sm font-semibold leading-6`}>
          Első belépésnél add meg az e-mail címedet és egy új jelszót, majd aktiváld a {accountName} hozzáférésedet.
        </p>
        <button
          type="button"
          onClick={handleRegister}
          disabled={!canSubmit}
          className={`${isDimprover ? "border-blue-700 text-blue-700 hover:bg-blue-50" : "border-teal-600 text-teal-700 hover:bg-emerald-50"} mt-4 w-full rounded-2xl border bg-white px-6 py-4 text-lg font-black transition disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Első belépés / fiók aktiválása
        </button>
      </div>

      <button
        type="button"
        onClick={handleResendConfirmation}
        disabled={!canResendConfirmation}
        className="w-full rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Megerősítő email újraküldése
      </button>

      <a href={`mailto:${supportEmail}`} className={`mx-auto flex w-fit items-center gap-3 pt-4 text-lg font-semibold ${accentTextClass}`}>
        <span>▣</span> Segítség
      </a>
    </form>
  );
}