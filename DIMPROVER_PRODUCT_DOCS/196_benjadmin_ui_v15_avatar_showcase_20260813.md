# 196 — BENJADMIN UI V1.5 · avatar és AI csapat bemutató

Dátum: 2026-08-13
Környezet: DEV
Kiinduló integráció: 31b5d02

## Új BENJADMIN avatar

Resource: devres-d2cfe5f0-5979-48e8-ac66-882e912f487d
Asset: 01_BenjADMIN_mod1.png
SHA-256: c5173330c06aaaf6963ac2b37d471a6fbe794dc6bb62288e60b10e1842ece025
Publikus DEV asset: /benjadmin/team/01_BenjAdmin_mod1.png

A Fejlesztői Konzol alsó vezetői avatárja desktopon 280×280 px. Nincs külön kártyaháttér, border vagy box-shadow. A chat-avatar 44 px, a vezetői task-avatar 52 px.

## Bemutató nézet
Ctrl+Alt+9 megnyitja és ismételt lenyomás bezárja az AI csapat bemutató tablót. Esc szintén bezárja. A bemutató név, titulus és rövid munkaköri leírás adatokat mutat minimum 12 px betűmérettel.

Segédanyag: devres-bf7f1417-9603-4218-849f-0d59517fb774; SHA-256: 2d1c7625bb83082868529152723ffd5bf5046ea844348e41b8d133d3ba59fb0c; publikus DEV asset: /benjadmin/benjadmin-ai-csapat-tablokep-260813.png. A nézet nem mutat szerver-, licenc-, költség-, token- vagy task/session adatot.

## Ellenőrzés
TypeScript PASS; célzott lint PASS; teljes lint 0 error / 104 meglévő warning; Next build PASS; 92/92 static page; candidate /admin 200; mindkét új asset 200; statikus UI/shortcut contract 13/13 PASS. Az admin-secretet olvasó Puppeteer acceptance-et az MCP security gate blokkolta, ezért a secret-védelmet nem kerültük meg. PROD nem érintett.
