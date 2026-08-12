# 178 — BENJADMIN Konzol: közös belső monorepo-kötés

Dátum: 2026-08-12  
Környezet: DEV  
Kapcsolódó dokumentumok: 176, 177

## Cél

A Fejlesztői Konzolból létrehozott DIMPRO / DIMPROVER logikai projekt-taskok ugyanahhoz az egy fizikai DEV Git repositoryhoz kötődjenek úgy, hogy a B3 scope-lock konfliktusvédelem ne legyen megkerülhető.

## Kiinduló állapot

A Development Center egyetlen belső fizikai repository rekordja:

- repository ID: `repo_dimprover`
- repository név: `DIMPROVER monorepo`
- owner logikai projekt: `project_dimprover`
- DEV bare repository: `/srv/dimpro-dev/repositories/dimprover.git`
- branch stratégia: worktree

A Konzolban külön logikai projektek vannak többek között:

- `project_dimprover`
- `project_dimpro`
- `project_drive_drop`
- `project_fajlmuhely`
- `project_infrastructure`

A korábbi repository policy kizárólag `repository.project_id === projectId` kapcsolatot engedett, ezért például egy `project_drive_drop` task nem kaphatta meg biztonságosan a `repo_dimprover` repository ID-t.

## Elutasított megoldás

Nem hoztunk létre projektenként külön repository rekordot ugyanarra a fizikai Git repositoryra. Ez biztonságilag hibás lenne, mert a B3 scope lock kulcsa repository ID + scope. Két külön repository ID ugyanarra a fizikai fára párhuzamos, egymást nem látó scope-lockot eredményezhetne.

Egy külön relációs binding-tábla terve elkészült, de a közvetlen PostgreSQL migráció végrehajtását a rendelkezésre álló connector biztonsági policy blokkolta. A korlátozást nem kerültük meg; a migráció nem került alkalmazásra, a draft fájlok törlésre kerültek.

## Aktivált megoldás — meglévő repository metadata allowlist

A már meglévő `dev_center_repositories.metadata` mezőn, a DEV service-role alkalmazáscsatornán keresztül explicit belső monorepo allowlist került a `repo_dimprover` rekordra:

```json
{
  "sharedInternalMonorepo": true,
  "internalProjectIds": [
    "project_dimprover",
    "project_dimpro",
    "project_drive_drop",
    "project_fajlmuhely",
    "project_infrastructure"
  ],
  "scopeLockRepositoryId": "repo_dimprover",
  "bindingVersion": 1,
  "bindingOrigin": "BENJADMIN_DEVELOPER_CONSOLE_V1"
}
```

A módosítás előtt az eredeti repository rekord backupba került:

`/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2/.dimprover/backups/shared-monorepo-20260812T211940035Z`

A backup titkot nem tartalmaz.

## Kód

Új pure helper:

`app/lib/dev-center/internal-repository-binding.ts`

A `internalRepositoryProjectAllowed()` szabályai:

1. a repository saját owner projektje mindig engedett;
2. más belső logikai projekt csak `sharedInternalMonorepo=true` esetén engedett;
3. az adott projektnek szerepelnie kell az `internalProjectIds` allowlistben;
4. hiányzó / hibás metadata fail-closed.

`app/lib/dev-center/partner-isolation.ts`:

- belső repository gyökér: `/srv/dimpro-dev/repositories`;
- `resolveProjectRepositoryId()` feloldja a logikai projekt fizikai repository ID-ját;
- több találat esetén fail-closed `INTERNAL_REPOSITORY_AMBIGUOUS`;
- belső repository csak explicit metadata allowlisttel használható;
- `dev_path` kötelezően a belső repository gyökér alatt marad;
- Partner Development Plane pontos project/repository és partner root védelme változatlan.

`app/api/dev/console/messages/route.ts`:

- task létrehozás előtt repository feloldás;
- repository nélkül 409 / `DEV_CONSOLE_REPOSITORY_BINDING_REQUIRED`;
- a task valódi `repository_id` értéket kap.

## Miért fontos ugyanaz a repository ID

A B3 scope-lock továbbra is az egyetlen `repo_dimprover` ID-ra épül. Így egy Drive és egy Fájlműhely fejlesztés nem tudja ugyanazt a path/module scope-ot két eltérő logikai repository ID alatt párhuzamosan zárolni.

## Bootstrap

`scripts/benjadmin-shared-monorepo-bootstrap.mjs`

- alapból dry-run;
- csak `dimpro-dev` hoston fut;
- ellenőrzi a repository pontos ID/path/status értékeit;
- ellenőrzi az öt elvárt belső projekt létezését;
- `--apply` előtt helyi, titokmentes backup;
- apply után visszaellenőrzi a metadata-kötést.

## Biztonsági regresszió

Outmin-AI belső projekt-hozzáférése nem változott.

Valós runtime acceptance:

- `project_drive_drop` + `OUTMINAI` → **403 `PARTNER_OUTMIN_INTERNAL_DENIED`**;
- tiltott task nem jött létre.

A Partner Development Plane P2 policy acceptance továbbra is **12/12 PASS**, P5 final acceptance **53/53 PASS**.

## Konzol eredmény

Valós Konzol dispatch acceptance `project_drive_drop` projektre:

- POST 201;
- valódi task létrejön;
- felelős `worker_arminai`;
- projekt `project_drive_drop`;
- repository **`repo_dimprover`**;
- BENJADMIN és Ben-AI worklog ugyanarra a taskra mutat;
- natív executor hiányában állapot továbbra is `EXECUTOR_NOT_CONFIGURED`;
- acceptance fixture a teszt végén törlődik.

## Acceptance

- shared monorepo pure contract: **6/6 PASS**;
- shared monorepo runtime acceptance: **5/5 PASS**;
- Konzol dispatch integration: **8/8 PASS**;
- Fejlesztői Konzol browser acceptance: **38/38 PASS**;
- B3.2 P2 policy acceptance: **12/12 PASS**;
- B3.2 P5 final acceptance: **53/53 PASS**;
- TypeScript: PASS;
- full lint: **0 error / 104 meglévő warning**;
- build: **`We5h9e_NmaFDL4aXvAZqp`**;
- PM2 DEV: online;
- PROD: nem módosult.

## Következő gate — natív worker executor

A lánc jelenlegi valós szintje:

`BENJADMIN -> Ben-AI -> task -> explicit worker -> repo_dimprover`

A következő blokk csak valós executor mellett léphet tovább:

`session -> branch -> worktree -> scope lock -> READY -> kód -> teszt -> build -> eredmény`

Nem nyitunk előre dormant worker sessionöket, mert az foglalná Ármin-AI / Jázmin-AI workert úgy, hogy még nincs végrehajtó folyamat, amely a sessiont ténylegesen fogyasztaná.

A natív executor következő előfeltételei:

1. trusted baseline/integration Git-ref kijelölése;
2. allowlistelt worker műveleti szerződés;
3. worktree név/path képzés és konfliktusvédelem;
4. session heartbeat / recovery;
5. AI/provider adapter külön szerveroldali secretből;
6. teljes audit és human approval pontok.
