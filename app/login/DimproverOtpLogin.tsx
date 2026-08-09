"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, Send } from "lucide-react";
import DimproMotionBackdrop from "@/components/layout/DimproMotionBackdrop";

const accessStates = [
  "Fejlesztés alatt",
  "Tesztüzem",
  "Korlátozott hozzáférés",
  "Előfizetői hozzáférés",
];

function LoginSystemVisual() {
  const tasks = [
    { x: 135, y: 105, size: 66, cls: "login-task-a", delay: 0.0 },
    { x: 335, y: 250, size: 58, cls: "login-task-b", delay: 1.4 },
    { x: 610, y: 150, size: 72, cls: "login-task-c", delay: 2.8 },
    { x: 930, y: 310, size: 62, cls: "login-task-a", delay: 4.1 },
    { x: 1120, y: 185, size: 70, cls: "login-task-b", delay: 5.2 },
  ];
  const docs = [
    { x: 230, y: 165, cls: "login-doc-a", delay: 0.6 },
    { x: 485, y: 88, cls: "login-doc-b", delay: 1.9 },
    { x: 760, y: 255, cls: "login-doc-c", delay: 3.0 },
    { x: 1045, y: 92, cls: "login-doc-a", delay: 4.4 },
    { x: 1220, y: 360, cls: "login-doc-b", delay: 5.8 },
    { x: 160, y: 430, cls: "login-doc-c", delay: 6.7 },
    { x: 650, y: 460, cls: "login-doc-a", delay: 7.5 },
    { x: 980, y: 505, cls: "login-doc-c", delay: 8.2 },
  ];
  const people = [
    { x: 250, y: 345, cls: "login-person-a", delay: 0.8 },
    { x: 305, y: 345, cls: "login-person-b", delay: 0.8 },
    { x: 790, y: 395, cls: "login-person-a", delay: 4.6 },
    { x: 850, y: 395, cls: "login-person-b", delay: 4.6 },
    { x: 820, y: 395, cls: "login-person-c", delay: 4.6 },
    { x: 1120, y: 455, cls: "login-person-solo", delay: 7.4 },
  ];
  const nodes = [[135,105],[230,165],[305,345],[485,88],[610,150],[760,255],[820,395],[930,310],[1045,92],[1120,455],[1220,360],[650,460]];

  const TaskIcon = ({ x, y, size }: { x: number; y: number; size: number }) => {
    const h = size / 2;
    return <g stroke="#22d3ee" strokeWidth="1.25" opacity="0.82" strokeLinecap="round" strokeLinejoin="round"><rect x={x - h} y={y - h} width={size} height={size} rx="6" /><path d={`M${x - h * 0.5} ${y} L${x - h * 0.12} ${y + h * 0.38} L${x + h * 0.58} ${y - h * 0.5}`} /></g>;
  };
  const DocIcon = ({ x, y }: { x: number; y: number }) => <g stroke="#22d3ee" strokeWidth="1.2" opacity="0.72" strokeLinecap="round" strokeLinejoin="round"><path d={`M${x - 24} ${y - 32} H${x + 14} L${x + 30} ${y - 16} V${y + 32} H${x - 24} Z`} /><path d={`M${x + 14} ${y - 32} V${y - 16} H${x + 30}`} /><path d={`M${x - 12} ${y - 4} H${x + 12} M${x - 12} ${y + 12} H${x + 8}`} /></g>;
  const PersonIcon = ({ x, y }: { x: number; y: number }) => <g stroke="#22d3ee" strokeWidth="1.15" opacity="0.68" strokeLinecap="round" strokeLinejoin="round"><circle cx={x} cy={y - 11} r="11" /><path d={`M${x - 28} ${y + 31} C${x - 16} ${y + 8} ${x + 16} ${y + 8} ${x + 28} ${y + 31}`} /></g>;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        .login-flow-a{stroke-dasharray:170 240;animation:loginFlow 28s linear infinite}.login-flow-b{stroke-dasharray:120 220;animation:loginFlow 34s linear infinite reverse}.login-scan-x{animation:loginScanX 18s linear infinite}.login-scan-y{animation:loginScanY 24s linear infinite}.login-node{transform-origin:center;animation:loginNodePulse 12s ease-in-out infinite}.login-task-a{animation:loginDeliverA 20s ease-in-out infinite}.login-task-b{animation:loginDeliverB 23s ease-in-out infinite}.login-task-c{animation:loginDeliverC 26s ease-in-out infinite}.login-doc-a{animation:loginDocA 15s ease-in-out infinite}.login-doc-b{animation:loginDocB 17s ease-in-out infinite}.login-doc-c{animation:loginDocC 19s ease-in-out infinite}.login-person-a{animation:loginPersonA 34s ease-in-out infinite}.login-person-b{animation:loginPersonB 34s ease-in-out infinite}.login-person-c{animation:loginPersonC 34s ease-in-out infinite}.login-person-solo{animation:loginPersonSolo 31s ease-in-out infinite}
        @keyframes loginFlow{0%{stroke-dashoffset:360;opacity:0}15%,62%{opacity:.38}100%{stroke-dashoffset:-460;opacity:0}}@keyframes loginScanX{0%{transform:translateX(-190px);opacity:0}14%,60%{opacity:.22}100%{transform:translateX(1420px);opacity:0}}@keyframes loginScanY{0%{transform:translateY(-120px);opacity:0}14%,62%{opacity:.18}100%{transform:translateY(760px);opacity:0}}@keyframes loginNodePulse{0%,100%{opacity:.16;transform:scale(.86)}50%{opacity:.52;transform:scale(1.2)}}@keyframes loginDeliverA{0%{transform:translate3d(-72px,14px,0) scale(.96);opacity:0}14%,56%{opacity:.72}70%,100%{transform:translate3d(115px,-38px,0) scale(.52);opacity:0}}@keyframes loginDeliverB{0%{transform:translate3d(68px,-24px,0) scale(.96);opacity:0}14%,56%{opacity:.72}70%,100%{transform:translate3d(-118px,46px,0) scale(.52);opacity:0}}@keyframes loginDeliverC{0%{transform:translate3d(-32px,70px,0) scale(.96);opacity:0}14%,56%{opacity:.70}70%,100%{transform:translate3d(128px,-92px,0) scale(.52);opacity:0}}@keyframes loginDocA{0%{transform:translate3d(-96px,-22px,0) scale(.96);opacity:0}12%,52%{opacity:.60}68%,100%{transform:translate3d(128px,42px,0) scale(.45);opacity:0}}@keyframes loginDocB{0%{transform:translate3d(90px,-34px,0) scale(.96);opacity:0}12%,52%{opacity:.60}68%,100%{transform:translate3d(-132px,52px,0) scale(.45);opacity:0}}@keyframes loginDocC{0%{transform:translate3d(-38px,82px,0) scale(.96);opacity:0}12%,52%{opacity:.58}68%,100%{transform:translate3d(142px,-98px,0) scale(.45);opacity:0}}@keyframes loginPersonA{0%{transform:translate3d(-96px,-28px,0);opacity:0}22%{opacity:.56}46%,60%{transform:translate3d(-12px,0,0);opacity:.56}100%{transform:translate3d(72px,48px,0);opacity:0}}@keyframes loginPersonB{0%{transform:translate3d(96px,-26px,0);opacity:0}22%{opacity:.56}46%,60%{transform:translate3d(12px,0,0);opacity:.56}100%{transform:translate3d(-74px,46px,0);opacity:0}}@keyframes loginPersonC{0%{transform:translate3d(0,78px,0);opacity:0}22%{opacity:.56}46%,60%{transform:translate3d(0,10px,0);opacity:.56}100%{transform:translate3d(38px,-72px,0);opacity:0}}@keyframes loginPersonSolo{0%,100%{transform:translate3d(-48px,18px,0);opacity:.12}22%,76%{opacity:.55}52%{transform:translate3d(66px,-34px,0)}}
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_18%,rgba(37,99,235,.22),transparent_45%),radial-gradient(circle_at_24%_78%,rgba(14,165,233,.18),transparent_38%)]" />
      <div className="absolute inset-0 opacity-[0.54] [background-image:linear-gradient(rgba(37,99,235,0.17)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.17)_1px,transparent_1px)] [background-size:72px_72px]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1280 720" preserveAspectRatio="none" fill="none">
        <defs><filter id="loginGlow" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="loginTrace" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fff" stopOpacity="0"/><stop offset="48%" stopColor="#22d3ee" stopOpacity=".76"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
        <g stroke="url(#loginTrace)" strokeLinecap="round" filter="url(#loginGlow)"><path className="login-flow-a" d="M0 260 L170 185 L345 230 L520 150 L735 235 L930 165 L1280 240" strokeWidth="1.7"/><path className="login-flow-b" d="M0 500 L210 410 L470 465 L690 350 L930 430 L1110 345 L1280 380" strokeWidth="1.4"/></g>
        <g className="login-scan-x" stroke="#22d3ee" strokeWidth="2" opacity=".26" filter="url(#loginGlow)"><path d="M0 90 V650"/><path d="M32 140 V625" opacity=".35"/></g>
        <g className="login-scan-y" stroke="#22d3ee" strokeWidth="1.6" opacity=".23" filter="url(#loginGlow)"><path d="M110 0 H1180"/><path d="M220 28 H1060" opacity=".32"/></g>
        <g filter="url(#loginGlow)">{nodes.map(([cx, cy], i) => <g key={`login-node-${i}`} className="login-node" style={{ animationDelay: `${i * .48}s` }}><circle cx={cx} cy={cy} r="16" fill="#22d3ee" opacity=".22"/><circle cx={cx} cy={cy} r="5" fill="#2563eb" opacity=".54"/><circle cx={cx} cy={cy} r="1.8" fill="#fff" opacity=".75"/></g>)}</g>
        <g filter="url(#loginGlow)">{tasks.map((item) => <g key={`login-task-${item.x}-${item.y}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}><TaskIcon x={item.x} y={item.y} size={item.size} /></g>)}{docs.map((item) => <g key={`login-doc-${item.x}-${item.y}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}><DocIcon x={item.x} y={item.y} /></g>)}{people.map((item) => <g key={`login-person-${item.x}-${item.y}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}><PersonIcon x={item.x} y={item.y} /></g>)}</g>
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.42)_0%,rgba(255,255,255,.12)_48%,rgba(255,255,255,.50)_100%)]" />
    </div>
  );
}

export function DimproverOtpLogin() {
  const router = useRouter();
  const codeInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const cleanEmail = email.trim();
  const cleanCode = code.trim();
  const canSendCode = cleanEmail.length > 3 && cleanEmail.includes("@");
  const canLogin = codeSent && cleanCode.length === 6;

  useEffect(() => {
    if (codeSent) {
      codeInputRef.current?.focus();
    }
  }, [codeSent]);

  async function sendCode() {
    if (!canSendCode || loading) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/dimpro-auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cleanEmail.toLowerCase() }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || !data?.ok) {
        setMessage(data?.error || "A belépési kód küldése nem sikerült.");
        return;
      }

      setCodeSent(true);
      setCode("");
      setMessage("Belépési kód elküldve.");
      window.setTimeout(() => codeInputRef.current?.focus(), 80);
    } catch {
      setMessage("A belépési szolgáltatás jelenleg nem érhető el.");
    } finally {
      setLoading(false);
    }
  }

  async function loginWithCode(codeOverride?: string) {
    const tokenCode = (codeOverride ?? cleanCode).trim();
    if (!codeSent || tokenCode.length !== 6 || loading) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/dimpro-auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cleanEmail.toLowerCase(), token: tokenCode }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || !data?.ok) {
        setMessage(data?.error || "Hibás vagy lejárt belépési kód.");
        return;
      }

      localStorage.setItem("dimprover_login_started_at", Date.now().toString());
      router.push("/");
      router.refresh();
    } catch {
      setMessage("A belépési szolgáltatás jelenleg nem érhető el.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F3F6FA] text-slate-900">
      <div className="absolute inset-0 dimpro-architect-grid" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_86%_74%,rgba(37,99,235,0.08),transparent_36%)]" />
      <div className="absolute inset-y-0 left-0 hidden w-[41%] bg-[linear-gradient(135deg,#07111F,#020617_58%,#01040B)] lg:block" />
      <div className="absolute left-0 top-0 hidden h-full w-[41%] opacity-65 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(14,165,233,0.24),transparent_30%),linear-gradient(112deg,transparent_0_38%,rgba(14,165,233,0.10)_38.2%,transparent_39%_100%),linear-gradient(28deg,transparent_0_62%,rgba(37,99,235,0.08)_62.2%,transparent_63%_100%)]" />
      </div>

      <section className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="flex min-h-[38vh] flex-col px-8 py-8 text-white lg:min-h-screen lg:px-12 lg:py-10">
          <div className="flex flex-col items-start gap-3">
            <Image
              src="/dimprover-logo.png"
              alt="DIMPROVER"
              width={132}
              height={132}
              priority
              className="h-28 w-28 object-contain drop-shadow-[0_0_42px_rgba(14,165,233,0.72)] md:h-32 md:w-32"
            />
            <div>
              <div className="text-lg font-bold tracking-[0.24em] text-white">DIMPROVER</div>
              <div className="mt-2 text-[12px] uppercase tracking-[0.20em] text-sky-200/70">
                Műszaki projektvezérlés
              </div>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center text-center lg:items-start lg:text-left">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/70">
              Digitális műszaki projektkönyv
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
              Rendezett projektmunka<br />
              mérnöki felületen
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300 md:text-base">
              Ütemtervek, dokumentumok, jegyzőkönyvek és döntési pontok egységes, átlátható munkatérben.
            </p>

            <div className="mt-8 w-full max-w-md px-1 py-3">
              <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-2">
                <div className="absolute left-[12.5%] right-[12.5%] top-4 hidden h-px bg-gradient-to-r from-sky-300/45 via-white/14 to-white/8 sm:block" />
                {accessStates.map((state, index) => (
                  <div key={state} className="relative flex flex-row items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
                    <div
                      className={
                        index === 0
                          ? "relative z-10 h-3 w-3 rounded-full border border-sky-200 bg-sky-300 shadow-[0_0_18px_rgba(14,165,233,0.65)]"
                          : "relative z-10 h-2.5 w-2.5 rounded-full border border-slate-500/55 bg-slate-800/80"
                      }
                    />
                    <div
                      className={
                        index === 0
                          ? "text-left text-xs font-semibold uppercase tracking-[0.13em] text-sky-100 sm:text-center"
                          : "text-left text-xs font-medium uppercase tracking-[0.11em] text-slate-500 sm:text-center"
                      }
                    >
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
          <div className="relative z-10 w-full max-w-xl">
            <div className="mb-7 rounded-[2rem] border border-slate-200/90 bg-white/70 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">Belépés</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    Belépés a munkatérbe
                  </h2>
                </div>
                <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 ring-1 ring-sky-100">
                  <LockKeyhole className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200/90 bg-white/76 p-6 shadow-[0_30px_100px_rgba(15,23,42,0.14)] backdrop-blur-2xl md:p-8">
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-600">Email cím</span>
                  <div className="flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 shadow-inner shadow-slate-200/50 transition focus-within:border-sky-400 focus-within:bg-white">
                    <Mail className="h-5 w-5 text-sky-600" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setCodeSent(false);
                        setCode("");
                        setMessage("");
                      }}
                      placeholder="nev@ceg.hu"
                      className="w-full bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
                      autoComplete="email"
                    />
                  </div>
                </label>

                <button
                  type="button"
                  onClick={sendCode}
                  disabled={loading || !canSendCode}
                  className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-sky-700 via-sky-600 to-blue-600 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_42px_rgba(2,132,199,0.28)] transition hover:scale-[1.01] hover:from-sky-600 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  <Send className="h-5 w-5" />
                  {loading && !codeSent ? "Küldés..." : "Kód küldése"}
                </button>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-1">
                  <div className="h-px bg-slate-200" />
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    OTP
                  </span>
                  <div className="h-px bg-slate-200" />
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-600">Belépési kód</span>
                  <div className={codeSent ? "relative rounded-2xl border border-sky-200/80 bg-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_14px_34px_rgba(14,165,233,0.10)] transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100" : "relative rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3 opacity-55 shadow-inner shadow-slate-200/50"}>
                    <input
                      ref={codeInputRef}
                      type="text"
                      value={code}
                      onChange={(event) => {
                        const nextCode = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setCode(nextCode);
                        setMessage("");
                        if (codeSent && nextCode.length === 6 && !loading) {
                          window.setTimeout(() => loginWithCode(nextCode), 80);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canLogin) loginWithCode();
                      }}
                      aria-label="Belépési kód"
                      className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-sky-600 outline-none selection:bg-transparent"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      disabled={!codeSent}
                    />
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: 6 }).map((_, index) => {
                        const digit = code[index];
                        const active = codeSent && index === Math.min(code.length, 5);
                        return (
                          <div
                            key={index}
                            className={active ? "flex h-12 items-center justify-center rounded-xl border border-sky-400 bg-sky-50 text-xl font-bold text-slate-950 shadow-[0_0_0_4px_rgba(14,165,233,0.10)]" : "flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white/86 text-xl font-bold text-slate-950"}
                          >
                            {digit || <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => loginWithCode()}
                  disabled={loading || !canLogin}
                  className="flex h-14 w-full items-center justify-center rounded-2xl border border-slate-900/10 bg-[#07111F] text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_42px_rgba(7,17,31,0.24)] transition hover:bg-[#0B1220] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {loading && codeSent ? "Belépés..." : "Belépés"}
                </button>

                {message ? (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-center text-sm font-medium text-sky-800">
                    {message}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-slate-50/82 px-4 py-4 text-xs leading-5 text-slate-500">
                  <p className="font-semibold text-slate-700">© 2026 DIMPRO.hu – Minden jog fenntartva.</p>
                  <p className="mt-1">A szoftver használata érvényes DIMPRO licenchez kötött.</p>
                  <p className="mt-1">A felület, a kód és a működési logika engedély nélküli másolása vagy továbbadása tilos.</p>
                </div>
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-slate-500">
              DIMPROVER · zárt fejlesztési környezet · egyszer használatos email-kódos belépés · licencvédett munkafelület
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
