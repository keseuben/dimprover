# DIMPRO Build Transport Gateway V1

**Környezet:** DEV ONLY · PROD DENY

A BENJADMIN Developer Grid BUILD01/BUILD02 végrehajtásának hálózati átjárója. A canonical DEV VPS nem kap közvetlen SSH-hozzáférést a build node-okhoz. A vezérlési és artifact útvonal:

`Developer Grid / DEV → HTTPS mcp.dimprover.hu/build-gateway/v1 → MCP VPS Build Transport Gateway → SSH BUILD01/BUILD02 → MCP VPS → canonical DEV artifact store`

## API

- `GET /health` – publikus, nem érzékeny service health.
- `GET /nodes` – csak engedélyezett DEV ingress; sanitizált BUILD01/BUILD02 health snapshot.
- `POST /dispatch?...` – exact Git bundle feltöltés és explicit runner dispatch.
- `GET /runs/:runId` – futásállapot lekérdezés.

Nincs általános command/terminal endpoint, nincs deploy, migration, restart vagy cutover művelet.

## Biztonság

- A szolgáltatás csak `127.0.0.1:8791` címen figyel.
- Az Nginx útvonal hálózati allowlisttel csak a canonical DEV VPS-t és localhostot engedi.
- Az Nginx saját `X-DIMPRO-Build-Gateway-Proxy: 1` trust markert ad; a service ezt csak loopback peer esetén fogadja el.
- Közvetlen localhost diagnosztikához külön Bearer token használható. A token nem kerül forrásba, logba vagy frontendbe.
- Source bundle csak érvényes task/session/worker/commit/branch/runner azonosítókkal fogadható.
- A gateway külön bare verify repositoryban `git bundle verify` ellenőrzést végez, majd a branch ref HEAD-jét összeveti a kért teljes commit SHA-val.
- A worker közvetlenül a futtatás előtt újraellenőrzi a kijelölt runner `READY + LIVE + FREE` állapotát.
- A scheduler által kijelölt runner nem cserélhető le rejtetten.
- A gateway csak `BUILD01` vagy `BUILD02` node-on indíthatja a hardened `/srv/dimpro-build/bin/dimpro-build-runner-executor-v1` végrehajtót.
- A visszaérkező metadata + artifact SHA-256 újraellenőrzött, majd a gateway atomikusan visszaszinkronizálja a canonical DEV artifact store-ba.

## Telepítési objektumok

- `/opt/dimpro-build-gateway/server.mjs`
- `/opt/dimpro-build-gateway/worker.mjs`
- `/etc/systemd/system/dimpro-build-gateway.service`
- `/etc/dimpro-build-gateway/token` – opcionális localhost/Bearer diagnosztikai token, `0600`
- `/srv/dimpro-build-gateway/runs` – gateway run/evidence tár
- Nginx: `mcp.dimprover.hu` → `/build-gateway/v1/` → `127.0.0.1:8791`

A canonical Developer Grid kliens alap URL-je: `https://mcp.dimprover.hu/build-gateway/v1`. Hardcoded BUILD IP-cím nincs a kliensben; az aktuális DEV VPS IP csak az Nginx hálózati allowlist része.
