"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, KeyRound, LoaderCircle, LockKeyhole, Mail, RotateCcw, ShieldCheck } from "lucide-react";
import DropBrand from "./DropBrand";
import DropSixDigitCodeInput from "./DropSixDigitCodeInput";

type GateState = "checking" | "ready" | "blocked";

export default function DropOpenForm() {
  const [gateState, setGateState] = useState<GateState>("checking");
  const [publicCode, setPublicCode] = useState("");
  const [pin, setPin] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [spaceRecoveryOpen, setSpaceRecoveryOpen] = useState(false);
  const [spaceCode, setSpaceCode] = useState("");
  const [spaceRecoveryEmail, setSpaceRecoveryEmail] = useState("");
  const [spaceRecoverySubmitting, setSpaceRecoverySubmitting] = useState(false);
  const [spaceRecoveryMessage, setSpaceRecoveryMessage] = useState("");
  const [message, setMessage] = useState("A hozzáférési kapu állapotának ellenőrzése…");
  const lastAutoCredentialRef = useRef("");
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const [featureResponse, healthResponse] = await Promise.all([
          fetch("/api/drop/features", { cache: "no-store" }),
          fetch("/api/drop/health", { cache: "no-store" }),
        ]);
        const features = await featureResponse.json();
        const health = await healthResponse.json();
        const ready = Boolean(features?.flags?.accessGateEnabled && health?.coreReady);
        setGateState(ready ? "ready" : "blocked");
        setMessage(
          ready
            ? "A csomagkód és PIN ellenőrzése aktív. A sikeres belépés megtekintési munkamenetet nyit."
            : "A hozzáférési motor még biztonságosan tiltott. A mezők nem küldenek adatot.",
        );
      } catch {
        setGateState("blocked");
        setMessage("A hozzáférési kapu állapota jelenleg nem ellenőrizhető.");
      }
    }
    void load();
  }, []);

  const submit = useCallback(async (pinValue = pin) => {
    if (submitting || submitInFlightRef.current || gateState !== "ready" || !accepted || !publicCode.trim() || pinValue.length !== 6) return;
    submitInFlightRef.current = true;
    setSubmitting(true);
    setMessage("A csomagkód és a PIN ellenőrzése…");
    try {
      const response = await fetch("/api/drop/access/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicCode, pin: pinValue }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.grant?.redirectPath) {
        throw new Error(payload?.error || "A csomag nem nyitható meg.");
      }
      window.location.assign(payload.grant.redirectPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A csomag nem nyitható meg.");
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }, [accepted, gateState, pin, publicCode, submitting]);


  async function requestNewPin() {
    if (!publicCode.trim() || !recoveryEmail.trim() || recoverySubmitting) return;
    setRecoverySubmitting(true);
    setRecoveryMessage("Az új PIN kérésének feldolgozása…");
    try {
      const response = await fetch("/api/drop/access/pin-recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicCode, email: recoveryEmail }),
      });
      const payload = await response.json();
      const requestId = typeof payload?.requestId === "string" ? payload.requestId : "";
      const baseMessage = payload?.message || "A kérelmet fogadtuk. Jogosultság esetén az új PIN e-mailben érkezik.";
      setRecoveryMessage(`${baseMessage}${requestId ? ` Kérésazonosító: ${requestId}.` : ""} Ellenőrizze a Levélszemét/Spam mappát is.`);
    } catch {
      setRecoveryMessage("A kérés rögzítése most nem ellenőrizhető. Próbálja meg később.");
    } finally {
      setRecoverySubmitting(false);
    }
  }


  async function requestSpaceRecovery() {
    if (!spaceCode.trim() || !spaceRecoveryEmail.trim() || spaceRecoverySubmitting) return;
    setSpaceRecoverySubmitting(true);
    setSpaceRecoveryMessage("A térbelépési link kérése folyamatban…");
    try {
      const response = await fetch("/api/drop/spaces/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spaceCode, email: spaceRecoveryEmail }),
      });
      const payload = await response.json();
      setSpaceRecoveryMessage(payload?.message || "Ha az adatok jogosultak, a belépési linket elküldtük.");
    } catch {
      setSpaceRecoveryMessage("A kérés rögzítése most nem ellenőrizhető. Próbálja meg később.");
    } finally {
      setSpaceRecoverySubmitting(false);
    }
  }

  const formReady = Boolean(gateState === "ready" && accepted && publicCode.trim() && pin.length === 6);
  const credentialKey = `${publicCode.trim().toUpperCase()}|${pin}|${accepted ? "1" : "0"}`;

  useEffect(() => {
    if (!formReady || submitting || lastAutoCredentialRef.current === credentialKey) return;
    lastAutoCredentialRef.current = credentialKey;
    void submit(pin);
  }, [credentialKey, formReady, pin, submit, submitting]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef4f8] px-5 py-8 text-slate-900 sm:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] min-w-0 max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0">
          <DropBrand />
          <p className="mt-8 text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Meghívásos hozzáférés</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">Csomag megnyitása</h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
            Adja meg a meghívásban szereplő csomagkódot és a külön megkapott hatjegyű PIN-t. A PIN nem kerül az URL-be.
          </p>
          <div className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${gateState === "ready" ? "border-lime-200 bg-lime-50 text-lime-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
            <ShieldCheck className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
            <p>{message}</p>
          </div>
          <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-cyan-800 hover:text-cyan-950">
            <ArrowLeft size={17} aria-hidden="true" /> Vissza a kezdőlapra
          </Link>
        </div>

        <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.10)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Hozzáférési kapu</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Csomagkód és PIN</h2>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black ${gateState === "ready" ? "border-lime-200 bg-lime-50 text-lime-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {gateState === "checking" ? <LoaderCircle className="animate-spin" size={13} /> : <LockKeyhole size={13} />}
              {gateState === "ready" ? "Aktív" : gateState === "checking" ? "Ellenőrzés" : "Tiltva"}
            </span>
          </div>

          <form className="mt-7 space-y-5" onSubmit={(event) => { event.preventDefault(); if (formReady) void submit(); }}>
            <label className="block">
              <span className="text-sm font-black text-slate-800">Csomagkód</span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-100">
                <KeyRound size={18} className="text-cyan-700" aria-hidden="true" />
                <input
                  value={publicCode}
                  onChange={(event) => setPublicCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40))}
                  disabled={gateState !== "ready" || submitting}
                  autoComplete="off"
                  placeholder="DMP-2608-ABC234"
                  className="min-w-0 w-full bg-transparent text-sm font-black uppercase tracking-[0.08em] text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
            </label>
            <DropSixDigitCodeInput
              id="drop-open-pin"
              value={pin}
              onChange={setPin}
              disabled={gateState !== "ready" || submitting}
              label="Hatjegyű PIN"
              tone="cyan"
            />
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <button
                type="button"
                onClick={() => setRecoveryOpen((value) => !value)}
                disabled={gateState !== "ready" || submitting}
                className="inline-flex items-center gap-2 text-sm font-black text-amber-900"
              >
                <RotateCcw size={16} /> Nem emlékszem a PIN-re
              </button>
              {recoveryOpen ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold leading-5 text-amber-950">Adja meg a csomagkódot és azt az e-mail-címet, amelyre a csomagot megosztották. Jogosultság esetén új PIN készül; a korábbi PIN csak a sikeres e-mail-küldés után válik érvénytelenné.</p>
                  <label className="block">
                    <span className="text-xs font-black text-amber-950">Jogosult e-mail-cím</span>
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-100">
                      <Mail size={17} className="text-amber-700" />
                      <input
                        type="email"
                        value={recoveryEmail}
                        onChange={(event) => setRecoveryEmail(event.target.value.slice(0, 320))}
                        disabled={recoverySubmitting}
                        autoComplete="email"
                        placeholder="nev@ceg.hu"
                        className="min-w-0 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none"
                      />
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => void requestNewPin()}
                    disabled={!publicCode.trim() || !recoveryEmail.trim() || recoverySubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {recoverySubmitting ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}
                    {recoverySubmitting ? "Küldés…" : "Új PIN igénylése"}
                  </button>
                  {recoveryMessage ? <p role="status" className="break-all rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-amber-950">{recoveryMessage}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
              <button
                type="button"
                onClick={() => setSpaceRecoveryOpen((value) => !value)}
                disabled={gateState !== "ready" || submitting}
                className="inline-flex items-center gap-2 text-sm font-black text-cyan-950"
              >
                <Building2 size={16} /> Térbelépés helyreállítása
              </button>
              {spaceRecoveryOpen ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold leading-5 text-cyan-950">A <strong>DSP-...</strong> térkód és a tagsághoz tartozó e-mail alapján 15 percig érvényes belépési linket küldünk.</p>
                  <label className="block">
                    <span className="text-xs font-black text-cyan-950">Drop térkód</span>
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-cyan-200 bg-white px-4 py-3 focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-100">
                      <Building2 size={17} className="text-cyan-700" />
                      <input
                        value={spaceCode}
                        onChange={(event) => setSpaceCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40))}
                        disabled={spaceRecoverySubmitting}
                        autoComplete="off"
                        placeholder="DSP-26-56408E28"
                        className="min-w-0 w-full bg-transparent text-sm font-black uppercase tracking-[0.06em] text-slate-950 outline-none"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-cyan-950">Tagsági e-mail-cím</span>
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-cyan-200 bg-white px-4 py-3 focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-100">
                      <Mail size={17} className="text-cyan-700" />
                      <input
                        type="email"
                        value={spaceRecoveryEmail}
                        onChange={(event) => setSpaceRecoveryEmail(event.target.value.slice(0, 320))}
                        disabled={spaceRecoverySubmitting}
                        autoComplete="email"
                        placeholder="nev@ceg.hu"
                        className="min-w-0 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none"
                      />
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => void requestSpaceRecovery()}
                    disabled={!spaceCode.trim() || !spaceRecoveryEmail.trim() || spaceRecoverySubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {spaceRecoverySubmitting ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}
                    {spaceRecoverySubmitting ? "Küldés…" : "Térbelépési link küldése"}
                  </button>
                  {spaceRecoveryMessage ? <p role="status" className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-cyan-950">{spaceRecoveryMessage}</p> : null}
                </div>
              ) : null}
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                disabled={gateState !== "ready" || submitting}
                className="mt-1"
              />
              <span>Tudomásul vettem az adatkezelési és ideiglenes tárolási feltételeket. Ha a csomagkód és a PIN már teljes, a bejelölés után a belépés automatikusan elindul.</span>
            </label>
            <button
              type="submit"
              disabled={!formReady || submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {submitting ? <LoaderCircle className="animate-spin" size={17} /> : <LockKeyhole size={17} />}
              {submitting ? "Ellenőrzés…" : "Csomag megnyitása"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
