# BENJADMIN Developer Grid – System Health Integration V1

**Dátum:** 2026-08-30
**Fejlesztési mód:** nappali fejlesztési ütem
**Környezet:** DEV ONLY
**PROD/DB:** READ ONLY · PROD DENY
**Célterület:** BENJADMIN Fejlesztői Vezérlőpult + Developer Grid System Health

## 1. Cél

A Developer Grid számára olyan központi rendszerállapot készüljön, amely a btop-szerű technikai mélységből a fejlesztéshez releváns adatokat emeli ki, gyorsan értelmezhető formában.

Három szint maradjon:
1. **Footer gyorsállapot** – 1–2 másodperc alatt értelmezhető.
2. **System Health / Fejlesztői Vezérlőpult** – részletes, de vizuálisan tömör.
3. **Terminálos mélydiagnosztika** – btop, journalctl, systemctl, pm2, nvidia-smi stb., külön explicit diagnosztikai úton.

A System Health nem helyettesíti a Terminal Hubot és nem ad automatikus PROD/DB végrehajtási jogot.

## 2. Felügyelt infrastruktúra

### DEV
- CPU %, load1, cores;
- RAM total/used/available/%;
- swap total/used/%;
- Linux memory PSI;
- root disk total/used/%;
- uptime;
- kritikus PM2 DEV folyamatok aggregált állapota;
- Developer Grid runtime;
- central exclusive-operation lock;
- aktív build/release művelet.

### BUILD01 / BUILD02
- READY / BUSY / NOT_CONNECTED / DEGRADED;
- SSH readiness szerveroldali kontrollból;
- CPU/RAM/swap/disk health agentből, ha elérhető;
- aktív build ID, source commit/branch;
- kezdés, elapsed time;
- queue/executor availability;
- lock;
- legutóbbi sikeres és hibás build rövid állapota;
- random fallback executor továbbra is tiltott.

### PROD
Kizárólag read-only:
- HTTPS availability;
- latency;
- runtime/service availability;
- CPU/RAM/swap/disk csak kontrollált snapshotból/health agentből;
- release/runtime provenance: VERIFIED / MISMATCH / UNKNOWN;
- aktuális release, ha secret nélkül lekérhető;
- restart/deploy/shell innen nem indítható.

### DB
Kizárólag read-only:
- TCP reachability;
- latency;
- PostgreSQL service state, ha kontrollált forrás biztosítja;
- CPU/RAM/swap/disk snapshotból;
- pool/connection terhelés csak aggregáltan;
- connection string, jelszó, token soha nem jelenhet meg.

### STORAGE
Külön registry:
- DEV ROOT;
- DIMPRO Drive/object storage;
- DIMPRO Drop storage;
- backup storage;
- artifact/release storage;
- későbbi NAS/object storage node-ok.

Metrikák:
- total/used/free/%;
- állapot;
- sampledAt;
- trend: stabil / gyorsan fogy / kritikus;
- később várható telítődés becslése.

## 3. DIMPROMIN AI Node Health

A System Health bővíthető AI node registryt kapjon, ne fix szerverre legyen kódolva.

Javasolt azonosítók:
- `dimpromin-ai-01`
- `dimpromin-ai-02`
- további node-ok ugyanazon séma szerint.

Állapotok:
- PLANNED
- NOT_CONNECTED
- READY
- BUSY
- DEGRADED
- BLOCKED
- OFFLINE

AI node metrikák, ha támogatott:
- CPU/RAM/swap/disk;
- GPU típus;
- GPU util %;
- VRAM total/used/%;
- GPU temperature;
- power draw/limit;
- driver/CUDA rövid verzió;
- inference runtime service;
- loaded model;
- quantization/precision;
- active inference count;
- queue depth;
- tokens/sec vagy engine throughput;
- last successful inference;
- model load/unload állapot.

Biztonság:
- prompt, conversation, user data, API key, token és teljes request/response payload nem health adat;
- AI node csak SANITIZED HEALTH payloadot adhat;
- RAW diagnosztika csak Terminal Hub/admin diagnosztikai úton.

## 4. Közös Health adatmodell

```ts
type InfrastructureNodeKind =
  | "DEV"
  | "BUILD"
  | "PROD"
  | "DATABASE"
  | "STORAGE"
  | "AI";

type InfrastructureHealthState =
  | "READY"
  | "BUSY"
  | "DEGRADED"
  | "BLOCKED"
  | "NOT_CONNECTED"
  | "OFFLINE"
  | "UNKNOWN"
  | "PLANNED";

type InfrastructureHealthNode = {
  id: string;
  label: string;
  kind: InfrastructureNodeKind;
  state: InfrastructureHealthState;
  severity: "OK" | "INFO" | "WARNING" | "CRITICAL";
  reason: string;
  sampledAt: string | null;
  staleAfterMs: number;
  readOnly: boolean;
  metrics: Record<string, number | string | boolean | null>;
  capabilities: string[];
  source: string;
};
```

A frontend erre a normalizált node-listára épüljön, ne közvetlenül szerver-specifikus objektumokra.

## 5. Health State Engine

Az állapotot backend számítsa; frontend csak jelenítse meg.

Alap küszöbök:
- RAM: <75 OK, 75–84 INFO, 85–92 WARNING, >92 CRITICAL.
- Swap: <50 OK, 50–79 WARNING, >=80 CRITICAL.
- Disk: <80 OK, 80–89 INFO, 90–94 WARNING, >=95 CRITICAL.
- Memory PSI: tartós pressure WARNING, buildet veszélyeztető pressure CRITICAL.
- GPU magas kihasználtság BUSY lehet; csak OOM/thermal/engine failure legyen CRITICAL.

A küszöbök node-típusonként konfigurálhatók legyenek.

## 6. Footer

Maradjon egysoros és nagy kijelzőn olvasható.

Javasolt sorrend:
`DEV | ChatGPT | DELTA | AI | BUILD01 | BUILD02 | DEV VPS | PROD | DB | STORAGE | DIMPROMIN`

Példák:
- `DEV VPS 68% RAM`
- `BUILD01 BUSY 12p`
- `PROD READY`
- `DB 22ms`
- `STORAGE 84%`
- `DIMPROMIN 1/2 READY`

Teljes szegmens-háttér:
- OK: visszafogott zöld;
- BUSY: kék/türkiz;
- WARNING: borostyán;
- CRITICAL/BLOCKED: piros;
- UNKNOWN/NOT_CONNECTED: szürkés.

## 7. System Health teljes panel

A meglévő jobb alsó health hexagon marad:
- hover → compact peek;
- click → teljes szélességű panel közvetlenül a footer fölött.

Fő csoportok:
1. Compute – DEV, BUILD01, BUILD02
2. Live/Data – PROD, DB
3. Storage
4. DIMPROMIN AI
5. Developer Grid Runtime – ChatGPT bridge, DELTA, PM2, lock, build coordinator

Node kártya:
- név, state, severity;
- last sampled;
- CPU/RAM/swap/disk/latency;
- node-specifikus metrikák;
- stale jelzés;
- rövid reason.

AI node: GPU/VRAM/model/queue is.

Aggregált fejléc:
`RENDSZER RENDBEN · 7 READY · 1 BUSY · 0 WARNING · 2 NOT CONNECTED`

Hiba esetén:
`FIGYELEM · DEV VPS MEMORY PRESSURE · BUILD02 NOT CONNECTED`

## 8. Fejlesztői Vezérlőpult integráció

A Central Core-ban külön **RENDSZERÁLLAPOT** blokk legyen:
- overall health;
- DEV erőforrás-kockázat;
- build executor readiness;
- PROD/DB read-only availability;
- DIMPROMIN capacity;
- storage warning;
- active central lock/build/release.

Döntéstámogató gate-ek:
- `BUILD NEM JAVASOLT · memory pressure`
- `BUILD01 READY · javasolt executor`
- `DIMPROMIN AI node nincs elérhető`
- `STORAGE WARNING`

Első körben információ/gate, nem autonóm infrastruktúra-kezelés.

## 9. Terminálos diagnosztika

A System Healthből később explicit:
- `DIAGNOSZTIKA`
- `TERMINAL HUB`
- `BŐVEBB NODE ADATOK`

A health panel ne másolja be a teljes btopot.

DEV deep diagnostics:
- btop
- free
- /proc/pressure
- df
- systemctl
- PM2
- build coordinator
- journal

AI deep diagnostics:
- nvidia-smi
- inference engine status
- model process
- GPU OOM/thermal
- queue/worker diagnostics

RAW termináladatokra a BENJADMIN Terminal Hub security szabályai érvényesek.

## 10. Polling/cache

Meglévő elv megtartandó:
- DEV/BUILD: 30 s
- PROD/DB: 60 s
- disk: 60 s
- storage: 300 s
- DIMPROMIN base health: 30 s
- BUSY GPU node: opcionális 10–15 s szerveroldali cache

A desktop ne növelje a Supabase pollingot. Footer és panel ugyanazt a szerveroldali cache-t használja.

## 11. Adatforrás prioritás

1. helyi OS metrika;
2. kontrollált read-only node health agent;
3. meglévő infra snapshot;
4. read-only HTTP/TCP probe;
5. ha nincs adat: UNKNOWN/NOT_CONNECTED.

Hiányzó adatot nem szabad becsülni aktuális értékként.

## 12. Stale/data quality

Minden node:
- sampledAt
- source
- staleAfterMs
- quality

Stale adat látható maradhat, de `STALE` jelölést kap és nem számít READY bizonyítéknak.

## 13. Alert események

Első körben vizuális:
- READY → WARNING
- WARNING → CRITICAL
- OFFLINE/NOT_CONNECTED
- storage threshold crossing
- build node elvesztése
- DIMPROMIN engine failure
- PROD/DB availability loss

Debounce kötelező.

## 14. Biztonság

- DEV ONLY fejlesztés;
- PROD/DB READ ONLY;
- secret nem kerülhet health payloadba;
- command/token/env/connection string tiltott;
- node agent allowlistelt mezőket ad;
- nincs automatikus restart/deploy;
- build executor csak existing coordinator szabályai szerint;
- PROD access DENY.

## 15. Fejlesztési fázisok

### A – Health Core V2
- normalizált node modell;
- node registry;
- severity engine;
- stale kezelés;
- DEV/BUILD/PROD/DB/STORAGE adapterek;
- DIMPROMIN AI adapter interface.

### B – System Health UI V2
- aggregált header;
- csoportos node kártyák;
- CPU/RAM/swap/disk/GPU bars;
- responsive full-width panel;
- hover peek;
- footer státuszok.

### C – Central Core integráció
- RENDSZERÁLLAPOT blokk;
- build readiness;
- storage warning;
- DIMPROMIN capacity;
- active lock/operation;
- informational gates.

### D – DIMPROMIN AI Health
- AI registry;
- GPU/VRAM/model/queue schema;
- agent/probe interface;
- PLANNED/NOT_CONNECTED agent nélkül is.

### E – Diagnostics bridge
- diagnosztika gomb;
- Terminal Hub deep-link;
- node filter/context átadás;
- automatikus parancsfuttatás nélkül.

## 16. Első release acceptance

1. footer egy pillantásra mutatja a fő állapotokat;
2. System Health külön csoportban DEV/BUILD/PROD/DB/STORAGE/DIMPROMIN;
3. hiányzó adat UNKNOWN/NOT_CONNECTED;
4. PROD/DB read-only;
5. DIMPROMIN PLANNED/NOT_CONNECTED agent nélkül is;
6. AI node támogat GPU/VRAM/model/queue mezőket;
7. stale adat nem READY;
8. Central Core RENDSZERÁLLAPOT blokk;
9. build readiness egyértelmű;
10. lock/active operation látható;
11. mélydiagnosztika külön marad;
12. secret-scan PASS;
13. System Health contract bővül;
14. TypeScript + desktop regression + runtime smoke PASS;
15. PROD DENY.

## 17. Nem cél

- Grafana/Prometheus teljes helyettesítése;
- automatikus PROD restart;
- automatikus DB maintenance;
- self-healing;
- teljes logaggregáció;
- prompt/conversation monitorozás;
- btop teljes UI-klónozása.

## 18. Nappali fejlesztési sorrend

1. jelenlegi Developer Grid worker-kiosztási javítás lezárása;
2. **MUNKAFELVÉTEL – System Health Integration V1**;
3. Health Core V2;
4. System Health UI V2;
5. Central Core RENDSZERÁLLAPOT;
6. DIMPROMIN AI registry/interface;
7. contract/regresszió;
8. canonical build;
9. Windows acceptance;
10. release/handoff.

**Alapelv:** a System Health gyors döntéstámogató vezérlőréteg; a btop-szintű mélydiagnosztika marad a Terminal Hub/terminál feladata.
