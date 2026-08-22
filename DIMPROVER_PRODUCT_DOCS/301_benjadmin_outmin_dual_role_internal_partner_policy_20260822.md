# BENJADMIN – OutminAI dual-role worker policy V1

Dátum: 2026-08-22  
Környezet: DEV only  
PROD: DENY

## Döntés

A BENJADMIN aktuális ChatGrid / Common Chat modellben OutminAI a belső worker-csoport tagja BenAI, ÁrminAI és JázminAI mellett. Emellett a B3.2 Partner Development Plane dedikált worker-szerepét is megtartja.

## Belső DEV használat

- OutminAI belső DIMPRO / DIMPROVER / BENJADMIN DEV projekthez explicit BenjAdmin/BenAI task-kiosztással rendelhető.
- Automatikus `claim_next_task` továbbra is tiltott számára.
- Tényleges ACTIVE állapot csak worker-oldali taskfelvétel / Plus-MCP pull / hiteles presence után állítható.
- Shared build/release/migration/restart/cutover továbbra is központi exclusive lockhoz kötött.

## Partner Development Plane

- Partnerprojekten továbbra is csak a projekthez kötött OutminAI identity használható.
- Partner repository, worktree, environment és resource allowlist szabályok változatlanok.
- A partner runtime nem kap általános belső DIMPRO filesystem-hozzáférést.

## Biztonsági cél

A változás nem nyit általános OutminAI hozzáférést és nem enged PROD műveletet. A cél kizárólag a 2026-08-20-i Common Chat V2.3 worker-modell és a korábbi B3.2 partnerizoláció összehangolása.

## Acceptance

- belső explicit OutminAI task létrehozható és route-olható;
- OutminAI automatikus next-task claim továbbra is tiltott;
- partnerprojekt worker/resource policy változatlan;
- PROD DENY;
- ChatGridben `KIOSZTVA/READY` és tényleges `MUNKAFELVÉTEL/ACTIVE` továbbra is külön állapot.
