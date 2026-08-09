"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Grid2X2,
  Home,
  Leaf,
  MapPin,
  Minus,
  Package,
  PackageCheck,
  Plus,
  Printer,
  QrCode,
  Search,
  Send,
  Settings,
  ShoppingCart,
  Store,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { getOrderGrossTotal, getOrderNetTotal, getOrderVatTotal, useAruterStore } from "@/app/lib/aruter/store";
import type { AruterOrder } from "@/app/lib/aruter/types";
import { AruterBrand, AruterCard, AruterMobileBottomNav, AruterPageShell, AruterTopBar, ModeToggle } from "./AruterShared";

function currency(value: number) {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(value);
}

const gardenCategories = [
  { label: "Növények", icon: Leaf, active: true },
  { label: "Földek", icon: Package, active: false },
  { label: "Cserepek", icon: Store, active: false },
  { label: "Kiegészítők", icon: PackageCheck, active: false },
];

function ProductThumb({ className = "" }: { className?: string }) {
  return <div className={`rounded-2xl bg-[linear-gradient(135deg,#9be7c6_0%,#0f766e_100%)] shadow-inner ${className}`} />;
}

function CategoryTabs({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${compact ? "" : "md:gap-4"}`}>
      {gardenCategories.map((cat) => {
        const Icon = cat.icon;
        return (
          <button key={cat.label} type="button" className={`${compact ? "h-20" : "h-24 md:h-28"} rounded-2xl border p-3 font-black shadow-sm transition ${cat.active ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-900 hover:border-teal-300"}`}>
            <Icon className="mx-auto mb-1" size={compact ? 24 : 30} />
            <span className={compact ? "text-sm" : "text-base"}>{cat.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CartSummaryCard({ dense = false, showControls = true }: { dense?: boolean; showControls?: boolean }) {
  const cartItems = useAruterStore((state) => state.cartItems);
  const updateCartQuantity = useAruterStore((state) => state.updateCartQuantity);
  const removeCartItem = useAruterStore((state) => state.removeCartItem);
  const cartGrossTotal = useAruterStore((state) => state.getCartGrossTotal());

  return (
    <AruterCard className={dense ? "p-4" : "p-5"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-black md:text-2xl"><ShoppingCart className="text-teal-700" /> Kosár</h2>
        <span className="rounded-full bg-teal-700 px-3 py-1 text-xs font-black text-white">{cartItems.length} tétel</span>
      </div>
      {cartItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/60 p-4 text-sm font-semibold text-slate-500">A kosár üres. Válassz terméket a listából.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {cartItems.map((row) => {
            const gross = row.quantity * row.priceNet * (1 + row.vatRate / 100);
            return (
              <div key={row.id} className={`grid items-center gap-3 ${dense ? "grid-cols-[1fr_45px_72px] py-2 text-sm" : "grid-cols-[1fr_100px_100px_24px] py-3"}`}>
                <div className="font-bold text-slate-900">{row.productName}</div>
                {dense || !showControls ? <b className="text-right">{row.quantity} {row.unit}</b> : <div className="flex items-center justify-center gap-2"><button type="button" onClick={() => updateCartQuantity(row.id, row.quantity - 1)} className="rounded-lg border p-1"><Minus size={14} /></button><b>{row.quantity}</b><button type="button" onClick={() => updateCartQuantity(row.id, row.quantity + 1)} className="rounded-lg bg-teal-700 p-1 text-white"><Plus size={14} /></button></div>}
                <div className="text-right font-black">{currency(gross)}</div>
                {!dense && showControls && <button type="button" onClick={() => removeCartItem(row.id)}><Trash2 size={16} /></button>}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4"><b>Összesen</b><span className="text-3xl font-black text-teal-700">{currency(cartGrossTotal)}</span></div>
    </AruterCard>
  );
}

function OrderStatusPill({ order }: { order: AruterOrder }) {
  const label = order.status === "paid" ? "Fizetve" : order.status === "issued" ? "Kiadva" : order.status === "sent_to_cashier" ? "Fizetésre vár" : "Rögzítés alatt";
  const cls = order.status === "paid" || order.status === "issued" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-600";
  return <span className={`rounded-2xl px-4 py-3 font-black ${cls}`}>{label}</span>;
}

export function AruterCollectorPage() {
  const products = useAruterStore((state) => state.products);
  const cartItems = useAruterStore((state) => state.cartItems);
  const customerName = useAruterStore((state) => state.customerName);
  const setCustomerName = useAruterStore((state) => state.setCustomerName);
  const addProductToCart = useAruterStore((state) => state.addProductToCart);
  const sendCartToCashier = useAruterStore((state) => state.sendCartToCashier);
  const cartGrossTotal = useAruterStore((state) => state.getCartGrossTotal());

  return (
    <AruterPageShell className="pb-24 md:pb-6">
      <AruterTopBar role="Árufelvevő" />
      <div className="mx-auto grid max-w-[1540px] gap-5 px-4 py-5 xl:grid-cols-[minmax(0,1fr)_480px] 2xl:grid-cols-[minmax(0,1fr)_540px]">
        <section className="space-y-4">
          <AruterCard className="grid gap-3 p-4 sm:grid-cols-[220px_1fr] sm:items-center">
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white"><CircleUserRound size={26} /></span><div><p className="text-sm font-semibold text-slate-500">Sorszám:</p><p className="text-3xl font-black text-teal-700">027</p></div></div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0"><label className="block flex-1"><p className="text-sm font-semibold text-slate-500">Vevő:</p><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="w-full bg-transparent text-2xl font-black outline-none" /></label><ChevronRight className="text-slate-500" /></div>
          </AruterCard>
          <div className="grid gap-3 md:grid-cols-[1fr_220px]"><label className="flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 shadow-sm md:h-16"><Search className="text-slate-500" /><input className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-slate-400" placeholder="Termék keresése (név, cikkszám, vonalkód)" /></label><button type="button" className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-blue-300 bg-white px-5 text-base font-black text-blue-700 shadow-sm md:h-16"><QrCode /> Vonalkód beolvasás</button></div>
          <CategoryTabs />
          <div className="grid gap-3 lg:grid-cols-2">
            {products.concat(products.slice(0, 2)).map((product, index) => (
              <AruterCard key={`${product.id}-${index}`} className="grid grid-cols-[96px_1fr_48px] items-center gap-4 p-3 sm:grid-cols-[120px_1fr_48px]"><ProductThumb className="h-24 w-24 sm:h-28 sm:w-28" /><div><h3 className="text-lg font-black leading-tight">{product.name}</h3><p className="mt-1 text-sm font-semibold text-slate-500">Cikkszám: {product.sku}</p><p className="mt-2 text-lg font-black text-teal-700">{currency(product.priceNet * (1 + product.vatRate / 100))} / {product.unit}</p></div><button type="button" onClick={() => addProductToCart(product.id)} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-teal-200 text-teal-700 hover:bg-teal-50"><Plus /></button></AruterCard>
            ))}
          </div>
        </section>
        <aside className="hidden space-y-4 xl:block xl:sticky xl:top-[88px] xl:self-start"><CartSummaryCard /><AruterCard className="p-4"><h3 className="mb-2 font-black">Megjegyzés</h3><textarea className="h-20 w-full rounded-2xl border border-slate-200 p-3 outline-none" placeholder="Írjon megjegyzést a rendeléshez..." /></AruterCard><AruterCard className="p-4"><h3 className="mb-2 font-black">Aláírás</h3><div className="rounded-2xl border border-slate-200 p-4 text-center text-4xl italic">{customerName}</div></AruterCard><button type="button" onClick={() => sendCartToCashier()} disabled={cartItems.length === 0} className="flex h-20 w-full items-center justify-center gap-4 rounded-2xl bg-blue-700 text-2xl font-black text-white shadow-xl disabled:bg-slate-300"><ShoppingCart /> Pénztárra küldés <ChevronRight /></button><div className="grid grid-cols-2 gap-3"><button className="h-14 rounded-2xl border border-teal-300 bg-white font-black text-teal-700">Új kosár</button><button className="h-14 rounded-2xl border border-blue-300 bg-white font-black text-blue-700">Mentés</button></div></aside>
        <div className="fixed inset-x-0 bottom-[74px] z-30 mx-auto w-[calc(100%-24px)] max-w-xl xl:hidden"><div className="rounded-3xl border border-teal-200 bg-white/96 p-3 shadow-[0_18px_60px_rgba(15,118,110,0.18)] backdrop-blur"><div className="flex items-center justify-between gap-3"><span className="font-black">Kosár: {cartItems.length} tétel</span><b className="text-2xl text-teal-700">{currency(cartGrossTotal)}</b><button type="button" onClick={() => sendCartToCashier()} disabled={cartItems.length === 0} className="rounded-2xl bg-blue-700 px-4 py-3 font-black text-white disabled:bg-slate-300">Pénztárra</button></div></div></div>
      </div>
      <AruterMobileBottomNav active="products" />
    </AruterPageShell>
  );
}

function CashierStepper({ status = "sent_to_cashier" }: { status?: AruterOrder["status"] }) {
  const steps = ["Kosár létrehozva", "Pénztárra küldve", "Fizetés folyamatban", "Fizetve"];
  const activeIndex = status === "issued" || status === "paid" ? 3 : status === "sent_to_cashier" ? 2 : 1;
  return <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 font-black">Rendelés folyamata</div><div className="grid grid-cols-4 items-start gap-2 text-center text-xs font-bold text-slate-500">{steps.map((label, index) => <div key={label} className="relative">{index < steps.length - 1 && <span className={`absolute left-1/2 top-5 h-0.5 w-full ${index < activeIndex ? "bg-emerald-600" : "bg-slate-300"}`} />}<span className={`relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border-4 bg-white ${index === activeIndex && activeIndex < 3 ? "border-orange-400 text-orange-600" : index <= activeIndex ? "border-emerald-600 text-emerald-700" : "border-slate-300 text-slate-400"}`}>{index < activeIndex || activeIndex === 3 ? <Check size={18} /> : index + 1}</span><p className={index === activeIndex && activeIndex < 3 ? "mt-2 text-orange-600" : index <= activeIndex ? "mt-2 text-emerald-700" : "mt-2 text-slate-500"}>{label}</p></div>)}</div></div>;
}

export function AruterCashierPage() {
  const orders = useAruterStore((state) => state.orders);
  const markOrderPaid = useAruterStore((state) => state.markOrderPaid);
  const markOrderIssued = useAruterStore((state) => state.markOrderIssued);
  const selectedOrder = orders[0];
  return (
    <AruterPageShell>
      <AruterTopBar role="Pénztáros" showSunMode={false} />
      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 xl:grid-cols-[500px_1fr] 2xl:grid-cols-[560px_1fr]">
        <AruterCard className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-2xl font-black"><ShoppingCart className="text-emerald-700" /> Beérkező kosarak</h2><span className="rounded-full bg-emerald-700 px-4 py-1 text-sm font-black text-white">{orders.length} db</span></div><label className="mb-4 flex h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4"><Search size={18} /><input className="flex-1 outline-none" placeholder="Rendelések keresése (név, sorszám)" /></label><div className="divide-y divide-slate-100">{orders.map((order, index) => <button key={order.id} className={`grid w-full grid-cols-[88px_1fr_54px_100px_26px] items-center gap-2 py-4 text-left ${index === 0 ? "rounded-2xl border border-emerald-500 bg-emerald-50 px-3" : "px-3"}`}><b className="text-xl text-emerald-700">{order.orderNumber.slice(-4)}</b><span><b className="block">{order.customerName}</b><small>{new Date(order.createdAt).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}</small></span><span className="font-black">{order.items.length}</span><span className="font-black">{currency(getOrderGrossTotal(order))}</span><ChevronRight /></button>)}</div></AruterCard>
        {selectedOrder && <AruterCard className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 md:p-6"><div className="flex flex-wrap items-center gap-6"><span>Sorszám: <b className="ml-3 text-4xl text-emerald-700">{selectedOrder.orderNumber.slice(-4)}</b></span><span>Vevő: <b className="ml-3 text-2xl">{selectedOrder.customerName}</b></span></div><OrderStatusPill order={selectedOrder} /></div><div className="p-5 md:p-6"><div className="mb-4 hidden grid-cols-[1fr_150px_130px_130px_36px] text-sm font-black text-slate-500 md:grid"><span>Termék</span><span>Mennyiség</span><span>Egységár</span><span>Összeg</span><span /></div>{selectedOrder.items.map((item) => <div key={item.id} className="grid gap-3 border-t border-slate-100 py-4 md:grid-cols-[1fr_150px_130px_130px_36px] md:items-center"><div><b>{item.productName}</b><p className="text-sm text-slate-500">Cikkszám: {item.sku}</p></div><div className="font-black">{item.quantity} {item.unit}</div><b>{currency(item.priceNet)}</b><b>{currency(item.quantity * item.priceNet * (1 + item.vatRate / 100))}</b><Trash2 size={18} /></div>)}<div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]"><textarea className="min-h-28 rounded-2xl border border-slate-200 p-4" placeholder="Írjon megjegyzést a rendeléshez..." /><div className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between"><span>Részösszeg</span><b>{currency(getOrderNetTotal(selectedOrder))}</b></div><div className="flex justify-between py-3"><span>Áfa</span><b>{currency(getOrderVatTotal(selectedOrder))}</b></div><div className="flex justify-between border-t pt-3"><b>Összesen</b><b className="text-3xl text-emerald-700">{currency(getOrderGrossTotal(selectedOrder))}</b></div></div></div><div className="mt-6 grid gap-4 md:grid-cols-3"><button className="h-16 rounded-2xl bg-emerald-700 font-black text-white">Átvezetve a pénztárgépbe</button><button type="button" onClick={() => markOrderPaid(selectedOrder.id)} className="h-16 rounded-2xl bg-emerald-700 font-black text-white"><Check className="inline" /> Fizetve</button><button type="button" onClick={() => markOrderIssued(selectedOrder.id)} className="h-16 rounded-2xl border border-emerald-300 bg-white font-black text-emerald-700"><Printer className="inline" /> Kiadva / Nyomtatás</button></div><CashierStepper status={selectedOrder.status} /></div></AruterCard>}
      </div>
    </AruterPageShell>
  );
}

export function AruterAdminPage() {
  const products = useAruterStore((state) => state.products);
  const orders = useAruterStore((state) => state.orders);
  const menu = [[Home, "Áttekintés"], [Package, "Termékek"], [Grid2X2, "Kategóriák"], [ClipboardList, "Készlet"], [MapPin, "Árutér helyek"], [Users, "Felhasználók"], [BarChart3, "Riportok"], [Settings, "Beállítások"]] as const;
  const waitingTotal = orders.filter((order) => order.status === "sent_to_cashier").reduce((sum, order) => sum + getOrderGrossTotal(order), 0);
  const stats = [{ label: "Aktív termékek", value: String(products.length), Icon: Leaf }, { label: "Mai kosarak", value: String(orders.length), Icon: ShoppingCart }, { label: "Fizetésre vár", value: currency(waitingTotal), Icon: WalletCards }, { label: "Alacsony készlet", value: String(products.filter((product) => product.stockQuantity < 30).length), Icon: AlertTriangle }];
  return (
    <AruterPageShell><div className="grid min-h-screen lg:grid-cols-[260px_1fr]"><aside className="hidden border-r border-slate-200 bg-white p-5 lg:block"><AruterBrand compact /><nav className="mt-8 space-y-2">{menu.map(([Icon, label]) => <button key={label} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-black ${label === "Termékek" ? "bg-emerald-50 text-emerald-700" : "text-slate-600"}`}><Icon size={20} />{label}</button>)}</nav><div className="mt-20 rounded-2xl border border-slate-200 p-4 text-sm"><b>Segítségre van szüksége?</b><p className="mt-2 text-slate-500">Tudástár és támogatás.</p></div></aside><section className="min-w-0"><header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6"><div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3"><Home size={18} className="text-emerald-700" />Kovács Kertészet <ChevronDown size={16} /></div><label className="hidden h-12 w-[420px] items-center gap-3 rounded-2xl border border-slate-200 px-4 xl:flex"><Search size={18} /><input className="flex-1 outline-none" placeholder="Keresés..." /></label><div className="flex items-center gap-3"><span className="hidden rounded-full bg-emerald-50 px-4 py-2 font-black text-emerald-700 md:inline">Kapcsolat: Online</span><ModeToggle /><CircleUserRound className="text-emerald-700" /></div></header><div className="p-4 md:p-6"><p className="mb-4 text-sm font-bold text-slate-500">Termékek › <b className="text-slate-900">Termékkezelő</b></p><div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, Icon }) => <AruterCard key={label} className="p-5"><Icon className="mb-3 text-emerald-700" /><p className="text-sm font-semibold text-slate-500">{label}</p><b className="text-3xl">{value}</b></AruterCard>)}</div><div className="grid gap-5 2xl:grid-cols-[1fr_330px]"><AruterCard className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><h2 className="text-2xl font-black">Termékek</h2><div className="flex gap-2"><button className="rounded-xl border px-4 py-2 font-black">Szűrők</button><button className="rounded-xl border px-4 py-2 font-black text-teal-700">Szerkesztés</button><button className="rounded-xl bg-teal-700 px-4 py-2 font-black text-white"><Plus className="inline" /> Új termék</button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Termék</th><th>Kategória</th><th>Egység</th><th>Ár</th><th>Készlet</th><th>Hely</th><th>Státusz</th></tr></thead><tbody>{products.concat(products).map((p, index) => <tr key={`${p.id}-${index}`} className="border-t border-slate-100"><td className="p-4"><div className="flex items-center gap-3"><ProductThumb className="h-12 w-12" /><span><b>{p.name}</b><p className="text-xs text-slate-500">Cikkszám: {p.sku}</p></span></div></td><td><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{p.category}</span></td><td>{p.unit}</td><td><b>{currency(p.priceNet)}</b></td><td className={p.stockQuantity < 30 ? "font-black text-red-600" : "font-black text-emerald-700"}>{p.stockQuantity}</td><td>A{index + 1}-01</td><td><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">Aktív</span></td></tr>)}</tbody></table></div></AruterCard><AruterCard className="p-5 2xl:sticky 2xl:top-24 2xl:self-start"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Termék adatai</h2><span>×</span></div><ProductThumb className="my-4 h-32 w-full" /><div className="space-y-3">{["Termék neve", "Cikkszám", "Vonalkód", "Ár", "Készlet", "Kategória", "Árutér helye"].map((label) => <label key={label} className="block"><span className="text-xs font-black text-slate-500">{label}</span><input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none" defaultValue={label === "Termék neve" ? products[0]?.name ?? "" : ""} /></label>)}<div className="grid grid-cols-2 gap-3 pt-2"><button className="rounded-2xl border border-slate-200 py-3 font-black">Mégsem</button><button className="rounded-2xl bg-teal-700 py-3 font-black text-white">Mentés</button></div></div></AruterCard></div></div></section></div></AruterPageShell>
  );
}

export function AruterCustomerPage() {
  const products = useAruterStore((state) => state.products);
  const addProductToCart = useAruterStore((state) => state.addProductToCart);
  return (
    <AruterPageShell className="pb-24"><div className="mx-auto max-w-[780px] px-4 py-5 lg:max-w-[880px]"><header className="mb-5 flex items-center justify-between gap-3"><AruterBrand compact /><div className="text-center"><div className="flex items-center justify-center gap-2 font-black"><Store size={20} className="text-teal-700" /> Kovács Kertészet</div><span className="rounded-full bg-lime-100 px-3 py-1 text-sm font-black text-lime-700">★ Törzsvásárló</span></div><CircleUserRound className="text-teal-700" /></header><AruterCard className="mb-4 grid grid-cols-[76px_1fr] gap-4 p-4 sm:grid-cols-[90px_1fr_180px] sm:items-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-50 text-lime-700 sm:h-20 sm:w-20"><CalendarClock size={34} /></span><div><p className="font-semibold text-slate-500">Következő átvétel</p><b className="rounded-full bg-lime-100 px-3 py-1 text-lime-700">Előkészítés alatt</b><p className="mt-2 text-slate-500">Rendelésszám: #10248</p></div><div className="col-span-2 border-t border-slate-100 pt-3 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0"><p className="font-semibold text-slate-500">Átvétel időpontja</p><b className="text-3xl">Ma 16:30</b></div></AruterCard><label className="mb-4 flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5"><Search /><input className="flex-1 outline-none" placeholder="Termék keresése..." /></label><CategoryTabs compact /><AruterCard className="my-4 overflow-hidden">{products.slice(0, 3).map((p) => <div key={p.id} className="grid grid-cols-[108px_1fr_52px] items-center border-b border-slate-100 p-3 last:border-b-0 sm:grid-cols-[130px_1fr_64px]"><ProductThumb className="h-24 w-24 sm:h-28 sm:w-28" /><div><b className="text-xl">{p.name}</b><p className="text-slate-500">Cikkszám: {p.sku}</p><p className="text-xl font-black text-teal-700">{currency(p.priceNet * (1 + p.vatRate / 100))} / {p.unit}</p></div><button type="button" onClick={() => addProductToCart(p.id)} className="rounded-2xl border p-3 text-teal-700"><Plus /></button></div>)}</AruterCard><div className="grid gap-4 md:grid-cols-2"><CartSummaryCard dense showControls={false} /><AruterCard className="p-4"><h2 className="mb-3 flex items-center gap-2 text-xl font-black"><CalendarClock /> Átvétel tervezése</h2><label className="text-sm font-semibold text-slate-500">Átvétel időpontja</label><button className="mt-1 flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 font-black">Ma 16:30 <ChevronDown /></button><textarea className="mt-3 h-24 w-full rounded-2xl border border-slate-200 p-3" placeholder="Megjegyzés opcionális" /><button className="mt-3 w-full rounded-2xl bg-teal-700 py-3 font-black text-white">Lefoglalás</button><button className="mt-2 w-full rounded-2xl border border-teal-700 py-3 font-black text-teal-700"><Send className="inline" /> Értesítés a boltnak</button></AruterCard></div><AruterCard className="mt-4 p-4"><h2 className="mb-4 font-black">Rendelés állapota</h2><CashierStepper /></AruterCard></div><AruterMobileBottomNav active="bookings" /></AruterPageShell>
  );
}

export function AruterLandingPage() {
  const resetDemoState = useAruterStore((state) => state.resetDemoState);
  const pages = [
    { href: "/aruter/arufelvevo", title: "Árufelvevő", text: "Tablet/mobil gyors árurögzítő felület." },
    { href: "/aruter/penztar", title: "Pénztár", text: "Beérkező kosarak, fizetés és nyomtatás." },
    { href: "/aruter/admin", title: "Admin", text: "Termékek, készlet, felhasználók és riportok." },
    { href: "/aruter/ajanlatoldal", title: "Ajánlatoldal", text: "Nyilvános ajánlatok, QR megosztás és foglalások." },
    { href: "/aruter/kovacs-kerteszet", title: "Nyilvános oldal", text: "Slug alapú vásárlói ajánlatoldal." },
    { href: "/aruter/foglalasok", title: "Foglalások", text: "Nyilvános foglalások admin listája és státuszkezelése." },
    { href: "/aruter/elokeszites", title: "Előkészítés", text: "Mai átvételek és összekészítési feladatok." },
    { href: "/aruter/adatbazis", title: "Adatbázis", text: "Supabase kapcsolat és repository mód ellenőrzése." },
    { href: "/aruter/torzsvasarlo", title: "Törzsvásárló", text: "Zárt foglalási és átvételi kosár." },
  ];
  return <AruterPageShell><div className="mx-auto max-w-[1280px] px-5 py-10"><div className="flex flex-wrap items-start justify-between gap-4"><AruterBrand /><button type="button" onClick={resetDemoState} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:border-teal-300">Demo állapot visszaállítása</button></div><p className="mt-6 text-3xl font-black">Külső árutérből a pénztárig – papír nélkül, valós időben.</p><p className="mt-3 max-w-3xl font-semibold text-slate-600">Az MVP állapot most már böngészőben megmarad: a kosár, a pénztárra küldött rendelések és státuszok oldalfrissítés után is visszatöltődnek.</p><div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-9">{pages.map((page) => <Link key={page.href} href={page.href} className="rounded-[26px] border border-emerald-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><h2 className="text-2xl font-black text-teal-700">{page.title}</h2><p className="mt-3 font-semibold text-slate-600">{page.text}</p><span className="mt-6 inline-flex items-center gap-2 font-black text-teal-700">Megnyitás <ChevronRight /></span></Link>)}</div></div></AruterPageShell>;
}