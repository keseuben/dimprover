"use client";

import React from "react";
import {
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  PackageCheck,
  RadioTower,
  ScanLine,
  Search,
  Send,
  ShoppingCart,
  Store,
  UserRoundCheck,
  Warehouse,
} from "lucide-react";
import { aruterFeatureFlags, aruterOrders, aruterProducts, aruterRealtimeEvents } from "@/app/lib/aruter/mockData";
import type { AruterCartItem, AruterOrder, AruterOrderStatus, AruterProduct, AruterRealtimeEvent, AruterTemplate } from "@/app/lib/aruter/types";

const templates: Array<{ key: AruterTemplate; label: string; description: string }> = [
  { key: "kertészet", label: "Kertészet", description: "külső árutér, növény, zsákos és raklapos áruk" },
  { key: "tüzép", label: "Tüzép", description: "építőanyag, raklap, raktár és udvari kiadás" },
  { key: "húsbolt", label: "Húsbolt", description: "pult, hűtőpult, előrendelés és gyors átvétel" },
  { key: "egyedi", label: "Egyedi árutér", description: "bármilyen pénztár előtti termékrögzítési folyamat" },
];

const statusLabels: Record<AruterOrderStatus, string> = {
  draft: "Rögzítés alatt",
  sent_to_cashier: "Pénztárra küldve",
  paid: "Fizetve",
  issued: "Kiadva",
  cancelled: "Törölve",
};

const statusClasses: Record<AruterOrderStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  sent_to_cashier: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-cyan-200 bg-cyan-50 text-cyan-700",
  issued: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(value);
}

function getGrossTotal(order: AruterOrder) {
  return order.items.reduce((sum, item) => sum + item.quantity * item.priceNet * (1 + item.vatRate / 100), 0);
}

function productToCartItem(product: AruterProduct): AruterCartItem {
  return {
    id: `item-${product.id}-${Date.now()}`,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    unit: product.unit,
    quantity: 1,
    priceNet: product.priceNet,
    vatRate: product.vatRate,
    storageZone: product.storageZone,
  };
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative overflow-hidden rounded-[28px] border border-emerald-200/70 bg-white/88 shadow-[0_22px_70px_rgba(15,118,110,0.10)] backdrop-blur ${className}`}>
      <span className="absolute right-5 top-5 h-12 w-12 rounded-full border border-emerald-200/70 bg-emerald-50/50" />
      {children}
    </section>
  );
}

function StatusPill({ status }: { status: AruterOrderStatus }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${statusClasses[status]}`}>{statusLabels[status]}</span>;
}

export default function AruterDashboard() {
  const [selectedTemplate, setSelectedTemplate] = React.useState<AruterTemplate>("kertészet");
  const [products] = React.useState(aruterProducts);
  const [orders, setOrders] = React.useState(aruterOrders);
  const [events, setEvents] = React.useState(aruterRealtimeEvents);
  const [cartItems, setCartItems] = React.useState<AruterCartItem[]>([]);
  const [customerName, setCustomerName] = React.useState("Helyszíni vásárló");
  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredProducts = products.filter((product) => {
    const matchesTemplate = product.template === selectedTemplate || selectedTemplate === "egyedi";
    const matchesSearch = `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(searchTerm.toLowerCase());
    return product.isActive && matchesTemplate && matchesSearch;
  });

  const cartGrossTotal = cartItems.reduce((sum, item) => sum + item.quantity * item.priceNet * (1 + item.vatRate / 100), 0);
  const cashierQueue = orders.filter((order) => ["sent_to_cashier", "paid"].includes(order.status));

  function addEvent(event: Omit<AruterRealtimeEvent, "id" | "createdAt">) {
    setEvents((previous) => [
      {
        ...event,
        id: `evt-${Date.now()}`,
        createdAt: new Date().toISOString(),
      },
      ...previous,
    ]);
  }

  function addToCart(product: AruterProduct) {
    setCartItems((previous) => {
      const existing = previous.find((item) => item.productId === product.id);
      if (existing) {
        return previous.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...previous, productToCartItem(product)];
    });
  }

  function updateQuantity(itemId: string, quantity: number) {
    setCartItems((previous) => previous.map((item) => (item.id === itemId ? { ...item, quantity: Math.max(0.1, quantity) } : item)));
  }

  function sendCartToCashier() {
    if (cartItems.length === 0) return;
    const orderNumber = `AR-2026-${String(orders.length + 1).padStart(4, "0")}`;
    const order: AruterOrder = {
      id: `ord-${Date.now()}`,
      orderNumber,
      template: selectedTemplate,
      status: "sent_to_cashier",
      customerName,
      customerType: "walk_in",
      recorderName: "Árutéri dolgozó",
      createdAt: new Date().toISOString(),
      sentToCashierAt: new Date().toISOString(),
      items: cartItems,
    };

    setOrders((previous) => [order, ...previous]);
    setCartItems([]);
    addEvent({
      type: "cart_sent",
      orderId: order.id,
      orderNumber,
      title: "Kosár pénztárra küldve",
      description: `${order.items.length} tétel · ${templates.find((template) => template.key === selectedTemplate)?.label ?? "Árutér"}`,
    });
  }

  function markPaid(orderId: string) {
    setOrders((previous) => previous.map((order) => (order.id === orderId ? { ...order, status: "paid", cashierName: "Pénztáros 1", paymentMethod: "card", paidAt: new Date().toISOString() } : order)));
    const order = orders.find((item) => item.id === orderId);
    addEvent({
      type: "payment_registered",
      orderId,
      orderNumber: order?.orderNumber,
      title: "Fizetés rögzítve",
      description: "A rendelés kiadásra vár.",
    });
  }

  function markIssued(orderId: string) {
    setOrders((previous) => previous.map((order) => (order.id === orderId ? { ...order, status: "issued", issuerName: "Kiadó dolgozó", issuedAt: new Date().toISOString() } : order)));
    const order = orders.find((item) => item.id === orderId);
    addEvent({
      type: "goods_issued",
      orderId,
      orderNumber: order?.orderNumber,
      title: "Áru kiadva",
      description: "A fizetett rendelés lezárva.",
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(20,184,166,0.18),transparent_32%),linear-gradient(135deg,#f8fffb_0%,#ecfeff_42%,#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-6">
        <header className="relative overflow-hidden rounded-[34px] border border-emerald-200/80 bg-white/86 p-6 shadow-[0_24px_90px_rgba(15,118,110,0.12)] backdrop-blur md:p-8">
          <div className="absolute inset-0 opacity-[0.26] [background-image:linear-gradient(rgba(20,184,166,.24)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,.20)_1px,transparent_1px)] [background-size:46px_46px]" />
          <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-300 bg-lime-50 text-lg font-black text-emerald-700 shadow-[0_0_26px_rgba(132,204,22,0.22)]">P</span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">DIMPRO külön app · aruter.dimpro.hu</p>
                  <h1 className="text-4xl font-black tracking-tight text-teal-700 md:text-6xl">Árutér</h1>
                </div>
              </div>
              <p className="max-w-4xl text-xl font-black text-slate-900 md:text-2xl">Külső árutérből a pénztárig – papír nélkül, valós időben.</p>
              <p className="mt-4 max-w-4xl text-sm font-semibold leading-7 text-slate-600 md:text-base">
                Az Árutér nem csak udvart jelent: pult, raktár, rakodótér, hűtőpult, kiszolgálótér és minden pénztár előtti termékrögzítési pont külön workflow-ba szervezhető.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: ScanLine, label: "Árurögzítés", value: "gyors kosár" },
                { icon: CreditCard, label: "Pénztár", value: "élő sor" },
                { icon: PackageCheck, label: "Árukiadás", value: "fizetve / kiadva" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-3xl border border-emerald-200/80 bg-white/82 p-4 shadow-sm">
                    <Icon className="mb-4 text-teal-600" size={28} />
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{item.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {templates.map((template) => (
            <button
              key={template.key}
              type="button"
              onClick={() => setSelectedTemplate(template.key)}
              className={`rounded-[26px] border p-5 text-left shadow-sm transition ${selectedTemplate === template.key ? "border-teal-400 bg-teal-600 text-white shadow-[0_18px_44px_rgba(13,148,136,0.25)]" : "border-emerald-200 bg-white/84 text-slate-900 hover:border-teal-300"}`}
            >
              <div className="mb-3 flex items-center gap-3">
                <Store size={22} />
                <span className="text-lg font-black">{template.label}</span>
              </div>
              <p className={`text-sm font-semibold leading-6 ${selectedTemplate === template.key ? "text-teal-50" : "text-slate-500"}`}>{template.description}</p>
            </button>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr_0.9fr]">
          <Panel>
            <div className="relative p-5 md:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">1. Belső árufelvevő</p>
                  <h2 className="mt-1 text-2xl font-black">Áru kiválasztása és kosár rögzítése</h2>
                </div>
                <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-lime-700">MVP aktív</span>
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_220px]">
                <label className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                  <Search size={18} className="text-teal-600" />
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Termék, SKU vagy kategória keresése..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
                </label>
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none" />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {filteredProducts.map((product) => (
                  <button key={product.id} type="button" onClick={() => addToCart(product)} className="rounded-3xl border border-emerald-100 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{product.sku}</div>
                        <div className="mt-1 text-base font-black text-slate-950">{product.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                          <span>{product.category}</span>
                          <span>·</span>
                          <span>{product.storageZone}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-teal-700">{formatCurrency(product.priceNet * (1 + product.vatRate / 100))}</div>
                        <div className="mt-1 text-[11px] font-bold text-slate-400">{product.stockQuantity} {product.unit}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-3xl border border-teal-200 bg-teal-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-black text-teal-900"><ShoppingCart size={18} /> Aktuális kosár</div>
                  <div className="text-lg font-black text-teal-900">{formatCurrency(cartGrossTotal)}</div>
                </div>
                <div className="space-y-2">
                  {cartItems.length === 0 && <div className="rounded-2xl border border-dashed border-teal-200 bg-white/70 p-4 text-sm font-semibold text-slate-500">Nincs még tétel. Válassz terméket az árufelvevő listából.</div>}
                  {cartItems.map((item) => (
                    <div key={item.id} className="grid items-center gap-2 rounded-2xl bg-white p-3 sm:grid-cols-[1fr_110px_120px]">
                      <div>
                        <div className="text-sm font-black text-slate-900">{item.productName}</div>
                        <div className="text-[11px] font-semibold text-slate-500">{item.sku} · {item.storageZone}</div>
                      </div>
                      <input type="number" min="0.1" step="0.1" value={item.quantity} onChange={(event) => updateQuantity(item.id, Number(event.target.value))} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-black outline-none" />
                      <div className="text-right text-sm font-black text-slate-900">{formatCurrency(item.quantity * item.priceNet * (1 + item.vatRate / 100))}</div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={sendCartToCashier} disabled={cartItems.length === 0} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_34px_rgba(13,148,136,0.28)] transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                  <Send size={17} /> Kosár pénztárra küldése
                </button>
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="relative p-5 md:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">2. Pénztár</p>
                  <h2 className="mt-1 text-2xl font-black">Élő rendeléskezelő</h2>
                </div>
                <CreditCard className="text-teal-600" size={28} />
              </div>
              <div className="space-y-3">
                {cashierQueue.map((order) => (
                  <article key={order.id} className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black text-slate-950">{order.orderNumber}</div>
                        <div className="text-sm font-semibold text-slate-500">{order.customerName}</div>
                      </div>
                      <StatusPill status={order.status} />
                    </div>
                    <div className="mb-3 space-y-1 text-sm font-semibold text-slate-600">
                      {order.items.map((item) => <div key={item.id} className="flex justify-between gap-3"><span>{item.productName}</span><span>{item.quantity} {item.unit}</span></div>)}
                    </div>
                    <div className="mb-4 flex items-center justify-between border-t border-emerald-100 pt-3">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Bruttó összesen</span>
                      <span className="text-xl font-black text-teal-700">{formatCurrency(getGrossTotal(order))}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" disabled={order.status !== "sent_to_cashier"} onClick={() => markPaid(order.id)} className="rounded-2xl bg-cyan-600 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white disabled:bg-slate-300">
                        Fizetve
                      </button>
                      <button type="button" disabled={order.status !== "paid"} onClick={() => markIssued(order.id)} className="rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white disabled:bg-slate-300">
                        Kiadva
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </Panel>

          <div className="grid gap-6">
            <Panel>
              <div className="relative p-5 md:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">3. Admin alap</p>
                    <h2 className="mt-1 text-2xl font-black">Termékkezelő és készlet</h2>
                  </div>
                  <Boxes className="text-teal-600" size={28} />
                </div>
                <div className="space-y-2">
                  {products.slice(0, 5).map((product) => (
                    <div key={product.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-emerald-100 bg-white p-3">
                      <div>
                        <div className="text-sm font-black text-slate-900">{product.name}</div>
                        <div className="text-[11px] font-semibold text-slate-500">{product.sku} · {product.storageZone}</div>
                      </div>
                      <div className="text-right text-sm font-black text-teal-700">{product.stockQuantity} {product.unit}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel>
              <div className="relative p-5 md:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">Socket.IO alap</p>
                    <h2 className="mt-1 text-2xl font-black">Realtime eseményfolyam</h2>
                  </div>
                  <RadioTower className="text-teal-600" size={28} />
                </div>
                <div className="space-y-3">
                  {events.slice(0, 5).map((event) => (
                    <div key={event.id} className="rounded-2xl border border-emerald-100 bg-white p-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-600"><BadgeCheck size={16} /></span>
                        <div>
                          <div className="text-sm font-black text-slate-900">{event.title}</div>
                          <div className="text-xs font-semibold text-slate-500">{event.orderNumber ? `${event.orderNumber} · ` : ""}{event.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel>
            <div className="relative p-5 md:p-6">
              <div className="mb-5 flex items-center gap-3">
                <UserRoundCheck className="text-teal-600" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">4. későbbi lépcső</p>
                  <h2 className="text-2xl font-black">Törzsvásárlói zárt foglalás</h2>
                </div>
              </div>
              <p className="text-sm font-semibold leading-7 text-slate-600">
                Nem webshopként indul. A törzsvásárló zárt felületen kosarat állít össze, átvételi időpontot jelez, az üzlet pedig felkészül az érkezésre.
              </p>
            </div>
          </Panel>

          <Panel>
            <div className="relative p-5 md:p-6">
              <div className="mb-5 flex items-center gap-3">
                <ClipboardList className="text-teal-600" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">Fejlesztési fázisok</p>
                  <h2 className="text-2xl font-black">MVP feature flag alap</h2>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {aruterFeatureFlags.map((flag) => (
                  <div key={flag.key} className={`rounded-3xl border p-4 ${flag.enabledInMvp ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-2xl font-black text-slate-900">{flag.phase}</span>
                      {flag.enabledInMvp ? <CheckCircle2 size={18} className="text-teal-600" /> : <Warehouse size={18} className="text-slate-400" />}
                    </div>
                    <div className="text-sm font-black text-slate-900">{flag.label}</div>
                    <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{flag.enabledInMvp ? "MVP" : "később"}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}
