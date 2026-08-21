"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Boxes, CheckCircle2, ChevronRight, ExternalLink, Link2, Loader2, Package, RefreshCw, Save, Store, Unplug, Warehouse } from "lucide-react";
import { AruterBrand, AruterCard, AruterPageShell } from "./AruterShared";

type ApiResult<T> = { ok: boolean; data?: T; error?: string; code?: string };
type Mapping = { id: string; externalProductId: string; externalSku: string | null; productId: string; variantId: string; fulfillmentSourceId: string | null; active: boolean };
type Source = { id: string; code: string; name: string };
type Variant = { id: string; productId: string; name: string; sku: string | null; unit: string; status: string };
type Product = { id: string; name: string; status: string; variants: Variant[] };
type ExternalProduct = { id: string; sku: string; name: string; unit: string; stockQuantity: number; priceNet: number; vatRate: number };
type AdminState = {
  storefront: { id: string; slug: string; status: string; defaultFulfillmentSourceId: string | null };
  sources: Source[];
  products: Product[];
  mappings: Mapping[];
  externalCatalog: { repositoryMode: "mock" | "database"; catalogMode: "repository" | "commerce"; products: ExternalProduct[] };
};
type Draft = { productId: string; variantId: string; fulfillmentSourceId: string; active: boolean };
const EMPTY_DRAFT: Draft = { productId: "", variantId: "", fulfillmentSourceId: "", active: true };

function money(value: number) {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(value);
}

export function CommerceStorefrontAdmin({ storefrontSlug = "kovacs-kerteszet" }: { storefrontSlug?: string }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [defaultSourceId, setDefaultSourceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ storefrontSlug });
      const response = await fetch(`/api/v1/commerce/storefront-admin?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as ApiResult<AdminState>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "A Storefront admin állapot nem tölthető be.");
      setState(result.data);
      setDefaultSourceId(result.data.storefront.defaultFulfillmentSourceId || "");
      setSelectedExternalId((current) => current && result.data!.externalCatalog.products.some((item) => item.id === current) ? current : result.data!.externalCatalog.products[0]?.id || null);
    } catch (cause) {
      setState(null);
      setError(cause instanceof Error ? cause.message : "A Storefront admin állapot nem tölthető be.");
    } finally { setLoading(false); }
  }, [storefrontSlug]);

  useEffect(() => { void load(); }, [load]);

  const selectedExternal = useMemo(() => state?.externalCatalog.products.find((item) => item.id === selectedExternalId) || null, [state, selectedExternalId]);
  const selectedMapping = useMemo(() => state?.mappings.find((item) => item.externalProductId === selectedExternalId) || null, [state, selectedExternalId]);
  const selectedProduct = useMemo(() => state?.products.find((item) => item.id === draft.productId) || null, [state, draft.productId]);
  const activeSource = state?.sources.find((item) => item.id === state.storefront.defaultFulfillmentSourceId);
  const mappedCount = state?.externalCatalog.products.filter((external) => state.mappings.some((mapping) => mapping.externalProductId === external.id && mapping.active)).length || 0;

  useEffect(() => {
    if (!state || !selectedExternalId) { setDraft(EMPTY_DRAFT); return; }
    const mapping = state.mappings.find((item) => item.externalProductId === selectedExternalId);
    setDraft(mapping ? { productId: mapping.productId, variantId: mapping.variantId, fulfillmentSourceId: mapping.fulfillmentSourceId || "", active: mapping.active } : EMPTY_DRAFT);
  }, [state, selectedExternalId]);

  function changeProduct(productId: string) {
    const product = state?.products.find((item) => item.id === productId);
    setDraft((current) => ({ ...current, productId, variantId: product?.variants[0]?.id || "" }));
  }

  async function saveMapping(event: FormEvent) {
    event.preventDefault();
    if (!selectedExternal || !draft.productId || !draft.variantId) { setError("Válasszon Commerce terméket és termékváltozatot."); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/v1/commerce/storefront-mappings", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ storefrontSlug, externalProductId: selectedExternal.id, externalSku: selectedExternal.sku, productId: draft.productId, variantId: draft.variantId, fulfillmentSourceId: draft.fulfillmentSourceId || null, active: draft.active, metadata: { source: "commerce-storefront-admin-p3", repositoryMode: state?.externalCatalog.repositoryMode || null, catalogMode: state?.externalCatalog.catalogMode || null } }),
      });
      const result = await response.json() as ApiResult<Mapping>;
      if (!response.ok || !result.ok) throw new Error(result.error || "A Storefront kapcsolat mentése sikertelen.");
      setNotice(`${selectedExternal.name}: kapcsolat mentve.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A Storefront kapcsolat mentése sikertelen."); }
    finally { setSaving(false); }
  }

  async function saveDefaultSource() {
    setSavingDefault(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/v1/commerce/storefront-admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ storefrontSlug, defaultFulfillmentSourceId: defaultSourceId || null }) });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error || "Az alapértelmezett fulfillment forrás mentése sikertelen.");
      setNotice("Storefront alapértelmezett fulfillment forrás mentve."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Az alapértelmezett fulfillment forrás mentése sikertelen."); }
    finally { setSavingDefault(false); }
  }

  return (
    <AruterPageShell>
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4"><AruterBrand compact /><span className="hidden h-10 w-px bg-slate-200 sm:block" /><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commerce Core</p><h1 className="text-xl font-black">Storefront kapcsolatok</h1></div></div>
          <div className="flex flex-wrap items-center gap-2"><Link href="/aruter/admin/termekek" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700"><ArrowLeft size={17} /> Termékek</Link><Link href={`/aruter/${storefrontSlug}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 font-black text-teal-700"><ExternalLink size={17} /> Nyilvános oldal</Link><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Frissítés</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-500">Árutér admin › Commerce Core › Storefront</p><h2 className="mt-1 text-3xl font-black">Kovács Kertészet pilot kapcsolat</h2><p className="mt-1 max-w-3xl font-semibold text-slate-500">A nyilvános Árutér termékeit itt kapcsolhatja a Commerce terméktörzshöz és a kiszolgáló készletforráshoz.</p></div>{state && <span className={`rounded-full border px-4 py-2 text-xs font-black ${state.externalCatalog.catalogMode === "commerce" || state.externalCatalog.repositoryMode === "database" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>Katalógus: {state.externalCatalog.catalogMode === "commerce" ? "Commerce DB" : state.externalCatalog.repositoryMode === "database" ? "repository DB" : "pilot / mock"}</span>}</div>
        {error && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle size={20} /><div><b>Storefront admin hiba</b><p className="mt-1 text-sm font-semibold">{error}</p></div></div>}
        {notice && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 size={20} /><div><b>Sikeres mentés</b><p className="mt-1 text-sm font-semibold">{notice}</p></div></div>}

        {loading && !state ? <AruterCard className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-teal-700" size={34} /></AruterCard> : state ? <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AruterCard className="p-5"><Store className="mb-3 text-teal-700" /><p className="text-sm font-semibold text-slate-500">Storefront</p><b className="text-2xl">{state.storefront.slug}</b><p className="mt-1 text-xs font-black text-emerald-600">{state.storefront.status}</p></AruterCard>
            <AruterCard className="p-5"><Link2 className="mb-3 text-teal-700" /><p className="text-sm font-semibold text-slate-500">Aktív kapcsolatok</p><b className="text-3xl">{mappedCount} / {state.externalCatalog.products.length}</b><p className="mt-1 text-xs font-semibold text-slate-400">nyilvános termék lefedettség</p></AruterCard>
            <AruterCard className="p-5"><Warehouse className="mb-3 text-teal-700" /><p className="text-sm font-semibold text-slate-500">Alap fulfillment forrás</p><b className="block truncate text-lg">{activeSource ? `${activeSource.name} · ${activeSource.code}` : "Nincs beállítva"}</b></AruterCard>
            <AruterCard className="p-5"><Boxes className="mb-3 text-teal-700" /><p className="text-sm font-semibold text-slate-500">Commerce termékek</p><b className="text-3xl">{state.products.length}</b></AruterCard>
          </div>

          <AruterCard className="mb-5 p-5"><div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-end"><div><div className="flex items-center gap-2"><Warehouse size={19} className="text-teal-700" /><b>Storefront alapértelmezett kiszolgáló készletforrás</b></div><p className="mt-1 text-sm font-semibold text-slate-500">Termékszintű felülbírálás hiányában ezt a belső forrást használja a rendelés.</p></div><div className="flex gap-2"><select value={defaultSourceId} onChange={(event) => setDefaultSourceId(event.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-semibold"><option value="">Nincs alapértelmezett forrás</option>{state.sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.code}</option>)}</select><button type="button" onClick={() => void saveDefaultSource()} disabled={savingDefault || defaultSourceId === (state.storefront.defaultFulfillmentSourceId || "")} className="inline-flex h-12 items-center gap-2 rounded-xl bg-teal-700 px-4 font-black text-white disabled:bg-slate-300"><Save size={17} /> {savingDefault ? "Mentés..." : "Mentés"}</button></div></div></AruterCard>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
            <AruterCard className="overflow-hidden"><div className="border-b border-slate-100 p-5"><h3 className="text-xl font-black">Nyilvános Árutér termékek</h3><p className="mt-1 text-sm font-semibold text-slate-500">Válasszon terméket a Commerce kapcsolat ellenőrzéséhez vagy módosításához.</p></div><div className="divide-y divide-slate-100">{state.externalCatalog.products.map((external) => { const mapping = state.mappings.find((item) => item.externalProductId === external.id); const product = mapping ? state.products.find((item) => item.id === mapping.productId) : null; const source = mapping?.fulfillmentSourceId ? state.sources.find((item) => item.id === mapping.fulfillmentSourceId) : activeSource; return <button key={external.id} type="button" onClick={() => setSelectedExternalId(external.id)} className={`grid w-full gap-3 p-4 text-left md:grid-cols-[1fr_150px_110px_190px_170px_24px] md:items-center ${selectedExternalId === external.id ? "bg-teal-50/70" : "bg-white hover:bg-teal-50/40"}`}><span className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-50 text-emerald-700"><Package size={20} /></span><span className="min-w-0"><b className="block truncate">{external.name}</b><span className="text-xs font-semibold text-slate-400">{money(external.priceNet)} nettó · {external.vatRate}% ÁFA</span></span></span><span className="font-semibold text-slate-600">{external.sku}</span><b>{external.stockQuantity} {external.unit}</b><span>{mapping?.active ? <><b className="text-emerald-700">Kapcsolva</b><small className="block truncate text-slate-500">{product?.name || mapping.productId}</small></> : <b className="text-amber-600">Nincs aktív kapcsolat</b>}</span><small className="font-bold text-slate-500">{source?.name || "—"}</small><ChevronRight size={18} className="text-slate-400" /></button>; })}</div></AruterCard>

            <AruterCard className="h-fit p-5 xl:sticky xl:top-5">{selectedExternal ? <form onSubmit={saveMapping}><div className="mb-5"><p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">Termékkapcsolat</p><h3 className="mt-1 text-2xl font-black">{selectedExternal.name}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{selectedExternal.sku} · {selectedExternal.unit} · külső ID: {selectedExternal.id}</p></div><div className="space-y-4">
              <label className="block"><span className="text-sm font-black">Commerce termék *</span><select value={draft.productId} onChange={(event) => changeProduct(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold"><option value="">Válasszon terméket...</option>{state.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
              <label className="block"><span className="text-sm font-black">Termékváltozat *</span><select value={draft.variantId} onChange={(event) => setDraft({ ...draft, variantId: event.target.value })} disabled={!selectedProduct} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold disabled:bg-slate-50"><option value="">Válasszon változatot...</option>{selectedProduct?.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {variant.sku || "nincs SKU"} · {variant.unit}</option>)}</select></label>
              <label className="block"><span className="text-sm font-black">Termékszintű fulfillment forrás</span><select value={draft.fulfillmentSourceId} onChange={(event) => setDraft({ ...draft, fulfillmentSourceId: event.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold"><option value="">Storefront alapértelmezett használata</option>{state.sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.code}</option>)}</select></label>
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"><span><b className="block">Kapcsolat aktív</b><span className="text-xs font-semibold text-slate-500">Inaktív állapotban a Storefront termék nem oldódik fel Commerce tételre.</span></span><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} className="h-5 w-5 accent-teal-700" /></label>
            </div><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm"><div className="flex items-center gap-2"><Link2 size={17} className="text-teal-700" /><b>Aktuális állapot</b></div>{selectedMapping ? <p className="mt-3 font-semibold text-slate-600">Mapping: <b className={selectedMapping.active ? "text-emerald-700" : "text-amber-700"}>{selectedMapping.active ? "aktív" : "inaktív"}</b> · {selectedMapping.id.slice(0, 8)}…</p> : <div className="mt-3 flex items-center gap-2 font-semibold text-amber-700"><Unplug size={16} /> Még nincs Commerce mapping.</div>}</div><button disabled={saving || !draft.productId || !draft.variantId} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-black text-white disabled:bg-slate-300"><Save size={18} /> {saving ? "Kapcsolat mentése..." : "Kapcsolat mentése"}</button></form> : <div className="flex min-h-64 flex-col items-center justify-center text-center"><Link2 className="text-slate-300" size={38} /><b className="mt-3">Válasszon Árutér terméket</b></div>}</AruterCard>
          </div>
        </> : null}
      </div>
    </AruterPageShell>
  );
}
