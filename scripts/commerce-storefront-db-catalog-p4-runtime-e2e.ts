import { getStorefrontCatalogMode, listCommerceStorefrontCatalogProducts } from "../app/lib/aruter/storefrontCommerceCatalog";

function eq(actual: unknown, expected: unknown, code: string) {
  if (actual !== expected) throw new Error(`${code}: expected=${String(expected)} actual=${String(actual)}`);
}

async function main() {
  const previousMode = process.env.ARUTER_STOREFRONT_CATALOG_MODE;
  try {
    eq(process.env.ARUTER_REPOSITORY_MODE?.trim(), "mock", "P4_GLOBAL_REPOSITORY_MUST_STAY_MOCK");
    console.log("PASS 01 global Árutér repository remains mock during gradual catalog cutover");
    process.env.ARUTER_STOREFRONT_CATALOG_MODE = "commerce";
    eq(getStorefrontCatalogMode(), "commerce", "P4_CATALOG_MODE");
    console.log("PASS 02 Storefront catalog independently selects Commerce mode");

    const products = await listCommerceStorefrontCatalogProducts({ businessSlug: "kovacs-kerteszet", template: "kertészet" });
    eq(products.length, 2, "P4_PRODUCT_COUNT");
    console.log("PASS 03 Commerce projection exposes exactly two mapped pilot products");
    const byId = new Map(products.map((product) => [product.id, product]));
    const tuja = byId.get("prod-001");
    const mulcs = byId.get("prod-002");
    if (!tuja || !mulcs) throw new Error("P4_EXTERNAL_IDS");
    console.log("PASS 04 external Storefront product ids remain stable");
    eq(tuja.sku, "KERT-TUJA-120", "P4_TUJA_SKU");
    eq(mulcs.sku, "KERT-MULCS-50", "P4_MULCS_SKU");
    console.log("PASS 05 mapped public SKUs remain stable");
    eq(tuja.name, "Smaragd tuja 120–140 cm", "P4_TUJA_NAME");
    eq(mulcs.name, "Fenyőkéreg mulcs 50 l", "P4_MULCS_NAME");
    console.log("PASS 06 names come from Commerce products");
    eq(tuja.priceNet, 5490, "P4_TUJA_PRICE");
    eq(mulcs.priceNet, 1890, "P4_MULCS_PRICE");
    console.log("PASS 07 net prices come from active Commerce HUF prices");
    eq(tuja.vatRate, 27, "P4_TUJA_VAT");
    eq(mulcs.vatRate, 27, "P4_MULCS_VAT");
    console.log("PASS 08 VAT comes from Commerce pricing basis points");
    eq(tuja.stockQuantity, 42, "P4_TUJA_STOCK");
    eq(mulcs.stockQuantity, 130, "P4_MULCS_STOCK");
    console.log("PASS 09 Storefront availability matches fulfillment-source SELLABLE stock");
    eq(tuja.unit, "db", "P4_TUJA_UNIT");
    eq(mulcs.unit, "zsák", "P4_MULCS_UNIT");
    console.log("PASS 10 Commerce DB/ZSAK units project to Storefront units");
    eq(tuja.barcode, "5990000000011", "P4_TUJA_BARCODE");
    console.log("PASS 11 mapped Commerce EAN is exposed when available");
    eq(tuja.storageZone, "KOVACS-KERT-PILOT-INTERNAL", "P4_TUJA_SOURCE");
    eq(mulcs.storageZone, "KOVACS-KERT-PILOT-INTERNAL", "P4_MULCS_SOURCE");
    console.log("PASS 12 Storefront stock snapshot identifies the selected fulfillment source");

    const foreign = await listCommerceStorefrontCatalogProducts({ businessSlug: "not-configured-storefront", template: "kertészet" });
    eq(foreign.length, 0, "P4_FOREIGN_SCOPE");
    console.log("PASS 13 unconfigured business slug cannot read trusted Commerce catalog");

    process.env.ARUTER_STOREFRONT_CATALOG_MODE = "repository";
    eq(getStorefrontCatalogMode(), "repository", "P4_REPOSITORY_MODE");
    console.log("PASS 14 explicit repository rollback mode remains selectable");
    console.log("RESULT 14/14 PASS");
  } finally {
    if (previousMode === undefined) delete process.env.ARUTER_STOREFRONT_CATALOG_MODE;
    else process.env.ARUTER_STOREFRONT_CATALOG_MODE = previousMode;
  }
}

void main().catch((error) => { console.error(error); process.exit(1); });
