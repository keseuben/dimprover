# OutminAI – DIMPRO Árutér fejlesztési átadó – 2026-08-20

## Kötelező környezet
- Kizárólag DEV.
- PROD módosítása TILOS.
- DEV: `ssh dimpro-dev`, root: `/srv/dimpro-dev`.
- Commerce DB: `0.1.13 / 14`.

## Aktuális shared DEV live állapot
- alkalmazáskód: `02455f3`;
- live Build ID: `r7682Aue5iu8_PTTu0FvB`;
- live release: `.next-benjadmin-v22-commerce-tracking-release-02455f3`;
- `aruter.dev.dimpro.hu` az új `kovacs-kerteszet` Storefront Pilot oldalra nyílik;
- többtételes kosár + checkout live;
- Storefront Commerce persistent queue live;
- dedikált `COMMERCE_MIRROR_WORKER` technikai actor + systemd timer live;
- signed public order tracking live: Fogadva -> Pénztár -> Fizetve -> Kiadva;
- tracking token request bodyban, nem URL-ben; HMAC secret csak DEV `.env.local`-ban.

## Legutóbbi zöld QA
- tracking contract 39/39;
- Storefront Pilot 62/62;
- multi-item checkout 44/44;
- cart UI 56/56;
- queue idempotency 25/25;
- worker 54/54;
- legacy compatibility 10/10;
- HTTP tracking E2E 19/19 candidate + 19/19 live HTTPS;
- browser tracking E2E 14/14 candidate + 14/14 live HTTPS;
- TypeScript PASS;
- teljes lint 0 error / 103 meglévő warning;
- build PASS;
- QA cleanup: dueJobs=0, activeTrackingQaOrders=0.

## Következő fő fejlesztési feladat
1. Commerce Product/ProductVariant ↔ Storefront pilot termék mapping.
2. Fulfillment source kiválasztás és konfiguráció.
3. Mapped tételek automatikus inventory resolve + reserve a queue workerben.
4. `SENT_TO_CASHIER -> PAID -> ISSUED` előtt reservation guard teljes browser E2E.
5. Készletcsökkenés/consume és cancellation/release regresszió.
6. Utána external inventory / Connector Engine / NaturaSoft MVP.

## Kötelező szabályok
- A legacy `external marketplace/customer cart -> central cashier` működést nem szabad eltörni.
- A közös Commerce Order engine marad az egyetlen tartós order source of truth.
- Storefront publikus request nem kaphat Commerce admin/user impersonationt.
- Közvetlen Commerce user mirror OFF; persistent service queue a helyes út.
- Pénz `NUMERIC(19,4)`, mennyiség `NUMERIC(19,6)`, soft delete canonical `deleted_at`.
- Minden kritikus POST idempotens.
- Tenant scope és cross-tenant védelem kötelező.
- Build/migration/restart csak központi koordinációs lock alatt.
- Funkció után docs -> tsc -> lint -> build -> acceptance -> smoke -> 34. pont.

## Rollback
- integration backup: `backup/integration-pre-tracking-20260820T001348`;
- live backup: `/srv/dimpro-dev/backups/commerce-tracking-live-cutover/20260820T001430`;
- korábbi live release: `.next-benjadmin-weekly-flow-v22-commerce-release-484a82e`.

## PROD
- Változatlan. PROD-hoz nem történt alkalmazásmódosítás.
