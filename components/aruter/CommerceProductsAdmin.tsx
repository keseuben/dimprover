"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Barcode, Boxes, ChevronRight, Layers3, Loader2, Package, PackagePlus, Pencil, Plus, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Tags, X } from "lucide-react";
import { CommerceProductMediaGallery } from "./CommerceProductMediaGallery";
import { AruterBrand, AruterCard, AruterPageShell } from "./AruterShared";

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  typeModel: string | null;
  categoryId: string | null;
  brandId: string | null;
  manufacturerId: string | null;
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  defaultVariantId: string | null;
  sku: string | null;
  unit: string | null;
  price: string | null;
  currency: string | null;
  internalAvailableQuantity: string;
  externalAvailableQuantity: string;
  externalSyncStatus: string | null;
  primaryMediaAssetId: string | null;
};

type ProductDetail = Omit<ProductSummary, "defaultVariantId" | "sku" | "unit" | "price" | "currency" | "internalAvailableQuantity" | "externalAvailableQuantity" | "externalSyncStatus"> & {
  variants: Array<{ id: string; name: string; sku: string | null; unit: string; status: string; attributes: Record<string, unknown> }>;
  identifiers: Array<{ id: string; type: string; value: string; primary: boolean; variantId: string | null }>;
};

type ApiResult<T> = { ok: boolean; data?: T; error?: string; code?: string };

type CatalogOption = { id: string; name: string; parentId?: string | null };

type CreateDraft = {
  name: string;
  typeModel: string;
  sku: string;
  unit: string;
  ean: string;
  categoryId: string;
  brandId: string;
  manufacturerId: string;
};

type VariantDraft = { name: string; sku: string; unit: string };
type EditDraft = {
  name: string;
  typeModel: string;
  categoryId: string;
  brandId: string;
  manufacturerId: string;
  status: ProductSummary["status"];
};

const EMPTY_DRAFT: CreateDraft = { name: "", typeModel: "", sku: "", unit: "DB", ean: "", categoryId: "", brandId: "", manufacturerId: "" };
const EMPTY_VARIANT: VariantDraft = { name: "", sku: "", unit: "DB" };
const EMPTY_EDIT: EditDraft = { name: "", typeModel: "", categoryId: "", brandId: "", manufacturerId: "", status: "DRAFT" };

function statusLabel(status: ProductSummary["status"]) {
  if (status === "ACTIVE") return "Aktív";
  if (status === "DRAFT") return "Vázlat";
  if (status === "INACTIVE") return "Inaktív";
  return "Archivált";
}

function statusClass(status: ProductSummary["status"]) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "DRAFT") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}


function formatPrice(product: ProductSummary) {
  if (product.price == null || !product.currency) return null;
  const amount = Number(product.price);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("hu-HU", { style:"currency", currency:product.currency, maximumFractionDigits:product.currency === "HUF" ? 0 : 2 }).format(amount);
}

function formatQuantity(value: string, unit: string | null) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return "—";
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits:3 }).format(quantity)}${unit ? ` ${unit.toLowerCase()}` : ""}`;
}

function EmptyValue() {
  return <span className="text-slate-400">—</span>;
}

export function CommerceProductsAdmin() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [brands, setBrands] = useState<CatalogOption[]>([]);
  const [manufacturers, setManufacturers] = useState<CatalogOption[]>([]);
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(EMPTY_VARIANT);
  const [addingVariant, setAddingVariant] = useState(false);
  const [savingVariant, setSavingVariant] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_EDIT);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/v1/commerce/catalog/categories?active=true", { cache: "no-store" }).then((response) => response.json() as Promise<ApiResult<CatalogOption[]>>),
      fetch("/api/v1/commerce/catalog/brands?active=true", { cache: "no-store" }).then((response) => response.json() as Promise<ApiResult<CatalogOption[]>>),
      fetch("/api/v1/commerce/catalog/manufacturers?active=true", { cache: "no-store" }).then((response) => response.json() as Promise<ApiResult<CatalogOption[]>>),
    ]).then(([categoryResult, brandResult, manufacturerResult]) => {
      if (!active) return;
      setCategories(categoryResult.ok && categoryResult.data ? categoryResult.data : []);
      setBrands(brandResult.ok && brandResult.data ? brandResult.data : []);
      setManufacturers(manufacturerResult.ok && manufacturerResult.data ? manufacturerResult.data : []);
    }).catch(() => {
      if (!active) return;
      setCategories([]); setBrands([]); setManufacturers([]);
    });
    return () => { active = false; };
  }, []);

  const loadProducts = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      params.set("limit", "100");
      const response = await fetch(`/api/v1/commerce/products?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as ApiResult<{ items: ProductSummary[] }>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "A terméklista nem tölthető be.");
      setProducts(result.data.items);
      setSelectedId((current) => current && result.data!.items.some((item) => item.id === current) ? current : result.data!.items[0]?.id ?? null);
    } catch (cause) {
      setProducts([]);
      setSelectedId(null);
      setError(cause instanceof Error ? cause.message : "A terméklista nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(query), 250);
    return () => window.clearTimeout(timer);
  }, [loadProducts, query]);

  useEffect(() => {
    setEditMode(false);
    if (!selectedId || createMode) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    fetch(`/api/v1/commerce/products/${selectedId}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() as ApiResult<ProductDetail> }))
      .then(({ response, result }) => {
        if (!active) return;
        if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "A termékadatok nem tölthetők be.");
        setDetail(result.data);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "A termékadatok nem tölthetők be."))
      .finally(() => active && setDetailLoading(false));
    return () => { active = false; };
  }, [selectedId, createMode]);

  const selected = useMemo(() => products.find((item) => item.id === selectedId) ?? null, [products, selectedId]);

  function catalogName(items: CatalogOption[], id: string | null | undefined) {
    return id ? items.find((item) => item.id === id)?.name || null : null;
  }

  async function refreshDetail(productId = selectedId) {
    if (!productId) return;
    const response = await fetch(`/api/v1/commerce/products/${productId}`, { cache: "no-store" });
    const result = await response.json() as ApiResult<ProductDetail>;
    if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "A termékadatok nem tölthetők újra.");
    setDetail(result.data);
  }

  async function createVariant(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !variantDraft.name.trim()) return;
    setSavingVariant(true); setError(null);
    try {
      const response = await fetch(`/api/v1/commerce/products/${selectedId}/variants`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: variantDraft.name.trim(), sku: variantDraft.sku.trim() || null, unit: variantDraft.unit, status: "ACTIVE", attributes: {} }),
      });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error || "A termékváltozat mentése sikertelen.");
      setVariantDraft(EMPTY_VARIANT); setAddingVariant(false); await refreshDetail(selectedId); await loadProducts(query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A termékváltozat mentése sikertelen."); }
    finally { setSavingVariant(false); }
  }

  function beginEdit() {
    const source = detail || selected;
    if (!source) return;
    setEditDraft({
      name: source.name || "",
      typeModel: source.typeModel || "",
      categoryId: source.categoryId || "",
      brandId: source.brandId || "",
      manufacturerId: source.manufacturerId || "",
      status: source.status,
    });
    setEditMode(true);
  }

  async function saveProductEdit(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !editDraft.name.trim()) return;
    setSavingEdit(true); setError(null);
    try {
      const response = await fetch(`/api/v1/commerce/products/${selectedId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          typeModel: editDraft.typeModel.trim() || null,
          categoryId: editDraft.categoryId || null,
          brandId: editDraft.brandId || null,
          manufacturerId: editDraft.manufacturerId || null,
          status: editDraft.status,
        }),
      });
      const result = await response.json() as ApiResult<ProductDetail>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "A termék módosítása sikertelen.");
      setDetail(result.data);
      setEditMode(false);
      await loadProducts(query);
      setSelectedId(selectedId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A termék módosítása sikertelen."); }
    finally { setSavingEdit(false); }
  }

  async function savePrice(event: FormEvent) {
    event.preventDefault();
    const variantId = selected?.defaultVariantId || detail?.variants[0]?.id || null;
    const amount = priceDraft.trim();
    if (!variantId || !/^\d+(?:[.,]\d{1,4})?$/.test(amount)) { setError("A nettó egységár legfeljebb 4 tizedesjegyű érték legyen."); return; }
    setSavingPrice(true); setError(null);
    try {
      const response = await fetch("/api/v1/commerce/prices", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId, currency: "HUF", amount, vatRateBasisPoints: 2700 }),
      });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error || "Az ár mentése sikertelen.");
      setPriceDraft(""); await loadProducts(query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Az ár mentése sikertelen."); }
    finally { setSavingPrice(false); }
  }


  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const identifiers = draft.ean.trim() ? [{ type: "EAN_GTIN", value: draft.ean.trim(), primary: true }] : [];
      const response = await fetch("/api/v1/commerce/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          typeModel: draft.typeModel.trim() || null,
          categoryId: draft.categoryId || null,
          brandId: draft.brandId || null,
          manufacturerId: draft.manufacturerId || null,
          status: "ACTIVE",
          defaultVariant: { name: draft.name.trim(), sku: draft.sku.trim() || null, unit: draft.unit },
          identifiers,
        }),
      });
      const result = await response.json() as ApiResult<ProductDetail>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || "A termék mentése sikertelen.");
      setDraft(EMPTY_DRAFT);
      setCreateMode(false);
      await loadProducts(query);
      setSelectedId(result.data.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A termék mentése sikertelen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AruterPageShell>
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <AruterBrand compact />
              <span className="hidden h-10 w-px bg-slate-200 sm:block" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commerce Core</p>
                <h1 className="text-xl font-black text-slate-900">Termékek</h1>
              </div>
            </div>
            <div className="flex items-center gap-2"><Link href="/aruter/admin/penztar" className="hidden h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700 lg:inline-flex"><ShoppingCart size={17} /> Pénztár</Link><Link href="/aruter/admin/bevetelezes" className="hidden h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700 sm:inline-flex"><PackagePlus size={17} /> Bevételezés</Link><Link href="/aruter/admin/torzsadatok" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700"><Tags size={17} /> Törzsadatok</Link><button
              type="button"
              onClick={() => { setCreateMode(true); setSelectedId(null); setDraft(EMPTY_DRAFT); }}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 font-black text-white shadow-sm hover:bg-teal-800"
            >
              <Plus size={18} /> Új termék
            </button></div>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex h-12 min-w-[260px] flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-teal-400">
              <Search size={18} className="text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Termék, típus vagy modell keresése..." />
              {query && <button type="button" onClick={() => setQuery("")} className="text-slate-400"><X size={17} /></button>}
            </label>
            <button type="button" className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-600"><SlidersHorizontal size={17} /> Szűrők</button>
            <button type="button" onClick={() => void loadProducts(query)} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-600"><RefreshCw size={17} /> Frissítés</button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <AlertCircle className="mt-0.5 shrink-0" size={20} />
              <div><b>Commerce Core állapot</b><p className="mt-1 text-sm font-semibold">{error}</p></div>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <AruterCard className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div><h2 className="text-xl font-black">Terméktörzs</h2><p className="text-sm font-semibold text-slate-500">{loading ? "Betöltés..." : `${products.length} termék`}</p></div>
                {loading && <Loader2 className="animate-spin text-teal-700" size={22} />}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                    <tr><th className="p-4">Termék</th><th>Típus / modell</th><th>Ár</th><th>Belső készlet</th><th>Külső készlet</th><th>Státusz</th><th className="w-10" /></tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} onClick={() => { setCreateMode(false); setSelectedId(product.id); }} className={`cursor-pointer border-t border-slate-100 transition hover:bg-teal-50/40 ${selectedId === product.id ? "bg-teal-50/70" : "bg-white"}`}>
                        <td className="p-4"><div className="flex items-center gap-3"><span className="flex h-11 w-11 overflow-hidden items-center justify-center rounded-xl bg-slate-100 text-slate-500">{product.primaryMediaAssetId ? <span aria-hidden className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(/api/v1/commerce/media/assets/${product.primaryMediaAssetId}/content?kind=THUMBNAIL)` }} /> : <Package size={20} />}</span><div><b className="text-slate-900">{product.name}</b><p className="mt-0.5 text-xs font-semibold text-slate-400">{product.slug}</p></div></div></td>
                        <td className="font-semibold text-slate-600">{product.typeModel || <EmptyValue />}</td>
                        <td><b>{formatPrice(product) || <EmptyValue />}</b></td><td><b className="text-emerald-700">{formatQuantity(product.internalAvailableQuantity, product.unit)}</b></td><td><div><b>{formatQuantity(product.externalAvailableQuantity, product.unit)}</b>{product.externalSyncStatus && <p className="mt-0.5 text-[11px] font-black text-slate-400">{product.externalSyncStatus}</p>}</div></td>
                        <td><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(product.status)}`}>{statusLabel(product.status)}</span></td>
                        <td><ChevronRight size={18} className="text-slate-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {products.map((product) => (
                  <button key={product.id} type="button" onClick={() => { setCreateMode(false); setSelectedId(product.id); }} className="flex w-full items-center gap-3 p-4 text-left">
                    <span className="flex h-12 w-12 shrink-0 overflow-hidden items-center justify-center rounded-xl bg-slate-100 text-slate-500">{product.primaryMediaAssetId ? <span aria-hidden className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(/api/v1/commerce/media/assets/${product.primaryMediaAssetId}/content?kind=THUMBNAIL)` }} /> : <Package size={21} />}</span>
                    <span className="min-w-0 flex-1"><b className="block truncate">{product.name}</b><span className="block truncate text-sm font-semibold text-slate-500">{product.typeModel || "Nincs típus/modell"}</span></span>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-black ${statusClass(product.status)}`}>{statusLabel(product.status)}</span>
                    <ChevronRight size={18} className="text-slate-400" />
                  </button>
                ))}
              </div>

              {!loading && products.length === 0 && !error && <div className="p-10 text-center"><Package className="mx-auto text-slate-300" size={38} /><b className="mt-3 block">Nincs megjeleníthető termék.</b><p className="mt-1 text-sm font-semibold text-slate-500">Hozza létre az első Commerce terméket.</p></div>}
            </AruterCard>

            <AruterCard className="h-fit p-5 xl:sticky xl:top-5">
              {createMode ? (
                <form onSubmit={createProduct}>
                  <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">Új termék</p><h2 className="mt-1 text-2xl font-black">Gyors felvitel</h2></div><button type="button" onClick={() => setCreateMode(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500"><X size={18} /></button></div>
                  <div className="space-y-4">
                    <label className="block"><span className="text-sm font-black">Termék neve *</span><input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name:e.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-teal-400" /></label>
                    <label className="block"><span className="text-sm font-black">Típus / modell</span><input value={draft.typeModel} onChange={(e) => setDraft({ ...draft, typeModel:e.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-teal-400" /></label>
                    <label className="block"><span className="text-sm font-black">Kategória</span><select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId:e.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none"><option value="">Nincs megadva</option>{categories.map((item)=><option key={item.id} value={item.id}>{item.parentId ? "↳ " : ""}{item.name}</option>)}</select></label>
                    <div className="grid grid-cols-2 gap-3"><label className="block"><span className="text-sm font-black">Márka</span><select value={draft.brandId} onChange={(e) => setDraft({ ...draft, brandId:e.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none"><option value="">Nincs</option>{brands.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block"><span className="text-sm font-black">Gyártó</span><select value={draft.manufacturerId} onChange={(e) => setDraft({ ...draft, manufacturerId:e.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none"><option value="">Nincs</option>{manufacturers.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
                    <label className="block"><span className="text-sm font-black">Cikkszám / SKU</span><input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku:e.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-teal-400" /></label>
                    <div className="grid grid-cols-[1fr_110px] gap-3"><label className="block"><span className="text-sm font-black">EAN / GTIN</span><div className="mt-1.5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-teal-400"><Barcode size={18} className="text-slate-400" /><input value={draft.ean} onChange={(e) => setDraft({ ...draft, ean:e.target.value })} className="min-w-0 flex-1 outline-none" /></div></label><label className="block"><span className="text-sm font-black">Egység</span><select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit:e.target.value })} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 outline-none"><option>DB</option><option>KG</option><option>M</option><option>M2</option><option>M3</option><option>L</option><option>CSOMAG</option></select></label></div>
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setCreateMode(false)} className="h-12 rounded-xl border border-slate-200 font-black">Mégsem</button><button disabled={saving || !draft.name.trim()} className="h-12 rounded-xl bg-teal-700 font-black text-white disabled:bg-slate-300">{saving ? "Mentés..." : "Termék mentése"}</button></div>
                </form>
              ) : detailLoading ? (
                <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-teal-700" /></div>
              ) : detail || selected ? (
                <div>
                  <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-14 w-14 shrink-0 overflow-hidden items-center justify-center rounded-2xl bg-teal-50 text-teal-700">{selected?.primaryMediaAssetId ? <span aria-hidden className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(/api/v1/commerce/media/assets/${selected.primaryMediaAssetId}/content?kind=THUMBNAIL)` }} /> : <Package size={25} />}</span><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Termék adatai</p><h2 className="mt-1 truncate text-2xl font-black">{detail?.name || selected?.name}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{detail?.typeModel || selected?.typeModel || "Nincs megadott típus/modell"}</p></div></div><button type="button" onClick={beginEdit} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 hover:border-teal-300 hover:text-teal-700"><Pencil size={15}/> Szerkesztés</button></div>
                  {editMode && <form onSubmit={saveProductEdit} className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/40 p-4"><div className="flex items-center justify-between gap-3"><div><b>Termék szerkesztése</b><p className="mt-0.5 text-xs font-semibold text-slate-500">A gyakori alapadatok egy helyen módosíthatók.</p></div><button type="button" onClick={()=>setEditMode(false)} className="rounded-lg p-2 text-slate-500"><X size={17}/></button></div><div className="mt-4 space-y-3"><label className="block"><span className="text-xs font-black text-slate-600">Termék neve *</span><input value={editDraft.name} onChange={(e)=>setEditDraft({...editDraft,name:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-400"/></label><label className="block"><span className="text-xs font-black text-slate-600">Típus / modell</span><input value={editDraft.typeModel} onChange={(e)=>setEditDraft({...editDraft,typeModel:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-400"/></label><label className="block"><span className="text-xs font-black text-slate-600">Kategória</span><select value={editDraft.categoryId} onChange={(e)=>setEditDraft({...editDraft,categoryId:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Nincs megadva</option>{categories.map((item)=><option key={item.id} value={item.id}>{item.parentId?"↳ ":""}{item.name}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="block"><span className="text-xs font-black text-slate-600">Márka</span><select value={editDraft.brandId} onChange={(e)=>setEditDraft({...editDraft,brandId:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm"><option value="">Nincs</option>{brands.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block"><span className="text-xs font-black text-slate-600">Gyártó</span><select value={editDraft.manufacturerId} onChange={(e)=>setEditDraft({...editDraft,manufacturerId:e.target.value})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm"><option value="">Nincs</option>{manufacturers.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label className="block"><span className="text-xs font-black text-slate-600">Státusz</span><select value={editDraft.status} onChange={(e)=>setEditDraft({...editDraft,status:e.target.value as ProductSummary["status"]})} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="ACTIVE">Aktív</option><option value="DRAFT">Vázlat</option><option value="INACTIVE">Inaktív</option></select></label></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setEditMode(false)} className="h-10 rounded-xl border border-slate-200 bg-white text-sm font-black">Mégsem</button><button disabled={savingEdit||!editDraft.name.trim()} className="h-10 rounded-xl bg-teal-700 text-sm font-black text-white disabled:bg-slate-300">{savingEdit?"Mentés...":"Módosítás mentése"}</button></div></form>}
                  <div className="my-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Belső készlet</p><b className="mt-1 block text-xl">{formatQuantity(selected?.internalAvailableQuantity || "0", selected?.unit || detail?.variants[0]?.unit || null)}</b></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Külső készlet</p><b className="mt-1 block text-xl">{formatQuantity(selected?.externalAvailableQuantity || "0", selected?.unit || detail?.variants[0]?.unit || null)}</b>{selected?.externalSyncStatus && <p className="mt-1 text-[11px] font-black text-slate-400">{selected.externalSyncStatus}</p>}</div></div>
                  <div className="space-y-3 border-t border-slate-100 pt-4"><div className="flex justify-between gap-4"><span className="text-sm font-semibold text-slate-500">SKU</span><b className="text-right">{detail?.variants[0]?.sku || <EmptyValue />}</b></div><div className="flex justify-between gap-4"><span className="text-sm font-semibold text-slate-500">Egység</span><b>{detail?.variants[0]?.unit || <EmptyValue />}</b></div><div className="flex justify-between gap-4"><span className="text-sm font-semibold text-slate-500">Elsődleges azonosító</span><b className="max-w-[220px] truncate text-right">{detail?.identifiers.find((item) => item.primary)?.value || detail?.identifiers[0]?.value || <EmptyValue />}</b></div><div className="flex justify-between gap-4"><span className="text-sm font-semibold text-slate-500">Státusz</span><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass((detail?.status || selected!.status))}`}>{statusLabel(detail?.status || selected!.status)}</span></div><div className="flex justify-between gap-4"><span className="text-sm font-semibold text-slate-500">Kategória</span><b className="text-right">{catalogName(categories, detail?.categoryId || selected?.categoryId) || <EmptyValue />}</b></div><div className="flex justify-between gap-4"><span className="text-sm font-semibold text-slate-500">Márka</span><b className="text-right">{catalogName(brands, detail?.brandId || selected?.brandId) || <EmptyValue />}</b></div><div className="flex justify-between gap-4"><span className="text-sm font-semibold text-slate-500">Gyártó</span><b className="text-right">{catalogName(manufacturers, detail?.manufacturerId || selected?.manufacturerId) || <EmptyValue />}</b></div></div>
                  <div className="mt-5 rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Layers3 size={18} className="text-teal-700" /><b>Termékváltozatok</b></div><button type="button" onClick={()=>setAddingVariant((value)=>!value)} className="rounded-lg border border-teal-200 px-2.5 py-1.5 text-xs font-black text-teal-700"><Plus size={14} className="inline"/> Új</button></div><div className="mt-3 space-y-2">{detail?.variants.map((variant)=><div key={variant.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><div className="min-w-0"><b className="block truncate text-sm">{variant.name}</b><span className="text-xs font-semibold text-slate-500">{variant.sku || "nincs SKU"} · {variant.unit}</span></div><span className="text-[11px] font-black text-slate-400">{variant.status}</span></div>)}</div>{addingVariant&&<form onSubmit={createVariant} className="mt-3 space-y-2 border-t border-slate-100 pt-3"><input autoFocus value={variantDraft.name} onChange={(e)=>setVariantDraft({...variantDraft,name:e.target.value})} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none" placeholder="Változat neve"/><div className="grid grid-cols-[1fr_100px] gap-2"><input value={variantDraft.sku} onChange={(e)=>setVariantDraft({...variantDraft,sku:e.target.value})} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none" placeholder="SKU / cikkszám"/><select value={variantDraft.unit} onChange={(e)=>setVariantDraft({...variantDraft,unit:e.target.value})} className="h-10 rounded-xl border border-slate-200 px-2 text-sm"><option>DB</option><option>KG</option><option>M</option><option>M2</option><option>M3</option><option>L</option><option>CSOMAG</option></select></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>{setAddingVariant(false);setVariantDraft(EMPTY_VARIANT);}} className="h-10 rounded-xl border border-slate-200 text-sm font-black">Mégsem</button><button disabled={savingVariant||!variantDraft.name.trim()} className="h-10 rounded-xl bg-teal-700 text-sm font-black text-white disabled:bg-slate-300">{savingVariant?"Mentés...":"Változat mentése"}</button></div></form>}</div>
                  <CommerceProductMediaGallery productId={selectedId!} onChanged={async () => { await loadProducts(query); setSelectedId(selectedId); }} onError={setError} /><div className="mt-4 rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><Boxes size={18} className="text-teal-700" /><b>Kereskedelmi összesítő</b></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-500">Aktív nettó ár</span><b>{selected ? formatPrice(selected) || <EmptyValue /> : <EmptyValue />}</b></div><form onSubmit={savePrice} className="mt-3 border-t border-slate-100 pt-3"><label className="text-xs font-black text-slate-500">Új nettó egységár (Ft)</label><div className="mt-1.5 grid grid-cols-[1fr_92px] gap-2"><input inputMode="decimal" value={priceDraft} onChange={(e)=>setPriceDraft(e.target.value.replace(/[^0-9.,]/g,""))} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-teal-400" placeholder="pl. 12990"/><button disabled={savingPrice||!priceDraft||!(selected?.defaultVariantId||detail?.variants[0]?.id)} className="h-10 rounded-xl bg-teal-700 text-sm font-black text-white disabled:bg-slate-300">{savingPrice?"Mentés...":"Ár mentés"}</button></div><p className="mt-1.5 text-[11px] font-semibold text-slate-400">HUF · nettó ár · 27% ÁFA · korábbi ár az ártörténetben megmarad</p></form></div>
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center"><Package className="text-slate-300" size={38} /><b className="mt-3">Válasszon egy terméket</b><p className="mt-1 max-w-xs text-sm font-semibold text-slate-500">A termék részletei és a készletinformációk itt jelennek meg.</p></div>
              )}
            </AruterCard>
          </div>
        </div>
      </div>
    </AruterPageShell>
  );
}
