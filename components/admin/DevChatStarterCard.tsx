"use client";

import { useState } from "react";
import { Check, ClipboardCopy, MessageSquareText } from "lucide-react";

const STARTER_TEXT = `DIMPRO FEJLESZTÉSI MUNKAFOLYAMAT – ÚJ CSEVEGÉS INDÍTÁSA

A fejlesztési munka megkezdése előtt olvasd be a DIMPRO Fejlesztési Központban a meglévő projekt-, modul-, verzió- és időnyilvántartást:
https://license.dimpro.hu/admin/dev

KITÖLTENDŐ ALAPADATOK
Projekt: [PROJEKT NEVE]
Modul / almodul: [MODUL NEVE]
Verzió / fejlesztési kör: [VERZIÓ]
Fejlesztés címe: [RÖVID CÍM]
Cél / elvárt eredmény: [PONTOS RÖVID LEÍRÁS]
Elfogadási feltétel: [MIKOR TEKINTHETŐ KÉSZNEK]
Érintett rendszer: [WEB / DESKTOP / API / VPS / ADATBÁZIS]
Projektmappa: [PÉLDA: /root/dimprover]
PM2 folyamat: [PÉLDA: dimprover]
Kiinduló verzió vagy fájl: [HA VAN]
Kapcsolódó fejlesztési terv / dokumentum: [HA VAN]
Nem módosítható vagy megőrzendő funkciók: [HA VAN]

KÖTELEZŐ FEJLESZTÉSI MUNKAFOLYAMAT
1. Ellenőrizd a szerver, a projektmappa, a PM2 folyamat és a jelenlegi verzió állapotát.
2. Keresd meg a Fejlesztési Központban a projektet és a korábbi verziókat. Ha nincs megfelelő projekt, ideiglenesen az „Egyéb / besorolatlan” projektbe rögzítsd.
3. Hozd létre vagy frissítsd a fejlesztési verziót, add meg a modult, a rövid leírást és indítsd el az aktív fejlesztési időmérést.
4. Módosítás előtt készíts biztonsági mentést. Működő modult vagy funkciót ne törölj, és ne módosíts szükségtelenül más rendszerrészt.
5. A fejlesztés közben rögzítsd a fontos állapotváltozásokat, a módosított fájlokat, a létrehozott linkeket, a hibákat és a következő folytatási pontot.
6. Ha a munka szünetel vagy kézi beavatkozásra vár, állítsd le az időmérést és rögzítsd a blokkoló okot. Folytatáskor indíts új munkamenetet.
7. Futtasd le a szükséges ellenőrzéseket: lint, TypeScript, build, célzott funkcióteszt és smoke ellenőrzés. Élesítés csak sikeres ellenőrzések után történjen.
8. Ellenőrizd mobilon és asztali nézetben is az érintett felületet, ha a fejlesztés felhasználói felületet módosít.
9. A fejlesztés végén állítsd le az időmérést, rögzítsd a tényleges ráfordítást, a befejezés pontos idejét, a rövid változásleírást, a teszteredményeket, a release- vagy letöltési linket és a következő fejlesztési javaslatot.
10. A sikeres befejezés után küldj DIMPRO fejlesztési értesítést a Fejlesztési Központba és a regisztrált mobilos push eszközökre.
11. Csak akkor állj le, ha valóban kézi beavatkozás szükséges. Ilyenkor pontosan írd le, mit kell elvégeznem és hol.
12. A végső válaszban röviden sorold fel: mi készült el, mely fájlok változtak, milyen tesztek futottak le, hol érhető el az eredmény, mennyi aktív fejlesztési idő lett rögzítve, és maradt-e ismert hiba.

FONTOS FEJLESZTÉSI ELVEK
- A meglévő DIMPRO / DIMPROVER architektúrát és közös modulmotorokat tartsd meg.
- Ne készíts párhuzamos, felesleges másolatot már meglévő engine-ből vagy komponensből.
- A biztonsági kulcsokat, jelszavakat és titkos környezeti változókat ne jelenítsd meg a csevegésben vagy a felületen.
- Ne állíts sikeresnek olyan fejlesztést, amelynek buildje, tesztje vagy tényleges működése nincs ellenőrizve.
- A felhasználói felület legyen mobilbarát, világos és sötét módban is olvasható.`;

export default function DevChatStarterCard() {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  async function copyStarterText() {
    try {
      await navigator.clipboard.writeText(STARTER_TEXT);
      setCopied(true);
      setMessage("A teljes fejlesztési indítószöveg a vágólapra került.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = STARTER_TEXT;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      textarea.remove();
      setCopied(success);
      setMessage(success
        ? "A teljes fejlesztési indítószöveg a vágólapra került."
        : "A másolás nem sikerült. Jelölje ki kézzel a szöveget.");
    }
  }

  return (
    <section className="dev-chat-starter" aria-labelledby="dev-chat-starter-title">
      <div className="dev-chat-starter__heading">
        <div className="dev-chat-starter__icon"><MessageSquareText size={24} aria-hidden="true" /></div>
        <div>
          <p className="dev-section-label">Minden új fejlesztési csevegéshez</p>
          <h2 id="dev-chat-starter-title">Új csevegés indítószövege</h2>
          <p>A sablon biztosítja a projekt, verzió, időmérés, tesztelés és elkészülési értesítés egységes kezelését.</p>
        </div>
        <button type="button" className={copied ? "is-copied" : ""} onClick={() => void copyStarterText()}>
          {copied ? <Check size={18} /> : <ClipboardCopy size={18} />}
          {copied ? "Kimásolva" : "Teljes szöveg másolása"}
        </button>
      </div>

      <textarea
        className="dev-chat-starter__text"
        value={STARTER_TEXT}
        readOnly
        aria-label="Új fejlesztési csevegésbe másolandó teljes indítószöveg"
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="dev-chat-starter__footer">
        <span>A szögletes zárójelben lévő mezőket az új csevegés indításakor kell kitölteni.</span>
        {message ? <strong>{message}</strong> : null}
      </div>
    </section>
  );
}
