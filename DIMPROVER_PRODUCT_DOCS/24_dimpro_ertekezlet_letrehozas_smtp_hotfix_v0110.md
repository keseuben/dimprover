# DIMPRO Értekezleti Kísérő – új értekezlet létrehozás és SMTP hotfix v0.1.10

Dátum: 2026-07-23

## Javított hiba – új értekezlet létrehozása

Az `/ertekezleti-kisero` kezdőoldal a `meeting-assistant-home` munkatérhez kötött szervezői tokent használta. Az Új értekezlet gomb viszont már az újonnan generált meetingId-val hívta a workspace API-t. A token és a meetingId eltérése miatt az API 401-es jogosultsági hibával elutasította a létrehozást.

A felületen a hiba azért látszott úgy, mintha a gomb nem működne, mert az üzenet a modal mögötti kezdőoldalon jelent meg.

### Javítás

- A kezdőoldali token kizárólag `update_meta` bootstrap művelettel hozhat létre új meetinget.
- A szerver az új meeting létrehozása után külön, az új meetingId-hoz kötött `dimpro-web-preview` tokent ad vissza.
- A napirendi sablon már ezzel az új meetingtoken-nel töltődik be.
- A modalban közvetlenül megjelenik minden létrehozási hiba.
- A dokumentumforma `meeting_note` kulcsa egységesítve lett a szerver adatmodelljével.

## SMTP-integráció

Az Értekezleti Kísérő korábban csak a régi `DIMPRO_SMTP_*` / `SMTP_*` környezeti változókat ellenőrizte. Emiatt SMTP nincs beállítva hibát mutatott akkor is, amikor a központi DIMPRO e-mail profilok már működtek.

### Javítás

- Az Értekezleti Kísérő a központi DIMPRO e-mail profilrendszert használja.
- Alapértelmezett profil: `notifications`.
- Feladó: `ertesites@dimpro.hu`.
- Vezérlőkód leveleknél Reply-To: `admin@dimpro.hu`.
- Értekezleti összefoglalóknál Reply-To: `info@dimpro.hu`.
- A központi `sendDimproMail` támogatja a PDF- és DOCX-mellékleteket is.
- Külön SMTP-jelszót nem kellett létrehozni vagy megadni az Értekezleti Kísérőhöz.

## Ellenőrzések

- TypeScript: sikeres.
- Teljes ESLint: 0 hiba.
- Production build: sikeres.
- Központi DIMPRO Értesítések SMTP profilteszt: sikeres.
- Új értekezlet + SMTP integráció: 7/7 sikeres.
- Kezdőoldali token bootstrap regresszió: 6/6 sikeres.
- Tényleges vezérlőkód e-mail kiküldés: sikeres.
- PM2: online, unstable restart: 0.

## Backup

`backups/meeting-create-fix-20260723_120614`
