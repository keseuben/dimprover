# DIMPRO Értekezleti Kísérő – közös mellékletek és Teams-megosztás v0.1.7

Dátum: 2026-07-22

## Cél

Az értekezlet szervezője, jegyzőkönyv-szerkesztője és résztvevői ugyanazt az élő értekezleti munkateret használják a Teams jobb oldali paneljén, a Teams közös nagy felületén és a DIMPRO webes kétoldali értekezletvezetőben.

## Egységes munkatér-párosítás

- A DIMPRO webes értekezletazonosító marad a hivatalos workspace-azonosító.
- A Teams tényleges meetingazonosítója külön kapcsolati azonosító.
- A párosítókód megőrzi a forrás DIMPRO-workspace azonosítóját.
- A Teams konfiguráció a tényleges meetinget ehhez a workspace-hez köti.
- A Teams szervezői és résztvevői token ugyanarra a DIMPRO-workspace-re készül.
- A webes szervezői nézet, a webes résztvevői nézet, a Teams panel és a Teams stage ezért ugyanazokat az adatokat olvassa.
- A korábban párosított v0.1.6 panelt az új működéshez egyszer újra kell párosítani.

## Résztvevői kép- és fájlfeltöltés

1. A résztvevő feltölt egy képet vagy fájlt.
2. A felület azonnal visszajelzi: „A szervező megkapta a feltöltést.”
3. A melléklet `pending` állapotba kerül.
4. A résztvevői közös nézetben a fájl még nem jelenik meg.
5. A szervező a bejövő mellékletet ellenőrzi.
6. A „Jóváhagyás és megosztás” művelet `shared` állapotba teszi.
7. A kép vagy fájl minden résztvevő Teams- és webes felületén megjelenik.

## Összecsukható mellékletkártyák

- Egy sorban egy melléklet jelenik meg.
- A kártya bal oldalán kisméretű előnézeti kép vagy fájlikon látható.
- A kártyán megjelenik a cím, rövid képaláírás, forrástípus és státusz.
- Kattintásra a kártya lenyílik.
- A lenyitott állapotban elérhető a nagyobb előnézet, letöltés, megnyitás, közös képaláírás, napirendi kapcsolat, AI-jelölés és a mellékletszerkesztő.

## Közös képaláírás

- A megosztott kép alatt külön közös szövegmező található.
- A szervező, a jegyzőkönyv-szerkesztő és a résztvevők is pontosíthatják a képaláírást.
- A módosítás az öt másodperces szinkronnal minden csatlakozott felületen megjelenik.
- A résztvevő kizárólag a közös képaláírást módosíthatja.
- A résztvevő nem módosíthatja a címet, napirendi kapcsolatot vagy AI-bevonási jelölést.

## Mellékletszerkesztő jogosultság

### Szervező

- képmetsző;
- toll;
- nyíl;
- téglalap;
- kör;
- képre írt szöveg;
- sorszámozott jelölés;
- szín és vonalvastagság;
- kijelölés, mozgatás, törlés;
- zoom és pan;
- új szerkesztett képváltozat mentése.

### Jegyzőkönyv-szerkesztő és résztvevő

- megnyithatja ugyanazt a mellékletszerkesztőt;
- látja a képet és az eszköztárat;
- szerkesztheti a kép alatti közös szöveget;
- nem rajzolhat, nem írhat közvetlenül a képre, nem készíthet képmetszetet és nem menthet új képi változatot.

A rajzolási korlátozás nem csak kliensoldali: a szerveroldali `POST /api/meeting-assistant/attachments/edited` végpont is kizárólag szervezői jogosultságot fogad el.

## Keskeny Teams-panel

- A szerkesztő keskeny panelben külön kompakt elrendezést használ.
- Az eszköztár a kép felett, egy sorban, mindig látható.
- Az ikonok keskeny panelben felirat nélkül, tooltip segítségével jelennek meg.
- A képterület és a mentési/képaláírási panel függőleges elrendezésű.
- Nagy Teams-ablakban és webes felületen a teljes többoszlopos szerkesztő marad.

## Élő állapotsáv és szöveges megosztás

A panel alján rögzített vezérlősáv készült:

- szövegbeviteli mező;
- négyzet alakú küldésgomb;
- mindig látható élő állapotsáv;
- négyzet alakú Teams közös-megosztás gomb.

A résztvevő által beküldött szöveg `pending` állapotú javaslat. A szervező vagy jegyzőkönyv-szerkesztő „Megjelenítés” vagy „Elvetés” művelettel kezeli. Jóváhagyás után a szöveg minden résztvevőnél látható.

## Teams közös nagy felület

- A v0.1.7 manifest `meetingStage` kontextust tartalmaz.
- Beépült a `MeetingStage.Write.Chat` delegált RSC jogosultság.
- Csatornaértekezletekhez szerepel a `ChannelMeetingStage.Write.Group` jogosultság.
- A `meetingExtensionDefinition.supportsCustomShareToStage` értéke `true`.
- A saját négyzetes DIMPRO gomb a TeamsJS `shareAppContentToStage` API-ját használja.
- A megosztott stage URL résztvevői tokent használ, így nem ad át szervezői jogosultságot más résztvevőnek.

## Alkalmazásnév és kapcsolat

A Teams rövid alkalmazásnév:

`DIMPRO Értekezleti Kísérő`

Kapcsolati címek:

- `info@dimpro.hu`: használati kérdés, funkciójavaslat, általános tájékoztatás;
- `admin@dimpro.hu`: belépési, jogosultsági, párosítási vagy technikai hiba.

A címek a panel alján kattintható e-mail-hivatkozásként és a Teams manifest teljes leírásában is megjelennek.

## Adatmodell

Új típusok:

- `MeetingSharedMessageStatus`: `pending | shared | rejected`;
- `MeetingSharedMessage`;
- `MeetingWorkspace.sharedMessages`.

Új workspace-műveletek:

- `submit_shared_message`;
- `review_shared_message`.

A nem szervezői export csak `shared` állapotú szövegeket és `shared` állapotú mellékleteket tartalmaz.

## Tesztelés

Új integrációs teszt:

`scripts/test-meeting-collaboration-v017.cjs`

A teszt ellenőrzi:

- Teams-meeting és DIMPRO-workspace párosítását;
- külön szervezői és résztvevői tokent;
- résztvevői feltöltési visszajelzést;
- függő melléklet elrejtését;
- szervezői jóváhagyást és megosztást;
- résztvevői közös képaláírást;
- védett mellékletmetaadatokat;
- résztvevői rajzolás szerveroldali tiltását;
- szöveges javaslat jóváhagyását;
- manifest v0.1.7 stage-beállításait.

## Rollback

Fejlesztés előtti mentés:

`backups/meeting-collaboration-20260722_213935`

## Végső ellenőrzési eredmények

- TypeScript: sikeres;
- teljes ESLint: 0 hiba, 112 korábbi figyelmeztetés;
- production build: sikeres;
- együttműködési API-integráció: 22/22;
- böngészős keskeny/széles felületteszt: 20/20;
- mellékletszerkesztő regresszió: 11/11;
- editor-jogosultság regresszió: 17/17;
- lezárás és archiválás regresszió: 16/16;
- Microsoft Teams v1.23 manifest-sémavalidáció: sikeres.

Teams-csomag:

`DIMPRO_Ertekezleti_Kisero_Teams_App_v0_1_7.zip`

SHA-256:

`5d55790e091ca15bcf95a2578fb2dac4f5f869f8c3badcc5236c9fb7d328aa3e`
