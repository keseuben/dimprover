"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleDollarSign, Clock3, PackageCheck, RefreshCw } from "lucide-react";
import type { StorefrontCheckoutSuccess } from "./StorefrontMultiItemCheckout";

type TrackingState = "RECEIVED" | "QUEUED" | "PROCESSING" | "AT_CASHIER" | "PAID" | "ISSUED" | "CANCELLED";
type TrackingStatus = {
  orderNumber: string;
  state: TrackingState;
  label: string;
  queueState: "PENDING" | "SUCCEEDED" | "FAILED" | null;
  commerceStatus: "DRAFT" | "SENT_TO_CASHIER" | "PAID" | "ISSUED" | "CANCELLED" | null;
  terminal: boolean;
  updatedAt: string | null;
  expiresAt: string;
};

type Props = { checkout: StorefrontCheckoutSuccess };

function activeStep(state: TrackingState) {
  if (state === "AT_CASHIER") return 1;
  if (state === "PAID") return 2;
  if (state === "ISSUED") return 3;
  return 0;
}

function statusTone(state: TrackingState) {
  if (state === "ISSUED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "PAID") return "border-sky-200 bg-sky-50 text-sky-800";
  if (state === "AT_CASHIER") return "border-violet-200 bg-violet-50 text-violet-800";
  if (state === "CANCELLED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

export function StorefrontOrderTrackingCard({ checkout }: Props) {
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(checkout.trackingToken));
  const [temporaryError, setTemporaryError] = useState(false);

  useEffect(() => {
    if (!checkout.trackingToken) {
      setLoading(false);
      setStatus(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch("/api/aruter/public-checkouts/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ trackingToken: checkout.trackingToken }),
        });
        const result = await response.json() as { ok: boolean; data?: TrackingStatus };
        if (!active) return;
        if (response.ok && result.ok && result.data) {
          setStatus(result.data);
          setTemporaryError(false);
          if (!result.data.terminal) timer = setTimeout(poll, 5000);
        } else {
          setTemporaryError(true);
          timer = setTimeout(poll, 10000);
        }
      } catch {
        if (!active) return;
        setTemporaryError(true);
        timer = setTimeout(poll, 10000);
      } finally {
        if (active) setLoading(false);
      }
    };
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [checkout.trackingToken]);

  const step = useMemo(() => status ? activeStep(status.state) : 0, [status]);
  const steps = [
    { label: "Fogadva", icon: Check },
    { label: "Pénztár", icon: Clock3 },
    { label: "Fizetve", icon: CircleDollarSign },
    { label: "Kiadva", icon: PackageCheck },
  ];

  return (
    <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5" data-storefront-tracking-card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-emerald-800">Rendelés elküldve</h2>
          <p className="mt-2 font-semibold text-slate-700">{checkout.orderNumber} · {checkout.lineCount} tétel · {checkout.itemQuantity} egység</p>
        </div>
        {checkout.trackingToken && <span className={`rounded-full border px-3 py-1.5 text-sm font-black ${status ? statusTone(status.state) : "border-slate-200 bg-white text-slate-600"}`}>{loading ? "Állapot lekérése..." : status?.label ?? "Feldolgozás alatt"}</span>}
      </div>

      {checkout.trackingToken ? (
        <>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const done = status?.state !== "CANCELLED" && index <= step;
              return <div key={item.label} className={`rounded-2xl border px-2 py-3 text-center ${done ? "border-teal-200 bg-white text-teal-800" : "border-slate-200 bg-white/60 text-slate-400"}`}><Icon className="mx-auto" size={18}/><span className="mt-1 block text-xs font-black">{item.label}</span></div>;
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
            <span>{status?.state === "CANCELLED" ? "A rendelést törölték." : "Az állapot automatikusan frissül a központi pénztárból."}</span>
            <span className="flex items-center gap-1"><RefreshCw size={13}/>{formatTime(status?.updatedAt ?? null) ? ` Frissítve: ${formatTime(status?.updatedAt ?? null)}` : " Frissítés folyamatban"}</span>
          </div>
          {temporaryError && <p className="mt-2 text-xs font-bold text-amber-700">Az állapot átmenetileg nem frissíthető. A rendelés ettől még rögzítve van; automatikusan újrapróbáljuk.</p>}
        </>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-600">A rendelés rögzítve. Az online állapotkövetés ehhez a rendeléshez még nem aktív.</p>
      )}
    </section>
  );
}
