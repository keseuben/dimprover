# DIMPRO Drop 1.0.0 candidate – private-pilot validáció, Gyors KépSend és kiadási keményítés

Dátum: 2026. augusztus 6.

## 1. Kiadási állapot

- Éles production release: `.next-v099-release-final`
- Éles BUILD_ID: `C1O7K6FBn329lzLVSvrjA`
- Új candidate: `.next-v100-candidate`
- Candidate BUILD_ID: `J2YKT8CWA6eE236IRTytr`
- Élesítés: **nem történt meg**
- Release gate: **private-pilot validáció folyamatban**
- Közvetlen rollback: `.next-v098-release-final`
- Fejlesztés előtti backup: a `.work_drop_v100_backup_path` fájlban rögzítve

A candidate tartalmazza a DROP 1.0.0 felé vezető új funkciókat, de a runtime verziócímke és az aktív release szándékosan továbbra is DROP 0.9.9. A production pointer csak a fizikai mobil-, e-mail-, ZIP-, hozzáférhetőségi és rollback-gate lezárása után módosítható.

## 2. Elkészült private-pilot validációs központ

Új admin-only felület és API készült:

- `components/drop/DropPrivatePilotValidationPanel.tsx`
- `app/api/drop/admin/private-pilot-validation/route.ts`
- `app/lib/drop/validation/dropPrivatePilotValidation.ts`

A validációs központ 6 kategóriában 44 kritikus tételt kezel:

1. fizikai iPhone és Android PWA;
2. Gmail, Thunderbird, Outlook vagy Apple Mail;
3. valós PIN-védett, többfájlos ZIP;
4. billentyűzet, képernyőolvasó, 200%-os zoom és kontraszt;
5. teljesítmény, SMTP, backup és adatvédelem;
6. végleges release gate.

A kézi tesztekhez állapot, eszköz/kliens, környezet, megjegyzés és bizonyíték rögzíthető. Az automatikus tesztek önmagukban nem engedhetik ki a release-t.

## 3. Gyors KépSend

A DIMPRO Send felület két működési módot kapott:

- **Normál Send**: a korábbi teljes fájl- és dokumentumküldési workflow;
- **Gyors KépSend**: mobilfotók gyors e-mailes továbbítása.

A Gyors KépSend csak ezt kéri:

- cél e-mail-cím;
- a kötelező feltöltési/adatkezelési szabály elfogadása.

Nem kér külön feladói nevet, feladói e-mailt, tárgyat, címzettnevet, céget, üzenetet vagy csomagmegjegyzést. A backend képmódú csomagot hoz létre, külön letöltési PIN nélkül. A következő lépésben közvetlenül elérhető a Galéria és a Kamera.

Érintett fő fájlok:

- `components/drop/DropPublicTransferClient.tsx`
- `app/lib/drop/public/dropPublicWorkflowService.ts`
- `components/drop/DropPublicHexUploader.tsx`

## 4. Egységes képméretprofilok minden Drop-feltöltőben

Új közös képméretmotor:

- `components/drop/dropUploadPreparation.ts`
- `components/drop/DropImageSizeSelector.tsx`
- `components/drop/DropImageMetadataSelector.tsx`

Elérhető profilok, a felületen ebben a sorrendben:

| Profil | Hosszabb oldal | JPEG/WebP minőség | Ajánlott használat |
|---|---:|---:|---|
| Nagy | 3200 px | 90% | részletgazdag műszaki dokumentáció |
| Közepes | 2560 px | 82% | általános Drop- és projektfeltöltés |
| Kicsi | 1600 px | 74% | gyors mobil és e-mailes fotóküldés |
| Eredeti felbontás | nincs méretarányos csökkentés | eredeti vagy metaadat-tisztított újrakódolás | speciális igény |

Ajánlási szabály:

- Gyors KépSend: **Kicsi – Ajánlott**;
- normál Send, Beküldőkapu, projekt- és csomagfeltöltő: **Közepes – Ajánlott**.

A közös profilokat jelenleg a publikus Send/Beküldőkapu feltöltő és a belső projekt-/csomagfeltöltő használja. A korábbi egyetlen 2560 px-es kapcsoló és a külön max. oldal/minőség beállítás megszűnt.

## 5. GPS- és EXIF-metaadatok

Két választható szabály készült:

- **GPS-adatok törlése – Ajánlott**;
- **GPS-adatok megőrzése**.

Biztonsági működés:

- törlésnél a rendszer újrakódolja a képet, eltávolítja az EXIF- és GPS-metaadatokat, és alkalmazza a Nagy/Közepes/Kicsi profilt;
- megőrzésnél a rendszer az eredeti fájlt tartja meg, ezért a Nagy/Közepes/Kicsi méretcsökkentés letiltásra kerül és automatikusan Eredeti felbontásra vált.

Ez megakadályozza, hogy a felület olyan GPS-megőrzést ígérjen, amelyet a böngészős canvas-újrakódolás nem tudna megbízhatóan teljesíteni.

## 6. Telefonos galériatörlés

A böngésző és PWA biztonsági modellje nem engedi, hogy egy webalkalmazás a felhasználó galériájából automatikusan törölje az eredeti fotókat.

A Gyors KépSend ezért két állapotot mutat:

- **Törlési emlékeztető**: működő, választható; sikeres kézbesítés után emlékeztet a kézi törlésre;
- **Automatikus galériatörlés**: inaktív, egyértelműen jelezve, hogy későbbi natív DIMPRO mobilapp szükséges hozzá.

## 7. Egységes hatjegyű kódbevitel és automatikus belépés

Új közös komponens:

- `components/drop/DropSixDigitCodeInput.tsx`

Alkalmazott felületek:

- DIMPRO Send küldési kód;
- csomagkód + PIN megnyitási felület;
- letöltési PIN-kapu.

Működés:

- egyetlen, egysoros mező;
- folyamatos hatjegyű gépelés;
- teljes kód beillesztése;
- mobil `one-time-code` támogatás;
- a hatodik számjegy után automatikus ellenőrzés;
- dupla párhuzamos kérés elleni ref-alapú védelem;
- kézi gombos újrapróbálás továbbra is elérhető;
- hibás kód után nincs végtelen automatikus újraküldés.

## 8. E-mail világos és sötét mód

A production Drop e-mail sablon explicit színséma-támogatást kapott:

- `color-scheme: light dark`;
- `prefers-color-scheme: dark` media query;
- Outlook `data-ogsc` fallback;
- sötét módú kártya-, megjegyzés-, PIN- és tesztbanner-stílusok.

A valós Gmail/Thunderbird/Outlook vagy Apple Mail fizikai validáció továbbra is hátralévő release-gate tétel.

## 9. Nagy ZIP állapotjelzés

A ZIP-letöltés felülete kiegészült:

- szerver-visszajelzéses request ID-val;
- eltelt idő kijelzésével;
- nagy csomag figyelmeztetéssel;
- mobil Letöltések/Fájlok segítséggel;
- stream-indulást jelző, rövid életű, Secure/SameSite cookie-val;
- 900 másodperces route időkorláttal;
- tartós ZIP-másolat nélküli streameléssel.

A valós nagy, többfájlos, PIN-védett ZIP teljesítményteszt továbbra is hátralévő fizikai/private-pilot tétel.

## 10. Teszteredmények

### Forrás- és szerződésellenőrzések

- DROP 1.0.0 private-pilot szerződés: **97/97 PASS**;
- Gyors KépSend, képméret, GPS és automatikus kód szerződés: **50/50 PASS**;
- összesen: **147/147 PASS**;
- TypeScript: **PASS**;
- célzott ESLint: **PASS**;
- Next.js candidate build: **PASS**.

### Böngészőtesztek

- publikus akadálymentességi mátrix: **11/11 PASS**;
- admin validációs panel: desktop/tablet/mobile **3/3 PASS**;
- valós Gyors KépSend és automatikus kódbelépés E2E: **2/2 PASS**.

Összes böngészős szcenárió: **16/16 PASS**.

A Gyors KépSend E2E igazolta:

- az automatikus Send-kód pontosan 1 kérést indít;
- a gyorsmód csak cél e-mail-címet kér;
- a backend `image` csomagot ad vissza;
- `quickImageSend = true`;
- `requireDownloadPin = false`;
- a Kicsi profil ajánlott;
- a GPS-megőrzés Eredeti felbontásra vált;
- nincs mobil vízszintes overflow;
- a teszt Send-kód `revoked`;
- a tesztcsomag `deleted`.

### Szerverállapot

- Nginx konfiguráció: PASS;
- PM2 `dimprover`: online;
- ClamAV daemon és freshclam: active;
- Drop worker timer: active;
- azonnali scanner path-trigger: active;
- backup, backup-check és watchdog timer: active;
- production health: READY;
- candidate health a külön tesztporton: READY; a tesztfolyamat a validáció után leállítva.

### Preflight

- **20 PASS / 1 WARNING / 0 FAILED**;
- egyetlen warning: VPS rendszerlemez **85%**.

## 11. Hátralévő release-gate tételek

A DROP 1.0.0 továbbra sem jelölhető végleges production kiadásnak, amíg nincs lezárva:

- fizikai iPhone Safari/PWA és Apple Touch ikon;
- fizikai Android Chrome/PWA és maskable ikon;
- 5–10 egymást követő kamerafotó mindkét platformon;
- Wi-Fi és mobilinternet közötti váltás;
- energiatakarékos/low battery Wake Lock;
- valós Gmail és Thunderbird küldés;
- legalább egy Outlook vagy Apple Mail teszt;
- világos és sötét e-mail kliensvalidáció;
- valós többfájlos link + PIN ZIP;
- tényleges nagy ZIP teljesítmény;
- fizikai képernyőolvasó-próba;
- backup-visszaállítás és rollback-próba;
- private-pilot visszajelzések lezárása;
- tárhelytakarítás vagy tárhelybővítés.

## 12. Aktuális készültségi értékek

A százalékok a jelenlegi működő, dokumentált és tesztelt funkciók alapján becsült készültségi értékek.

| Rendszer | Jelenlegi szint | Használhatóság |
|---|---:|---|
| DIMPRO Drop | 94% | Éles private-pilot, fő munkafolyamatok használhatók. |
| DIMPRO Drive backend | 72% | Alap fájl-, projekt-, storage- és archiválási motor használható. |
| DIMPRO Drive webes felület | 58% | Alap műveletek használhatók, további workflow-fejlesztés szükséges. |
| Drive Desktop | 38% | Fejlesztés alatt, teljes szinkron még nem kész. |
| Drop → Drive archiválás | 78% | Backend és biztonsági alap működik, további felületi tesztelés szükséges. |
| Teljes Drop + Drive termékcsomag | 68% | Drop érett, Drive és Desktop további fejlesztést igényel. |

## Mobil alsó navigáció – tömör háttér javítás (2026-08-06)

A mobil/PWA alsó lebegő navigáció háttere teljesen tömör fehér lett. A korábbi részben áttetsző `bg-white/94` és `backdrop-blur-xl` megoldás megszűnt, így a mögötte görgetett tartalom nem látszik át és a menü kontrasztja stabilabb.

## Mobil dock javítás – private-pilot production aktiválás (2026-08-06)

A tömör mobil alsó navigációs háttér éles private-pilot buildbe került.

- aktív release: `.next-v100-release-final`
- BUILD_ID: `m8llgYcxGFwdI_WbKNblE`
- közvetlen rollback: `.next-v099-release-final`
- másodlagos rollback: `.next-v098-release-final`
- candidate health: PASS
- candidate mobil böngészőteszt: PASS
- éles HTTPS health: PASS
- éles mobil böngészőteszt: PASS
- számított háttér: `rgb(255, 255, 255)`
- opacity: `1`
- backdrop-filter: `none`

Ez private-pilot production aktiválás, nem a DROP 1.0.0 általánosan elérhető végleges kiadása. A fizikai release-gate tesztek továbbra is nyitottak.

A release után a régi, már nem szükséges 0.9.4, 0.9.6 és 0.9.7 buildkönyvtárak törlésre kerültek. A tárhelyhasználat 85%-ról 77%-ra csökkent, miközben két rollback release megmaradt.
