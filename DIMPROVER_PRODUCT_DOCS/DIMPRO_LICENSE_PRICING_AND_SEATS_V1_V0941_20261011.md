# DIMPRO Drive és Projektkapu V0.9.41 – üzleti ár- és résztvevői döntés-előkészítés

Dátum: 2026-10-11. Állapot: SOURCE CANDIDATE, NEM aktivált ár, NEM ügyfélajánlat, NEM adatbázismigráció, PROD DENY.

## 1. Vizsgált nyilvános források és tényleges környezet

- DotRoll publikus Prémium VPS nettó havidíj: Medium 4 044 Ft (80 GB), Large 6 354 Ft (120 GB), X-Large 10 973 Ft (240 GB). Nem ellenőrzött DIMPRO-számlaadatok. https://dotroll.com/hu/szolgaltatasok/premium-vps/
- Hetzner S3-kompatibilis Object Storage 1 TB alapcsomag + 1 TB egress és túlfogyasztási díj. Egy 2024-es Hetzner közleményben nettó 4,99 EUR/hó alapár szerepelt. Ezt nem szabad automatikusan 2026-os szerződéses árnak nevezni. https://www.hetzner.com/storage/object-storage/ és https://www.hetzner.com/pressroom/object-storage/
- Backblaze B2 aktuális publikus induló ár 6,95 USD/TB/hó; egress a szolgáltatói feltételek szerint. https://www.backblaze.com/cloud-storage/pricing
- Ellenőrzött DEV /dev/sda3: kb. 118 GiB, 99%-os foglaltság, ~1,7 GiB szabad. Nem szabad 500 GiB ügyfélcsomagot ezen a rendszertáron tartani. A Drive storageConfig.ts fájlban S3-kompatibilis konfigurációs réteg már van; az élő S3/backup rendelkezésre állás és a tényleges PROD konfiguráció NEM volt ellenőrizve.

## 2. 500 GiB-os modellezett kapacitás

A következő számok kizárólag tervezési feltevések. Nem bizonyítják az élő számlát, backupot vagy a jelenlegi verziótár tényleges használatát.

- Tervezett keret = Q GiB.
- Verzióelőzmények és elsődleges objektumtár = Q × 1,40.
- Külön mentési tár mentési és megőrzési tartalékkal = elsődleges × 1,30.
- Tervezési árfolyam: 400 Ft/EUR, 360 Ft/USD; nem aktuális banki árfolyam.
- Becsült elsődleges tárhelydíj: 4,99 EUR / 1000 GiB / hó.
- Becsült független mentési tárhely: 6,95 USD / 1000 GiB / hó.
- Tervezési havi közös üzemeltetési költségkeret: Saját Drive 800 Ft; Projekt Drive 3 200 Ft. Tartalék +25%.
- Nem külön számlázott tételek a modellen kívül: szolgáltatói minimumok, forgalomtúllépés, tényleges üzemeltetési munkaóra, extra helyreállítás, projektmodulok, személyi költségek és adók.

| Ügyfélkeret | Elsődleges tár | Független mentési tár | Fizikai összesen | Projekt Drive havi modellköltség |
| ---: | ---: | ---: | ---: | ---: |
| 100 GiB | 140 GiB | 182 GiB | 322 GiB | kb. 4 919 Ft |
| 250 GiB | 350 GiB | 455 GiB | 805 GiB | kb. 6 296 Ft |
| 500 GiB | 700 GiB | 910 GiB | 1 610 GiB = kb. 1,57 TiB | kb. 8 593 Ft |

500 GiB alapváltozat: körülbelül 3 674 Ft fizikai tárolási díj + 3 200 Ft felosztott projekt-overhead + 25% tartalék = kb. 8 593 Ft/hó. A modellről NEM állítható, hogy igazolt valós önköltség.

Stresszváltozat: 2,0 verziószorzó; 1,6 backup-szorzó; 450 Ft/EUR, 420 Ft/USD; 6,5 EUR/TB primer, 9 USD/TB backup. Ekkor az 500 GiB ügyfélkeret 1 000 GiB elsődleges + 1 600 GiB független mentés, összesen 2 600 GiB, modellezett havi projektköltség kb. 15 216 Ft.

Tíz darab teljes 500 GiB-os csomagnál az alap forgatókönyv kb. 16 100 GiB fizikai tárolót igényel. A 3-2-1 backup, külön hozzáférési kulcsok, objektumzár, visszaállítási teszt, GDPR és helyreállítási idő célértékének (RPO/RTO) tényleges jóváhagyása kötelező.

## 3. Saját Drive nettó díjjavaslat – NEM elfogadott tarifa

| Méret | Nettó havidíj-javaslat | Nettó éves díj-javaslat |
| ---: | ---: | ---: |
| 5 GiB | 1 990 Ft | 19 900 Ft |
| 10 GiB | 2 490 Ft | 24 900 Ft |
| 25 GiB | 3 490 Ft | 34 900 Ft |
| 50 GiB | 4 490 Ft | 44 900 Ft |
| 100 GiB | 5 990 Ft | 59 900 Ft |
| 250 GiB | 9 990 Ft | 99 900 Ft |
| 500 GiB | 14 990 Ft | 149 900 Ft |

Javaslat: 1 név szerinti felhasználó / személyes fiók. Tárolási méret nem jelent automatikus extra alkalmazásmodult.

## 4. Projekt Drive nettó díjjavaslat – NEM elfogadott tarifa

| Méret | Nettó havidíj-javaslat | Nettó éves díj-javaslat |
| ---: | ---: | ---: |
| 5 GiB | 6 990 Ft | 69 900 Ft |
| 10 GiB | 7 490 Ft | 74 900 Ft |
| 25 GiB | 8 490 Ft | 84 900 Ft |
| 50 GiB | 9 990 Ft | 99 900 Ft |
| 100 GiB | 12 990 Ft | 129 900 Ft |
| 250 GiB | 19 990 Ft | 199 900 Ft |
| 500 GiB | 29 990 Ft | 299 900 Ft |

Javasolt külön tagszám-politika: minden hét tárhelymérethez azonos, 10 írásra/szerkesztésre jogosult projekttag és 50 csak olvasó meghívott. A műszaki projekt ACL mindvégig kötelező, a külsősnek nem kell önálló fizetős projektlicenc. Ez csak döntési hipotézis: a szerkesztői, megjegyzési, olvasási és archived/active szabályokat később kell rögzíteni. Nincs bevezetett üzemeltetési seat-korlát.

## 5. Projektkapu modulcsomag – NEM elfogadott tarifa

| Csomag | Aktív résztvevők – javaslat | Nettó havidíj-javaslat | Nettó éves díj-javaslat |
| --- | ---: | ---: | ---: |
| Alap | 10 | 9 990 Ft | 99 900 Ft |
| Pro | 25 | 24 990 Ft | 249 900 Ft |
| Enterprise | 100 | 59 990 Ft | 599 900 Ft |

A Projektkapu nem jelent további fizikai Drive-tárhely-előfizetést. A Projektkapu árak jelenleg termékpozicionálási hipotézisek: nincs hiteles modulonkénti CPU-/AI-/support-költségmérés. A Drive+Projektkapu bundlet nem áraztuk be.

Az éves ár minden esetben a havidíj tízszerese; 12 hónapos időszakra javasolt körülbelül 16,7% kedvezmény. Az éves díj nettó, nem publikus, nem elfogadott és nem automatikusan aktivált.

## 6. Elkészült szoftveres döntési munkalap

- app/lib/license/pricingProposalV1.ts: 17 PROPOSAL_ONLY tarifa és tagszám, elkülönülve a valódi AUTH licencadatoktól. Típusos tiszta költségképlet, szolgáltatói egységár, árfolyam, verzió/backup tartalék, platform-overhead, kockázati tartalék szerkeszthető modellje.
- components/license/PricingProposalWorkshop.tsx és az önálló CSS: központi admin Licencközpont három termékfüles, nem publikus, kliensmemória-alapú ár-előnézete és költségkalkulációja, 5–500 GiB méretváltóval.
- app/admin/licenckozpont/page.tsx: az ár-előnézet hozzáadva, nem képes jóváhagyott árat menteni. A meglevő csomagkatalógus érvényes havi/éves ármezeje továbbra is NULL.
- Nincs adatbázismigráció, áraktiválás, számlázás, új licenckiadás, email és DEV/PROD deploy. A licenckiadás HARD OFF maradt.
- scripts/tests/drive-pricing-proposal-contract.mjs: díjak, éves kedvezmény, független résztvevői keret, 500 GiB alap/stressz, éves margin, no-live-price és admin gate ellenőrzések.

## 7. Döntési és ellenőrzési kapu

Jóváhagyandó külön tételek: havi nettó Ft díjak és éves 10× szabály; Projekt Drive 10 szerkesztő + 50 olvasó; Projektkapu 10/25/100 aktív résztvevő; archív/guest számolás; tárhelykvóta definíciója (current asset + verziók vs csak aktuális fájl), közös file-asset egyszeri elszámolása; valós költségek és tartalék/backup SLA.

Az árakat mindaddig TERVEZET-ben kell tartani, amíg a felhasználó külön jóvá nem hagyja és a központi admin jogosultsági, számlázási és storage enforcement tesztek el nem készültek.

A BUILD01 ellenőrzés eredménye még hátravan.

## 8. BUILD01 verified (2026-10-11)

- Run: license-pricing-v0941-120f0ef87-20261011-build01-b1
- Forráscommit: 120f0ef87c4377459ffa350dc324fb9c717cc981
- Állapot: PASS, teljes Next.js, TypeScript, 104/104 oldal, 274 standalone chunk.
- Build ID: mvs70LL39DzPvpucxTzqO
- Artifact SHA-256: bc3af72fcbb04ad1b4aacc4cb1896dc0ab3e5bb20312308e3a4b16f13a017257
- BUILD gateway metadata és a tényleges artifact SHA-256 értéke egyezett.
- Artifact kb. 92 MiB. Csak BUILD01-en készült el, nem telepített.
- QA: 28/28 ármodell-szerződésteszt, 30/30 csomagkatalógus-contract, 18/18 izolált csomagkatalógus PostgreSQL, 15/15 admin release-gate, 21/21 projektlicenc ACL, 14/14 Drive értesítési tesztcsoport PASS.
- DEV: aktuális header V0.9.33 (c74326afd), szabad tárhely kb. 1,6 GiB, lemez 99%. DEV/PROD telepítés nem történt, PROD DENY.
