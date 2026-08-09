# DIMPRO Értekezleti Kísérő – Microsoft Teams átirat / Graph beállítás

## Cél

A DIMPRO Értekezleti Kísérő a Microsoft Teams által elkészített értekezleti átiratokat szerveroldalon lekéri, beszélőkkel és időbélyegekkel feldolgozza, majd az adott DIMPRO értekezleti munkatérhez menti. Az importált sorok alapértelmezetten privát szervezői átiratként kerülnek be.

## Jelenlegi megvalósítás

A szerver Microsoft Graph alkalmazásjogosultsági, client credentials működést használ:

- GET /users/{organizerUserId}/onlineMeetings/{onlineMeetingId}/transcripts
- GET /users/{organizerUserId}/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content

Elsődleges formátum: text/vtt, beszélőazonosítással. Ha a tenant nem enged beszélő-hozzárendelést, a szerver megpróbálja a beszélő nélküli formátumot.

A Teams v0.1.4 manifest RSC-előkészítést is tartalmaz:

- OnlineMeeting.ReadBasic.Chat
- OnlineMeetingTranscript.Read.Chat

A manifest-jogosultság önmagában még nem helyettesíti a szerveroldali Entra alkalmazásregisztrációt és Graph-konfigurációt. A jelenlegi szerverútvonal szervezeti alkalmazásjogosultságot és Application Access Policy-t használ. A későbbi meeting-specifikus RSC/webhook működés külön fejlesztési kör.

## 1. Microsoft Entra alkalmazásregisztráció

1. Microsoft Entra admin center → App registrations → New registration.
2. Javasolt név: DIMPRO Teams Transcript Service.
3. Jegyezd fel a Directory tenant ID-t és az Application client ID-t.
4. Certificates & secrets → New client secret.
5. A titkos értéket azonnal másold ki; később nem jelenik meg újra.

## 2. Microsoft Graph alkalmazásjogosultságok

API permissions → Add a permission → Microsoft Graph → Application permissions:

- OnlineMeetings.Read.All
- OnlineMeetingTranscript.Read.All

Ezután Grant admin consent szükséges.

## 3. Teams Application Access Policy

A Graph alkalmazásjogosultság mellett a DIMPRO alkalmazást hozzá kell rendelni ahhoz a szervező felhasználóhoz, akinek a meetingjeit leolvassa.

Teams PowerShell példa:

```powershell
Connect-MicrosoftTeams

New-CsApplicationAccessPolicy `
  -Identity "DIMPRO-Transcript-Policy" `
  -AppIds "<MICROSOFT_GRAPH_CLIENT_ID>" `
  -Description "DIMPRO Teams transcript access"

Grant-CsApplicationAccessPolicy `
  -PolicyName "DIMPRO-Transcript-Policy" `
  -Identity "<SZERVEZO_FELHASZNALO_OBJECT_ID>"
```

A szabály életbe lépése akár körülbelül 30 percet is igénybe vehet.

## 4. Teams Admin Center beállítás

Teams Admin Center → Meetings → Meeting settings → Transcript API access:

- Microsoft Graph access: On
- Include speaker attribution: On, ha a DIMPRO-ban a beszélő neve is szükséges

A meeting policy-ban a transzkripciót is engedélyezni kell az érintett felhasználóknak.

## 5. VPS környezeti változók

```env
MICROSOFT_GRAPH_TENANT_ID=<tenant-id>
MICROSOFT_GRAPH_CLIENT_ID=<client-id>
MICROSOFT_GRAPH_CLIENT_SECRET=<client-secret>
```

A kliens titkot nem szabad forráskódba, dokumentációba, Teams manifestbe vagy böngészőoldali változóba tenni.

A környezet frissítése után:

```bash
pm2 restart dimprover --update-env
```

## 6. DIMPRO munkatér használata

1. Nyisd meg a Teams átirat / rögzített beszélgetés részt.
2. Add meg a szervező Microsoft Entra felhasználóazonosítóját.
3. Add meg a Graph onlineMeeting azonosítót.
4. Kattints a Kapcsolat mentése gombra.
5. A meeting befejezése és a Teams-átirat elkészülése után kattints a Teams átirat szinkronizálása gombra.

Az átirat nem feltétlenül áll rendelkezésre azonnal a meeting lezárásakor. Ha még nincs kész, a DIMPRO ezt külön állapottal jelzi.

## 7. Adatvédelem és hozzáférés

- Az átiratszinkront csak szervezői token vagy hiteles DIMPRO session indíthatja.
- A meghívotti token nem konfigurálhat és nem szinkronizálhat átiratot.
- A beolvasott átirat alapértelmezetten privát.
- A résztvevői export csak kifejezetten megosztott átiratsorokat tartalmaz.
- A szerveroldali kliens titok nem kerül a Teamsbe vagy a böngészőbe.

## 8. Későbbi automatizálási szint

- Teams/Entra SSO;
- onlineMeeting ID automatikus feloldása;
- Graph change notification / webhook;
- RSC-alapú meeting-specifikus hozzáférés;
- automatikus szinkron a transzkript létrejöttekor;
- több szervező és co-organizer kezelése;
- adminisztrátori kapcsolat- és jogosultságellenőrző felület.
