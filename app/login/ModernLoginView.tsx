import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  HelpCircle,
  LockKeyhole,
  Mail,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react";

type ModernLoginViewProps = {
  email: string;
  code: string;
  codeSent: boolean;
  loading: boolean;
  message: string;
  canSendCode: boolean;
  canLogin: boolean;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: () => void;
  onLogin: () => void;
};

const phases = [
  { label: "Zárt fejlesztési fázis", active: true },
  { label: "Tesztüzem", active: false },
  { label: "Korlátozott hozzáférés", active: false },
  { label: "Teljes hozzáférés", active: false },
];

export function ModernLoginView({
  email,
  code,
  codeSent,
  loading,
  message,
  canSendCode,
  canLogin,
  onEmailChange,
  onCodeChange,
  onSendCode,
  onLogin,
}: ModernLoginViewProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#120305] px-6 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_34%,rgba(239,68,68,0.28),transparent_30%),radial-gradient(circle_at_82%_20%,rgba(127,29,29,0.34),transparent_28%),linear-gradient(135deg,rgba(10,2,4,0.98),rgba(30,7,10,0.94)_48%,rgba(5,1,2,0.98))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ef4444_1px,transparent_1px),linear-gradient(to_bottom,#ef4444_1px,transparent_1px)] bg-[size:56px_56px] opacity-[0.055]" />
      <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-red-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-10 h-[28rem] w-[28rem] rounded-full bg-red-900/25 blur-[140px]" />

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-red-300/20 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-100 shadow-[0_0_40px_rgba(220,38,38,0.16)] backdrop-blur-xl">
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.9)]" />
            DIMPROVER hozzáférési kapu
          </div>

          <div className="relative max-w-xl">
            <div className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-red-500/20 blur-[90px]" />
            <div className="relative flex items-center gap-7">
              <div className="relative flex h-44 w-44 shrink-0 items-center justify-center rounded-[2rem] border border-red-300/20 bg-white/[0.03] shadow-[0_0_80px_rgba(239,68,68,0.25)] backdrop-blur-xl">
                <div className="absolute inset-4 rounded-[1.5rem] border border-red-400/10" />
                <Image
                  src="/dimprover-logo.png"
                  alt="DIMPROVER"
                  width={260}
                  height={260}
                  priority
                  className="h-36 w-36 object-contain drop-shadow-[0_0_45px_rgba(248,113,113,0.85)]"
                />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-red-300/80">
                  Digitális projektvezérlés
                </p>
                <h1 className="text-5xl font-semibold tracking-[-0.05em] text-white md:text-6xl">
                  Biztonságos belépés
                </h1>
                <p className="mt-4 max-w-md text-base leading-7 text-red-50/62">
                  Zárt fejlesztési környezet, ellenőrzött hozzáféréssel és naplózott munkafolyamatokkal.
                </p>
              </div>
            </div>
          </div>

          <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="Zárt rendszer" text="Csak jóváhagyott hozzáféréssel." />
            <InfoCard icon={<Radar className="h-5 w-5" />} title="Fejlesztési mód" text="Aktív smoke check és backup workflow." />
          </div>

          <div className="max-w-xl rounded-[1.75rem] border border-red-300/15 bg-black/20 p-4 backdrop-blur-xl">
            <div className="space-y-3">
              {phases.map((phase, index) => (
                <div key={phase.label} className="flex items-center gap-3">
                  <div className={phase.active ? "h-3.5 w-3.5 rounded-full bg-red-300 shadow-[0_0_20px_rgba(248,113,113,0.95)]" : "h-3.5 w-3.5 rounded-full border border-red-400/40 bg-red-950"} />
                  <div className={phase.active ? "flex-1 rounded-2xl border border-red-300/30 bg-red-500/15 px-4 py-3 text-sm font-semibold text-white" : "flex-1 rounded-2xl border border-red-400/10 bg-red-950/18 px-4 py-3 text-sm text-red-100/50"}>
                    {String(index + 1).padStart(2, "0")} · {phase.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="relative w-full max-w-xl">
            <div className="absolute -inset-1 rounded-[2.25rem] bg-gradient-to-br from-red-400/45 via-red-900/10 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-red-200/18 bg-[#070102]/72 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(239,68,68,0.16),transparent_38%,rgba(127,29,29,0.14))]" />
              <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-red-400/12 blur-3xl" />

              <div className="relative space-y-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-300/70">Azonosítás</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">Belépési kód</h2>
                  </div>
                  <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-red-200">
                    <Sparkles className="h-6 w-6" />
                  </div>
                </div>

                <FieldShell active>
                  <Mail className="h-6 w-6 text-red-300" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="Email cím"
                    className="w-full bg-transparent text-lg text-white outline-none placeholder:text-red-100/30"
                    autoComplete="email"
                  />
                </FieldShell>

                <button
                  type="button"
                  onClick={onSendCode}
                  disabled={loading || !canSendCode}
                  className="group relative flex h-16 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-red-700 via-red-600 to-red-500 text-white shadow-[0_18px_60px_rgba(220,38,38,0.32)] transition hover:scale-[1.01] hover:from-red-600 hover:to-red-400 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
                >
                  <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition duration-700 group-hover:translate-x-[120%]" />
                  {loading && !codeSent ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <span className="relative flex items-center gap-3 text-sm font-bold uppercase tracking-[0.22em]">
                      <Send className="h-6 w-6" />
                      Kód küldése
                    </span>
                  )}
                </button>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <div className="h-px bg-red-300/15" />
                  <div className="rounded-full border border-red-300/15 bg-red-950/30 px-3 py-1 text-xs uppercase tracking-[0.28em] text-red-100/45">
                    OTP
                  </div>
                  <div className="h-px bg-red-300/15" />
                </div>

                <FieldShell active={codeSent}>
                  <LockKeyhole className="h-6 w-6 text-red-300" />
                  <input
                    type="text"
                    value={code}
                    onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, ""))}
                    placeholder="Kód"
                    className="w-full bg-transparent text-lg tracking-[0.38em] text-white outline-none placeholder:text-red-100/30"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </FieldShell>

                <button
                  type="button"
                  onClick={onLogin}
                  disabled={loading || !canLogin}
                  className="group relative flex h-16 w-full items-center justify-center overflow-hidden rounded-2xl border border-red-200/10 bg-white/[0.06] text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] transition hover:border-red-300/30 hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {loading && codeSent ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.22em]">
                      Belépés
                      <ArrowRight className="h-6 w-6 transition group-hover:translate-x-1" />
                    </span>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <GhostAction icon={<HelpCircle className="h-5 w-5" />} text="Súgó" />
                  <GhostAction icon={<BadgeCheck className="h-5 w-5" />} text="Ellenőrzött" />
                </div>

                {message && (
                  <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-50">
                    {message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-red-200/12 bg-white/[0.035] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="mb-3 inline-flex rounded-2xl border border-red-300/18 bg-red-500/10 p-2 text-red-200">
        {icon}
      </div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm text-red-50/48">{text}</div>
    </div>
  );
}

function FieldShell({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <div className={active ? "flex h-16 items-center gap-4 rounded-2xl border border-red-300/28 bg-black/24 px-5 shadow-inner shadow-red-950/30 transition focus-within:border-red-300/60" : "flex h-16 items-center gap-4 rounded-2xl border border-red-300/12 bg-black/18 px-5 opacity-70 shadow-inner shadow-red-950/20 transition focus-within:border-red-300/35"}>
      {children}
    </div>
  );
}

function GhostAction({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-red-300/10 bg-red-950/18 text-sm font-medium text-red-100/42"
    >
      {icon}
      {text}
    </button>
  );
}
