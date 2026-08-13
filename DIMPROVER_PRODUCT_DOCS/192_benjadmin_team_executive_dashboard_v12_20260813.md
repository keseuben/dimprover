# 192 — BENJADMIN csapattabló és vezetői műszerfal V1.2

Dátum: 2026-08-13. Környezet: DEV. Kapcsolódó: 176–191, B3/B3.1/B3.2.

## Cél
A BENJADMIN Csapat működési/infrastruktúra nézet középső része szervezeti/családfa tablót és összecsukható vezetői műszerfalat kapott. Új párhuzamos adminrendszer nem készült. PROD módosítás nem történt.

## Kanonikus nevek és tabló
Kizárólag: `BenjAdmin`, `Ben-AI`, `Ármin-AI`, `Jázmin-AI`, `Outmin-AI`, `M.Forge-AI`, `V.Guard-AI`.

Hierarchia: BenjAdmin → Ben-AI → Ármin/Jázmin/Outmin → M.Forge/V.Guard. Desktop avatárméret: BenjAdmin 154 px, Ben-AI 126 px, mind az öt worker 94 px. V.Guard review-only szerepkör, de a tablón egyenrangú worker.

## Közös profilkártya
Új közös forrás/komponensek: `benjadminPeople.ts`, `BenjadminPersonProfileCard.tsx`, `BenjadminPersonProfileHost.tsx`. Az avatar kattintás nagy képes profilt nyit névvel, titulussal, részletes munkaköri leírással és felelősségekkel. A globális esemény `benjadmin:person-profile`; Team Screen, Developer Console és Operator Console ugyanazt a profillogikát használja.

## Összecsukható panelek
Három külön nyitható/zárható panel: `BENJADMIN CSAPATTABLÓ`, `KÖLTSÉGEK ÉS FINANSZÍROZÁS`, `FEJLESZTÉSI IDŐ ÉS RÁFORDÍTÁS`. Az állapot böngészőnként a `benjadminTeamExecutivePanels` localStorage kulcsban megmarad.

Az AI finanszírozás kompakt kártyája a bal infrastruktúra-oszlop aljára került. A külső worker sor hexagon pénzügyi gombja gyors popovert nyit.

## Költséglogika
A UI külön jelöli a `TÉNY`, `TÉNY / KONFIG` és `BECSLÉS` értékeket. Hiányzó fix díjból nem készül kitalált költség. A teljes napi/éves becslés csak teljes fix infrastruktúra-konfigurációnál számolható.

Első konfigurációs források: `DIMPRO_DEV_VPS_MONTHLY_HUF`, `DIMPRO_PROD_VPS_MONTHLY_HUF`, `DIMPRO_DB_VPS_MONTHLY_HUF`, `DIMPRO_CONTROL_VPS_MONTHLY_HUF`, `DIMPRO_OBJECT_STORAGE_MONTHLY_HUF`, `DIMPRO_OTHER_INFRA_MONTHLY_HUF`. 2026-08-13-án 0/6 van konfigurálva, ezért a UI `Nincs teljes adat` állapotot használ.

## Fejlesztési idő
Új service: `app/lib/dev-center/team-dashboard-metrics.ts`. API: `GET /api/dev/engine/team-dashboard-summary`. Saját időmérő: `POST /api/dev/engine/benjadmin-time`.

Mérés: BenjAdmin = kézi start/stop; Ben-AI/Ármin/Jázmin/Outmin = worker session falióra; M.Forge/V.Guard = provider aktív futási idő; ChatGPT + VPS-MCP = `dev_center_work_sessions` chatgpt forrású munkamenet-falióra. Utóbbi szüneteket is tartalmazhat, nem nettó modell- vagy „gondolkodási idő”. Nap/hét/hónap időzóna: Europe/Budapest, éjfélen átnyúló sessionök időintervallum-metszettel kerülnek felosztásra.

## Biztonság és acceptance
Mindkét új API admin-auth mögött van; írás auth nélkül 401. Kliensre secret nem kerül. PROD továbbra is read-only.

Eredmények: metrics contract **11/11 PASS**, Team Executive V1.2 **27/27 PASS**, Developer Console **40/40 PASS**, B3.2 P5 **53/53 PASS**, TypeScript PASS, full lint **0 error / 104 meglévő warning**, build **wK9HkoIsKEyCi47Z6Ed3k**. Responsive acceptance: 1440, 1366, 768 és 390 px szélességen nincs teljes oldali vízszintes overflow.

Rollback: `/srv/dimpro-dev/.backups/benjadmin-team-executive-dashboard-pre-20260813T162923Z`.

Következő irány: költségtörténet, projekt/modul szerinti ráfordítás, AI provider/model benchmark és külön `TELJESÍTMÉNY / BENCHMARK` panel; ezután folytatódik a Külső AI Worker V1.3 V.Guard review → retry → BENJADMIN Gate lánca.
