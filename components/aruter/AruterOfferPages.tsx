"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  HelpCircle,
  Leaf,
  Link2,
  LogIn,
  MapPin,
  PackageCheck,
  Phone,
  QrCode,
  Search,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Users,
  X,
} from "lucide-react";
import { aruterDemoBusiness, aruterTodayPreparations, type AruterPublicProduct } from "@/app/lib/aruter/publicOfferData";
import type { AruterPublicReservation } from "@/app/lib/aruter/publicReservation";
import { AruterBrand, AruterCard, AruterPageShell } from "./AruterShared";
import { StorefrontMultiItemCheckout, type StorefrontCartLine, type StorefrontCheckoutSuccess } from "./StorefrontMultiItemCheckout";
import { StorefrontOrderTrackingCard } from "./StorefrontOrderTrackingCard";

function currency(value: number) {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(value);
}

function lastCheckoutStorageKey(businessSlug: string) {
  return `dimpro-aruter-last-checkout:${businessSlug}`;
}

function ProductVisual({ tone, className = "" }: { tone: AruterPublicProduct["imageTone"]; className?: string }) {
  const toneClasses: Record<AruterPublicProduct["imageTone"], string> = {
    flower: "from-pink-300 via-rose-500 to-emerald-800",
    evergreen: "from-lime-300 via-emerald-600 to-teal-900",
    soil: "from-amber-200 via-stone-500 to-neutral-900",
    mulch: "from-orange-300 via-amber-900 to-stone-950",
    lavender: "from-violet-300 via-purple-500 to-emerald-900",
    pot: "from-stone-200 via-stone-400 to-teal-900",
  };

  return <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${toneClasses[tone]} ${className}`}><div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.55),transparent_22%),radial-gradient(circle_at_80%_35%,rgba(255,255,255,.20),transparent_18%),linear-gradient(135deg,transparent,rgba(0,0,0,.20))]" /></div>;
}

function PublicProductCard({
  product,
  compact = false,
  onReserve,
  multiItemMode = false,
  cartQuantity = 0,
  onAddToCart,
}: {
  product: AruterPublicProduct;
  compact?: boolean;
  onReserve?: (product: AruterPublicProduct) => void;
  multiItemMode?: boolean;
  cartQuantity?: number;
  onAddToCart?: (product: AruterPublicProduct) => void;
}) {
  const unavailable = product.stockStatus === "out_of_stock";
  const stockLabel = unavailable ? "Nincs készleten" : product.stockStatus === "limited" ? "Korlátozott készlet" : "Készleten";
  const stockClass = unavailable ? "text-rose-700" : product.stockStatus === "limited" ? "text-amber-700" : "text-emerald-700";
  const actionLabel = unavailable ? "Elfogyott" : multiItemMode ? (cartQuantity > 0 ? `+ Kosárba (${cartQuantity})` : "Kosárba") : "Foglalás";
  const handleAction = () => multiItemMode ? onAddToCart?.(product) : onReserve?.(product);

  if (compact) {
    return (
      <article className="grid grid-cols-[104px_1fr_112px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <ProductVisual tone={product.imageTone} className="h-24 w-24" />
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-950">{product.name}</h3>
          <p className="text-sm font-semibold text-slate-500">{product.description}</p>
          <p className="mt-1 text-lg font-black text-teal-700">{currency(product.price)} / {product.unit}</p>
          <p className={`text-sm font-bold ${stockClass}`}>{unavailable ? "×" : "✓"} {stockLabel}</p>
        </div>
        <button type="button" onClick={handleAction} disabled={unavailable} className="rounded-xl bg-teal-700 px-3 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300">{actionLabel}</button>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <ProductVisual tone={product.imageTone} className="h-36 w-full rounded-none" />
      <div className="p-4">
        <h3 className="text-lg font-black text-slate-950">{product.name}</h3>
        <p className="text-sm font-semibold text-slate-500">{product.description}</p>
        <p className="mt-2 text-lg font-black text-slate-950">{currency(product.price)} / {product.unit}</p>
        <p className={`mt-1 text-sm font-bold ${stockClass}`}>{unavailable ? "×" : "●"} {stockLabel}</p>
        <button type="button" onClick={handleAction} disabled={unavailable} className="mt-4 w-full rounded-xl bg-teal-700 px-4 py-3 font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300">{unavailable ? "Nincs készleten" : actionLabel}</button>
      </div>
    </article>
  );
}

function ReservationSheet({ product, onClose, onReservationCreated }: { product: AruterPublicProduct | null; onClose: () => void; onReservationCreated?: (reservation: AruterPublicReservation) => void }) {
  const [selectedSlotId, setSelectedSlotId] = useState(aruterDemoBusiness.pickupSlots[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdReservation, setCreatedReservation] = useState<AruterPublicReservation | null>(null);

  if (!product) return null;

  const selectedSlot = aruterDemoBusiness.pickupSlots.find((slot) => slot.id === selectedSlotId) ?? aruterDemoBusiness.pickupSlots[0];
  const canSubmit = customerName.trim().length > 1 && phone.trim().length > 5 && acceptedPrivacy;

  async function submitReservation() {
    if (!canSubmit || !product || isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/aruter/public-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug: aruterDemoBusiness.slug,
          product: {
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            unit: product.unit,
          },
          quantity,
          pickupSlotId: selectedSlot?.id ?? selectedSlotId,
          pickupSlotLabel: selectedSlot?.label ?? "",
          customerName,
          phone,
          email,
          note,
          acceptedPrivacy,
        }),
      });
      const result = await response.json() as { ok: boolean; data?: AruterPublicReservation; error?: string };
      if (!response.ok || !result.ok || !result.data) {
        setSubmitError(result.error ?? "A foglalás mentése nem sikerült.");
        return;
      }
      setCreatedReservation(result.data);
      onReservationCreated?.(result.data);
      setSubmitted(true);
    } catch {
      setSubmitError("A foglalás mentése közben hálózati hiba történt.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 px-0 sm:px-4">
      <div className="max-h-[92vh] w-full max-w-[780px] overflow-y-auto rounded-t-[32px] border border-slate-200 bg-white p-5 shadow-[0_-22px_80px_rgba(15,23,42,0.24)] sm:mb-4 sm:rounded-[32px]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={22} /></button>

        {submitted ? (
          <div className="py-8 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check size={42} /></span>
            <h3 className="mt-5 text-3xl font-black text-slate-950">Foglalás rögzítve</h3>
            <p className="mx-auto mt-3 max-w-md font-semibold text-slate-600">
              Foglalás azonosító: {createdReservation?.id ?? "demo"}. {quantity} {product.unit} {product.name}, átvétel {selectedSlot?.label ?? "kiválasztott"} időpontban. Az admin előkészítési panel már ebből az API-állapotból tud frissülni.
            </p>
            <button type="button" onClick={onClose} className="mt-6 rounded-2xl bg-teal-700 px-8 py-4 font-black text-white">Rendben</button>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-[82px_1fr] gap-4 pr-10">
              <ProductVisual tone={product.imageTone} className="h-20 w-20" />
              <div><h3 className="text-xl font-black">{product.name}</h3><p className="font-semibold text-slate-500">{product.description}</p><p className="text-lg font-black text-teal-700">{currency(product.price)} / {product.unit}</p></div>
            </div>

            <div className="grid gap-4 md:grid-cols-[160px_1fr]">
              <label className="block">
                <span className="text-sm font-black text-slate-600">Mennyiség</span>
                <div className="mt-2 flex h-14 items-center rounded-2xl border border-slate-200 bg-white">
                  <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="h-full px-4 font-black text-teal-700">−</button>
                  <input value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} type="number" min="1" className="min-w-0 flex-1 bg-transparent text-center text-xl font-black outline-none" />
                  <button type="button" onClick={() => setQuantity((value) => value + 1)} className="h-full px-4 font-black text-teal-700">+</button>
                </div>
              </label>
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-600"><CalendarDays size={18} /> Átvétel időpontja</h4>
                <div className="grid grid-cols-4 gap-2">{aruterDemoBusiness.pickupSlots.map((slot) => <button type="button" key={slot.id} onClick={() => setSelectedSlotId(slot.id)} className={`rounded-xl border px-3 py-3 font-black ${selectedSlotId === slot.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-800"}`}>{slot.label}</button>)}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="block"><span className="text-sm font-black text-slate-600">Név *</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-2 h-13 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" placeholder="Pl. Kovács Anna" /></label>
              <label className="block"><span className="text-sm font-black text-slate-600">Telefon *</span><input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 h-13 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" placeholder="+36 30 123 4567" /></label>
              <label className="block md:col-span-2"><span className="text-sm font-black text-slate-600">E-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-13 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" placeholder="email@example.hu" /></label>
              <label className="block md:col-span-2"><span className="text-sm font-black text-slate-600">Megjegyzés</span><textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-500" placeholder="Pl. Kérem a bejárat melletti átvételi pontra készíteni." /></label>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              <input type="checkbox" checked={acceptedPrivacy} onChange={(event) => setAcceptedPrivacy(event.target.checked)} className="mt-1 h-5 w-5 accent-teal-700" />
              <span>Elfogadom, hogy a megadott adataimat a foglalás kezelése és az átvétel egyeztetése céljából kezeljék.</span>
            </label>

            <div className="mt-5 rounded-2xl bg-teal-50 p-4">
              <div className="flex items-center justify-between gap-3"><span className="font-black text-slate-700">Foglalás összesen</span><b className="text-2xl text-teal-700">{currency(product.price * quantity)}</b></div>
              <p className="mt-1 text-sm font-semibold text-slate-500">Átvétel: {selectedSlot?.label ?? "nincs kiválasztva"} · Fizetés a helyszínen</p>
            </div>

            {submitError && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-black text-rose-700">{submitError}</p>}
            <button type="button" onClick={submitReservation} disabled={!canSubmit || isSubmitting} className="mt-4 w-full rounded-2xl bg-teal-700 py-4 text-xl font-black text-white shadow-lg disabled:bg-slate-300">{isSubmitting ? "Foglalás mentése..." : "Foglalom"}</button>
          </>
        )}
      </div>
    </div>
  );
}

export function AruterOfferAdminPage() {
  const business = aruterDemoBusiness;
  const [publicReservations, setPublicReservations] = useState<AruterPublicReservation[]>([]);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/aruter/public-reservations?businessSlug=${business.slug}`)
      .then((response) => response.json())
      .then((result: { ok: boolean; data?: AruterPublicReservation[] }) => {
        if (isMounted && result.ok && result.data) setPublicReservations(result.data);
      })
      .catch(() => undefined);
    return () => { isMounted = false; };
  }, [business.slug]);
  const stats = [
    { label: "Aktív ajánlatok", value: "12", sub: "összesen", icon: Tag },
    { label: "Új foglalások", value: "8", sub: "ma", icon: CalendarDays },
    { label: "Átvehető ma", value: "5", sub: "rendelés", icon: Clock3 },
    { label: "Törzsvásárlók", value: "164", sub: "összesen", icon: Users },
  ];
  const menu = ["Vezérlőpult", "Termékek", "Ajánlatok", "Foglalások", "Előkészítés", "Törzsvásárlók", "QR megosztás", "Beállítások"];

  return (
    <AruterPageShell>
      <div className="grid min-h-screen lg:grid-cols-[300px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white p-6 lg:block">
          <AruterBrand compact />
          <nav className="mt-8 space-y-2">{menu.map((item, index) => <Link key={item} href={item === "Foglalások" ? "/aruter/foglalasok" : item === "Előkészítés" ? "/aruter/elokeszites" : "/aruter/ajanlatoldal"} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-black ${index === 0 ? "bg-teal-700 text-white shadow-lg" : "text-slate-700 hover:bg-teal-50"}`}>{index === 0 ? <Store size={20} /> : index === 6 ? <QrCode size={20} /> : index === 7 ? <Settings size={20} /> : <PackageCheck size={20} />}{item}</Link>)}</nav>
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><h3 className="font-black">Az Ön ajánlatoldala</h3><div className="mx-auto my-4 grid h-36 w-36 grid-cols-5 gap-1 rounded-xl bg-white p-3 shadow-inner">{Array.from({ length: 25 }).map((_, index) => <span key={index} className={`rounded-sm ${index % 3 === 0 || index % 7 === 0 ? "bg-slate-950" : "bg-slate-100"}`} />)}</div><p className="text-sm font-black text-teal-700">{business.publicUrl}</p></div>
        </aside>
        <section className="min-w-0">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4"><label className="hidden h-12 w-[520px] items-center gap-3 rounded-2xl border border-slate-200 px-4 md:flex"><Search size={18} /><input className="flex-1 outline-none" placeholder="Keresés termékre, foglalásra, vásárlóra..." /></label><div className="ml-auto flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3"><Store size={18} className="text-teal-700" />{business.name}<ChevronRight size={16} className="rotate-90" /></div><span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white"><Users size={22} /></span></header>
          <main className="p-5 md:p-8"><h1 className="mb-4 text-3xl font-black">Saját ajánlatoldal</h1><div className="mb-5 grid gap-4 md:grid-cols-4">{stats.map((stat) => { const Icon = stat.icon; return <AruterCard key={stat.label} className="flex items-center gap-4 p-5"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-700"><Icon size={30} /></span><span><p className="font-semibold text-slate-500">{stat.label}</p><b className="text-4xl text-teal-700">{stat.value}</b><p className="text-sm text-slate-500">{stat.sub}</p></span></AruterCard>; })}</div>
            <div className="grid gap-5 xl:grid-cols-[1fr_300px]"><div className="space-y-5"><AruterCard className="p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black">Nyilvános ajánlatoldal</h2><div className="flex items-center gap-3"><span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">Élő</span><Link href={`/aruter/${business.slug}`} className="inline-flex items-center gap-2 font-black text-teal-700">{business.publicUrl} <ExternalLink size={18} /></Link></div></div><div className="grid gap-4 md:grid-cols-4">{business.products.slice(0, 4).map((product) => <PublicProductCard key={product.id} product={product} />)}</div><div className="mt-5 rounded-2xl bg-teal-50 p-4"><div className="grid gap-3 md:grid-cols-3"><span className="flex items-center gap-2 font-black text-teal-800"><CalendarDays /> Egyszerű foglalás</span><span className="flex items-center gap-2 font-black text-teal-800"><Users /> Előkészítés</span><span className="flex items-center gap-2 font-black text-teal-800"><ShoppingBag /> Átvétel</span></div></div></AruterCard></div><aside className="space-y-4"><AruterCard className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">Megosztás</h2><Share2 className="text-teal-700" /></div>{["Link másolása", "QR-kód", "Facebook megosztás", "Google cégprofil"].map((item, index) => <button key={item} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left font-black hover:bg-teal-50">{index === 0 ? <Link2 size={18} /> : index === 1 ? <QrCode size={18} /> : index === 2 ? <Share2 size={18} /> : <Sparkles size={18} />}{item}</button>)}</AruterCard><AruterCard className="p-5"><h2 className="mb-4 text-xl font-black">Mai előkészítés</h2>{(publicReservations.length > 0 ? publicReservations.slice(0, 4) : aruterTodayPreparations).map((item) => {
  const isReservation = "productName" in item;
  return <div key={item.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0"><div><b>{item.customerName}</b><p className="text-sm text-slate-500">{isReservation ? `${item.quantity} ${item.productUnit} · ${item.productName}` : `${item.itemCount} tétel`}</p></div><div className="text-right"><p className="text-sm font-black text-slate-600">{isReservation ? item.pickupSlotLabel : item.pickupTime}</p><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{isReservation ? "Új foglalás" : item.status}</span></div></div>;
})}<button className="mt-4 flex w-full items-center justify-between font-black text-teal-700">Összes mai átvétel <ChevronRight /></button></AruterCard></aside></div></main>
        </section>
      </div>
    </AruterPageShell>
  );
}

export function AruterPublicOfferPage() {
  const [selectedProduct, setSelectedProduct] = useState<AruterPublicProduct | null>(null);
  const [createdReservations, setCreatedReservations] = useState<AruterPublicReservation[]>([]);
  const business = aruterDemoBusiness;
  const [products, setProducts] = useState<AruterPublicProduct[]>(business.products);
  const [pilotCatalogEnabled, setPilotCatalogEnabled] = useState(false);
  const [orderBridgeEnabled, setOrderBridgeEnabled] = useState(false);
  const [multiItemCheckoutEnabled, setMultiItemCheckoutEnabled] = useState(false);
  const [cartLines, setCartLines] = useState<StorefrontCartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastCheckout, setLastCheckout] = useState<StorefrontCheckoutSuccess | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lastCheckoutStorageKey(business.slug));
      if (!raw) return;
      const saved = JSON.parse(raw) as StorefrontCheckoutSuccess;
      const expiresAt = saved.trackingExpiresAt ? Date.parse(saved.trackingExpiresAt) : 0;
      if (saved.trackingToken && saved.orderNumber && (!expiresAt || expiresAt > Date.now())) setLastCheckout(saved);
      else window.localStorage.removeItem(lastCheckoutStorageKey(business.slug));
    } catch {
      window.localStorage.removeItem(lastCheckoutStorageKey(business.slug));
    }
  }, [business.slug]);

  useEffect(() => {
    let active = true;
    fetch(`/api/aruter/public-products?businessSlug=${encodeURIComponent(business.slug)}`)
      .then((response) => response.json())
      .then((result: { ok: boolean; data?: { pilotEnabled: boolean; orderBridgeEnabled: boolean; multiItemCheckoutEnabled: boolean; products: AruterPublicProduct[] } }) => {
        if (!active || !result.ok || !result.data) return;
        setPilotCatalogEnabled(result.data.pilotEnabled);
        setOrderBridgeEnabled(result.data.orderBridgeEnabled);
        setMultiItemCheckoutEnabled(result.data.multiItemCheckoutEnabled);
        if (!result.data.multiItemCheckoutEnabled) setCartLines([]);
        setProducts(result.data.pilotEnabled ? result.data.products : business.products);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [business.products, business.slug]);

  const cartQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartGrossTotal = cartLines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const cartQuantityFor = (productId: string) => cartLines.find((line) => line.product.id === productId)?.quantity ?? 0;
  const addToCart = (product: AruterPublicProduct) => {
    setSelectedProduct(null);
    setCartLines((lines) => {
      const existing = lines.find((line) => line.product.id === product.id);
      if (existing) return lines.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...lines, { product, quantity: 1 }];
    });
  };
  const updateCartQuantity = (productId: string, quantity: number) => {
    setCartLines((lines) => quantity <= 0 ? lines.filter((line) => line.product.id !== productId) : lines.map((line) => line.product.id === productId ? { ...line, quantity } : line));
  };
  const removeFromCart = (productId: string) => setCartLines((lines) => lines.filter((line) => line.product.id !== productId));

  return (
    <AruterPageShell className="bg-white pb-8">
      <header className="border-b border-slate-200 bg-white px-4 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4"><AruterBrand compact /><nav className="flex items-center gap-4 text-sm font-black text-slate-700"><a className="hidden items-center gap-2 md:flex"><HelpCircle size={18} /> Hogyan működik?</a><a className="flex items-center gap-2"><LogIn size={18} /> Bejelentkezés</a></nav></div></header>
      <main className="mx-auto max-w-[1500px] px-4 py-5">
        <section className="relative overflow-hidden rounded-[30px] bg-slate-900 text-white shadow-[0_22px_80px_rgba(15,23,42,0.18)]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_38%,rgba(244,114,182,.62),transparent_24%),radial-gradient(circle_at_72%_35%,rgba(132,204,22,.58),transparent_31%),radial-gradient(circle_at_48%_18%,rgba(255,255,255,.16),transparent_18%),linear-gradient(135deg,#14352d,#041915)]" /><div className="absolute inset-0 bg-black/38" /><div className="relative flex min-h-[330px] flex-col items-center justify-center px-6 py-10 text-center md:min-h-[300px] md:items-start md:px-24 md:text-left"><span className="mb-5 flex h-28 w-28 items-center justify-center rounded-3xl bg-white text-emerald-700 shadow-xl ring-8 ring-white/10"><Leaf size={58} /></span><h1 className="text-4xl font-black md:text-6xl">{business.name}</h1><p className="mt-3 text-xl font-semibold text-white/90">{business.tagline}</p><div className="mt-6 flex flex-wrap gap-3"><button className="rounded-xl bg-teal-700 px-5 py-3 font-black">Foglalás menete</button><button className="rounded-xl border border-white/70 px-5 py-3 font-black">Kapcsolat</button></div></div></section>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]"><section><div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]"><label className="flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm"><Search size={18} /><input className="flex-1 outline-none" placeholder="Keresés termékre..." /></label><div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{business.categories.map((category) => <button key={category} className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black hover:bg-teal-50">{category}</button>)}</div></div><div className="mb-5 rounded-2xl border border-lime-200 bg-lime-50 p-4 text-center"><p className="text-lg font-black text-emerald-800">Online foglalás · Előkészítés · Személyes átvétel</p><p className="mt-1 font-semibold text-slate-600">Foglaljon online, mi előkészítjük, Ön pedig a kiválasztott időpontban átveszi.</p>{pilotCatalogEnabled && <div className="mt-3 flex flex-wrap items-center justify-center gap-2"><span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-black text-white">Pilot katalógus · pénztári törzsadatból</span>{orderBridgeEnabled && <span className="rounded-full bg-blue-700 px-3 py-1 text-xs font-black text-white">Pénztári bridge aktív</span>}{multiItemCheckoutEnabled && <span className="rounded-full bg-violet-700 px-3 py-1 text-xs font-black text-white">Többtételes kosár aktív</span>}</div>}</div>{products.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center font-bold text-slate-500">A pilot katalógusban jelenleg nincs foglalható termék.</div> : <><div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-3 xl:grid-cols-4">{products.map((product) => <PublicProductCard key={product.id} product={product} onReserve={setSelectedProduct} multiItemMode={multiItemCheckoutEnabled} cartQuantity={cartQuantityFor(product.id)} onAddToCart={addToCart} />)}</div><div className="grid gap-3 md:hidden">{products.map((product) => <PublicProductCard key={product.id} product={product} compact onReserve={setSelectedProduct} multiItemMode={multiItemCheckoutEnabled} cartQuantity={cartQuantityFor(product.id)} onAddToCart={addToCart} />)}</div></>}</section><aside className="space-y-4">{multiItemCheckoutEnabled && <AruterCard className="p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-xl font-black"><ShoppingBag className="text-teal-700" /> Kosár</h2><span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-black text-teal-700">{cartQuantity} egység</span></div>{cartLines.length === 0 ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">A kosár üres. Tegyen bele több terméket, majd egy rendelésként küldje el.</p> : <><div className="mt-4 space-y-2">{cartLines.slice(0, 4).map((line) => <div key={line.product.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-bold text-slate-700">{line.quantity} × {line.product.name}</span><b className="shrink-0 text-slate-900">{currency(line.product.price * line.quantity)}</b></div>)}</div>{cartLines.length > 4 && <p className="mt-2 text-xs font-bold text-slate-400">+ {cartLines.length - 4} további termék</p>}<div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><span className="font-black text-slate-600">Összesen</span><b className="text-xl text-teal-700">{currency(cartGrossTotal)}</b></div><button type="button" onClick={() => setCheckoutOpen(true)} className="mt-4 w-full rounded-2xl bg-teal-700 py-3 font-black text-white">Tovább a rendeléshez</button></>}</AruterCard>}<AruterCard className="p-5"><h2 className="mb-2 flex items-center gap-2 text-xl font-black"><CalendarDays className="text-teal-700" /> Mai átvételi idősávok</h2><p className="mb-4 text-sm font-semibold text-slate-500">Válasszon időpontot a mai átvételhez.</p><div className="grid grid-cols-4 gap-2 xl:grid-cols-2">{business.pickupSlots.map((slot, index) => <button key={slot.id} className={`rounded-xl border px-3 py-3 font-black ${index === 0 ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white"}`}>{slot.label}</button>)}</div><div className="mt-5 text-sm"><p className="font-black">Átvételi helyszín:</p><p className="font-semibold text-slate-600">{business.name}<br />{business.address}</p></div></AruterCard><AruterCard className="p-5"><h2 className="mb-4 text-xl font-black">Miért érdemes foglalni?</h2>{["Garantált termék elérhetőség", "Időmegtakarítás a helyszínen", "Elkerülheti a készlethiányt", "Ingyenes előkészítés"].map((item) => <p key={item} className="mb-3 flex items-center gap-2 font-semibold text-slate-600"><Check size={18} className="text-emerald-700" />{item}</p>)}</AruterCard></aside></div>
        {lastCheckout && <StorefrontOrderTrackingCard checkout={lastCheckout} />}
        {createdReservations.length > 0 && <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-xl font-black text-emerald-800">{pilotCatalogEnabled ? "Legutóbbi pilot foglalás" : "Legutóbbi demo foglalás"}</h2><p className="mt-2 font-semibold text-slate-700">{createdReservations[0].customerName} · {createdReservations[0].quantity} {createdReservations[0].productUnit} {createdReservations[0].productName} · Átvétel: {createdReservations[0].pickupSlotLabel}</p></section>}
        <section className="mt-5 grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-4"><div><h3 className="flex items-center gap-2 font-black"><MapPin size={18} className="text-teal-700" /> Elérhetőség</h3><p className="mt-2 text-sm font-semibold text-slate-600">{business.address}<br />Bejárat a főút felől, ingyenes parkolás.</p></div><div><h3 className="flex items-center gap-2 font-black"><Clock3 size={18} className="text-teal-700" /> Nyitvatartás</h3>{business.openingHours.map((row) => <p key={row.label} className="mt-1 flex justify-between text-sm font-semibold text-slate-600"><span>{row.label}</span><span>{row.value}</span></p>)}</div><div><h3 className="flex items-center gap-2 font-black"><Phone size={18} className="text-teal-700" /> Kapcsolat</h3><p className="mt-2 text-sm font-semibold text-slate-600">{business.phone}<br />{business.email}</p></div><div className="rounded-2xl bg-[linear-gradient(135deg,#e2e8f0,#f8fafc)] p-5"><MapPin className="mx-auto text-teal-700" size={44} /><p className="text-center text-sm font-black text-slate-500">Térkép helye</p></div></section>
        <section className="mt-5 rounded-3xl bg-teal-50 p-6"><h2 className="mb-5 text-center text-2xl font-black text-teal-800">Hogyan működik?</h2><div className="grid gap-4 md:grid-cols-3">{[["1", "Foglalás", "Válassza ki a termékeket és a megfelelő átvételi idősávot online."], ["2", "Előkészítés", "Összekészítjük a rendelését, hogy gyorsan átvehesse."], ["3", "Átvétel", "Érkezzen a kiválasztott idősávban, és vegye át rendelését."]].map(([num, title, text]) => <div key={num} className="rounded-2xl bg-white p-5"><b className="text-2xl text-teal-700">{num}</b><h3 className="mt-2 text-xl font-black">{title}</h3><p className="mt-2 font-semibold text-slate-600">{text}</p></div>)}</div></section>
      </main>
      <ReservationSheet product={multiItemCheckoutEnabled ? null : selectedProduct} onClose={() => setSelectedProduct(null)} onReservationCreated={(reservation) => setCreatedReservations((items) => [reservation, ...items])} />
      <StorefrontMultiItemCheckout open={multiItemCheckoutEnabled && checkoutOpen} businessSlug={business.slug} pickupSlots={business.pickupSlots} lines={cartLines} onClose={() => setCheckoutOpen(false)} onUpdateQuantity={updateCartQuantity} onRemove={removeFromCart} onCompleted={(result) => {
        setLastCheckout(result);
        setCartLines([]);
        if (result.trackingToken) window.localStorage.setItem(lastCheckoutStorageKey(business.slug), JSON.stringify(result));
      }} />
      {multiItemCheckoutEnabled && cartQuantity > 0 && !checkoutOpen && <button type="button" onClick={() => setCheckoutOpen(true)} className="fixed bottom-4 left-4 right-4 z-40 flex items-center justify-between rounded-2xl bg-teal-700 px-5 py-4 font-black text-white shadow-2xl md:hidden"><span className="flex items-center gap-2"><ShoppingBag size={20} /> Kosár · {cartQuantity}</span><span>{currency(cartGrossTotal)}</span></button>}
    </AruterPageShell>
  );
}

