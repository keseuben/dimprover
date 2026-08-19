"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import type { AruterPickupSlot, AruterPublicProduct } from "@/app/lib/aruter/publicOfferData";

export type StorefrontCartLine = {
  product: AruterPublicProduct;
  quantity: number;
};

export type StorefrontCheckoutSuccess = {
  orderId: string;
  orderNumber: string;
  lineCount: number;
  itemQuantity: number;
  grossTotal: number;
  reused: boolean;
  commerceQueued: boolean;
};

type Props = {
  open: boolean;
  businessSlug: string;
  pickupSlots: AruterPickupSlot[];
  lines: StorefrontCartLine[];
  onClose: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCompleted: (result: StorefrontCheckoutSuccess) => void;
};

function currency(value: number) {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(value);
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `checkout-${crypto.randomUUID()}`;
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function canonicalFingerprint(input: {
  businessSlug: string;
  lines: StorefrontCartLine[];
  pickupSlotId: string;
  pickupSlotLabel: string;
  customerName: string;
  phone: string;
  email: string;
  note: string;
  acceptedPrivacy: boolean;
}) {
  return JSON.stringify({
    businessSlug: input.businessSlug.trim(),
    items: input.lines
      .map((line) => ({ productId: line.product.id, quantity: line.quantity }))
      .sort((left, right) => left.productId.localeCompare(right.productId)),
    pickupSlotId: input.pickupSlotId.trim(),
    pickupSlotLabel: input.pickupSlotLabel.trim(),
    customerName: input.customerName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    note: input.note.trim(),
    acceptedPrivacy: input.acceptedPrivacy,
  });
}

export function StorefrontMultiItemCheckout({
  open,
  businessSlug,
  pickupSlots,
  lines,
  onClose,
  onUpdateQuantity,
  onRemove,
  onCompleted,
}: Props) {
  const [selectedSlotId, setSelectedSlotId] = useState(pickupSlots.find((slot) => slot.available)?.id ?? pickupSlots[0]?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<StorefrontCheckoutSuccess | null>(null);
  const retryRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const selectedSlot = pickupSlots.find((slot) => slot.id === selectedSlotId) ?? pickupSlots[0];
  const grossTotal = useMemo(() => lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0), [lines]);
  const itemQuantity = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);
  const canSubmit = lines.length > 0 && customerName.trim().length > 1 && phone.trim().length > 5 && acceptedPrivacy && Boolean(selectedSlot?.id);

  if (!open) return null;

  async function submitCheckout() {
    if (!canSubmit || isSubmitting || !selectedSlot) return;
    setSubmitError(null);
    setIsSubmitting(true);

    const fingerprint = canonicalFingerprint({
      businessSlug,
      lines,
      pickupSlotId: selectedSlot.id,
      pickupSlotLabel: selectedSlot.label,
      customerName,
      phone,
      email,
      note,
      acceptedPrivacy,
    });
    if (!retryRef.current || retryRef.current.fingerprint !== fingerprint) {
      retryRef.current = { fingerprint, key: createIdempotencyKey() };
    }

    try {
      const response = await fetch("/api/aruter/public-checkouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retryRef.current.key,
        },
        body: JSON.stringify({
          businessSlug,
          items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
          pickupSlotId: selectedSlot.id,
          pickupSlotLabel: selectedSlot.label,
          customerName,
          phone,
          email,
          note,
          acceptedPrivacy,
        }),
      });
      const result = await response.json() as { ok: boolean; data?: StorefrontCheckoutSuccess; error?: string };
      if (!response.ok || !result.ok || !result.data) {
        setSubmitError(result.error ?? "A checkout mentése nem sikerült.");
        return;
      }
      setCompleted(result.data);
    } catch {
      setSubmitError("A checkout mentése közben hálózati hiba történt. Az újrapróbálás nem hoz létre második rendelést.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function finish() {
    if (!completed) return;
    const result = completed;
    setCompleted(null);
    setCustomerName("");
    setPhone("");
    setEmail("");
    setNote("");
    setAcceptedPrivacy(false);
    retryRef.current = null;
    onCompleted(result);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/40 px-0 sm:items-center sm:px-4">
      <div className="max-h-[94vh] w-full max-w-[860px] overflow-y-auto rounded-t-[30px] border border-slate-200 bg-white shadow-[0_-22px_80px_rgba(15,23,42,0.26)] sm:rounded-[30px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><ShoppingBag size={22} /></span>
            <div><h2 className="text-xl font-black text-slate-950">Kosár és átvétel</h2><p className="text-sm font-semibold text-slate-500">{lines.length} termék · {itemQuantity} egység</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Checkout bezárása"><X size={22} /></button>
        </div>

        {completed ? (
          <div className="px-5 py-12 text-center sm:px-8">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check size={42} /></span>
            <h3 className="mt-5 text-3xl font-black text-slate-950">Rendelés rögzítve</h3>
            <p className="mt-3 font-semibold text-slate-600">Rendelésszám: <b>{completed.orderNumber}</b></p>
            <p className="mt-1 font-semibold text-slate-600">{completed.lineCount} tétel · {completed.itemQuantity} egység · {currency(completed.grossTotal)}</p>
            {completed.reused && <p className="mx-auto mt-4 max-w-lg rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-800">A korábbi sikeres beküldést találtuk meg, ezért nem készült második rendelés.</p>}
            <button type="button" onClick={finish} className="mt-7 rounded-2xl bg-teal-700 px-8 py-4 font-black text-white">Rendben</button>
          </div>
        ) : (
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_330px]">
            <section>
              <h3 className="mb-3 text-lg font-black text-slate-900">Kosár tartalma</h3>
              <div className="space-y-3">
                {lines.map((line) => (
                  <article key={line.product.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-slate-200 p-4">
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-950">{line.product.name}</h4>
                      <p className="text-sm font-semibold text-slate-500">{currency(line.product.price)} / {line.product.unit}</p>
                      <p className="mt-1 font-black text-teal-700">{currency(line.product.price * line.quantity)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex h-10 items-center rounded-xl border border-slate-200">
                        <button type="button" onClick={() => onUpdateQuantity(line.product.id, line.quantity - 1)} className="h-full px-3 font-black text-teal-700" aria-label={`${line.product.name} mennyiség csökkentése`}><Minus size={16} /></button>
                        <span className="min-w-10 text-center font-black">{line.quantity}</span>
                        <button type="button" onClick={() => onUpdateQuantity(line.product.id, line.quantity + 1)} className="h-full px-3 font-black text-teal-700" aria-label={`${line.product.name} mennyiség növelése`}><Plus size={16} /></button>
                      </div>
                      <button type="button" onClick={() => onRemove(line.product.id)} className="flex items-center gap-1 text-xs font-black text-rose-700"><Trash2 size={14} /> Törlés</button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-teal-50 p-4"><span className="font-black text-slate-700">Kosár bruttó összesen</span><b className="text-2xl text-teal-700">{currency(grossTotal)}</b></div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-600">Átvételi idősáv</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {pickupSlots.map((slot) => <button type="button" key={slot.id} disabled={!slot.available} onClick={() => setSelectedSlotId(slot.id)} className={`rounded-xl border px-3 py-3 font-black disabled:opacity-40 ${selectedSlotId === slot.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{slot.label}</button>)}
                </div>
              </div>
              <label className="block"><span className="text-sm font-black text-slate-600">Név *</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" /></label>
              <label className="block"><span className="text-sm font-black text-slate-600">Telefon *</span><input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" /></label>
              <label className="block"><span className="text-sm font-black text-slate-600">E-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" /></label>
              <label className="block"><span className="text-sm font-black text-slate-600">Megjegyzés</span><textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" /></label>
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600"><input type="checkbox" checked={acceptedPrivacy} onChange={(event) => setAcceptedPrivacy(event.target.checked)} className="mt-0.5 h-5 w-5 accent-teal-700" /><span>Elfogadom, hogy a megadott adataimat a rendelés előkészítéséhez és az átvétel egyeztetéséhez kezeljék.</span></label>
              {submitError && <p className="rounded-2xl bg-rose-50 p-3 text-sm font-black text-rose-700">{submitError}</p>}
              <button type="button" onClick={submitCheckout} disabled={!canSubmit || isSubmitting} className="w-full rounded-2xl bg-teal-700 py-4 text-lg font-black text-white shadow-lg disabled:bg-slate-300">{isSubmitting ? "Rendelés mentése..." : `Rendelés leadása · ${currency(grossTotal)}`}</button>
              <p className="text-center text-xs font-semibold text-slate-400">Hálózati újrapróbálás esetén a rendszer ugyanazt a rendelést használja.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
