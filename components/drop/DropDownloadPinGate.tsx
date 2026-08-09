"use client";

import { useRef, useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import DropSixDigitCodeInput from "./DropSixDigitCodeInput";

export default function DropDownloadPinGate({ rawToken }: { rawToken: string }) {
  const requestInFlightRef = useRef(false);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function verify(value = pin) {
    if (value.length !== 6 || loading || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/drop/public/download/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: rawToken, pin: value }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A letöltési kód ellenőrzése sikertelen.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A letöltési kód ellenőrzése sikertelen.");
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-amber-700" size={23} />
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">Második védelmi lépcső</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Letöltési kód szükséges</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">A hatjegyű kódot a fájl érkezéséről szóló e-mail tartalmazza. A hatodik számjegy után a fájllista automatikusan megnyílik, ha a kód helyes.</p>
        </div>
      </div>
      <div className="mt-5 flex items-end gap-3">
        <DropSixDigitCodeInput
          id="drop-download-pin"
          value={pin}
          onChange={setPin}
          onComplete={(value) => void verify(value)}
          disabled={loading}
          label="Letöltési kód"
          tone="amber"
          autoFocus
        />
        <button type="button" onClick={() => void verify()} disabled={loading || pin.length !== 6} className="mb-6 hidden min-h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300 sm:inline-flex">
          {loading ? <LoaderCircle size={17} className="animate-spin" /> : <KeyRound size={17} />}
          {loading ? "Ellenőrzés…" : "Megnyitás"}
        </button>
      </div>
      {loading ? <p className="mt-2 flex items-center gap-2 text-sm font-black text-amber-950" role="status"><LoaderCircle size={16} className="animate-spin" /> A letöltési kód ellenőrzése…</p> : null}
      {message ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{message}</p> : null}
    </section>
  );
}
