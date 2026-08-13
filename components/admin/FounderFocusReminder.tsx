"use client";

import { useEffect, useState } from "react";
import { ChevronRight, ShieldCheck, X } from "lucide-react";

export const founderFocusMessages = [
  { title: "A tudáselőny addig előny, amíg nem specifikálod másnak.", body: "Munkahelyen beszélhetsz a problémáról és az igényről, de a saját DIMPRO-megoldásod részletes workflow-ját és architektúráját nem kell átadnod." },
  { title: "Ne az ötletet mutasd meg. A működő rendszert mutasd meg.", body: "A következő időszak értéke a csendes építés: stabil termék, dokumentált verziók, működő modulkapcsolatok és valódi használhatóság." },
  { title: "A problémát megoszthatod; a kész megoldási recept a saját terméked része.", body: "Szakmai kérdésnél maradj a projektvezetői problémameghatározásnál. A megvalósítás részleteit ne add át automatikusan más fejlesztési csapatnak." },
  { title: "Soha ne becsüld le a másik fejlesztőcsapatot.", body: "Nem tudjuk, milyen eszközökkel, AI-agentekkel vagy belső tudással dolgoznak, és azt sem, mit fejlesztenek csendben. Úgy építs, mintha egy erős csapat ugyanabban a versenyben lenne: gyorsan, dokumentáltan és következetesen." },
  { title: "Dokumentálj mindent, kommunikálj csak annyit, amennyi szükséges.", body: "Git-előzmény, verziók, döntési napló és saját infrastruktúra őrizze a fejlesztési történetet. A munkahelyi kommunikáció maradjon magas szintű." },
  { title: "Ne specifikáld más helyett azt, amit saját termékként építesz.", body: "Ha belső IT-fejlesztés indul, annak követelményeit és megoldását a vállalati folyamatban dolgozzák ki. A DIMPRO saját terméklogikája maradjon elkülönítve." },
  { title: "A végső bemutató ereje a működésből jön.", body: "A cél nem a titkolózás, hanem az információfegyelem: előbb építs stabil rendszert, utána kommunikálj róla termékként, bizonyítható eredménnyel." },
  { title: "A roadmap üzleti érték.", body: "Az, hogy mit, milyen sorrendben és milyen közös motorokra építve fejlesztesz, önmagában is versenyelőny. Ezt nem kell munkahelyi ötletelésben részletezni." },
  { title: "A jó UX mögötti döntések is szellemi értéket képviselnek.", body: "Nem csak a kód értékes. A terepi munkafolyamatok, jogosultsági logika, modulkapcsolatok és képernyőfolyamatok együtt adják a termék előnyét." },
  { title: "A saját infrastruktúra határvonal.", body: "Saját gép, saját szerver, saját repository, saját domain és saját dokumentáció segít egyértelműen elkülöníteni a DIMPRO fejlesztési történetét." },
  { title: "Az AI felgyorsíthatja a kódolást, de nem helyettesíti a terméklogikát.", body: "Nem tudjuk, hogy más fejlesztők agentekkel, Claude-dal, Codexszel vagy hagyományosabban dolgoznak. A valódi előny a részletes követelményrendszer, a modulkapcsolatok és a hónapok alatt kialakított döntési logika; a gyorsabb eszköz önmagában ezt nem pótolja." },
  { title: "A csendes építés nem passzivitás.", body: "Miközben kevesebbet beszélsz róla, a rendszer verzióról verzióra erősödik. A fejlődést a saját adminodban és dokumentációdban tedd láthatóvá." },
  { title: "A működő prototípus bizonyíték; a további fejlesztés már megállapodás.", body: "Segíthetsz egy kezdeti rendszerrel, de ne vállalj korlátlan ingyenes továbbfejlesztést. Ha valódi bevezetés, fenntartás és új igények jönnek, legyen hozzá döntés, felelős és tisztázott értékcsere." },
  { title: "A fenntartás is fejlesztési munka.", body: "Egy működő belső rendszerhez hibajavítás, támogatás, új igények és karbantartás tartozik. Ezeket ne kezeld láthatatlan, automatikusan járó pluszmunkaként." },
  { title: "Tartsd külön a saját termékedet és a céges adatokat.", body: "A saját forrás, verziótörténet és terméklogika legyen tisztán elkülönítve a munkáltató adataitól és tárhelyétől. A világos határ egyszerre védi a saját munkádat és a céges működést." },
] as const;

export default function FounderFocusReminder() {
  const [clock, setClock] = useState(() => new Date());
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!libraryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setLibraryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [libraryOpen]);

  const budapestParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(clock);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => budapestParts.find((item) => item.type === type)?.value || "0";
  const dateKey = `${getPart("year")}${getPart("month")}${getPart("day")}`;
  const hour = Number(getPart("hour"));
  const messageIndex = (Number(dateKey) * 24 + hour) % founderFocusMessages.length;
  const message = founderFocusMessages[messageIndex];
  const nextHour = (hour + 1) % 24;

  return (
    <>
      <section className="benjadmin-founder-focus" data-testid="benjadmin-founder-focus">
        <div className="benjadmin-founder-focus__icon"><ShieldCheck size={18} aria-hidden="true" /></div>
        <div className="benjadmin-founder-focus__copy">
          <span>ALAPÍTÓI FÓKUSZ · {String(hour).padStart(2, "0")}:00–{String(nextHour).padStart(2, "0")}:00 · {messageIndex + 1}/{founderFocusMessages.length}</span>
          <strong>{message.title}</strong>
          <small>{message.body}</small>
        </div>
        <button type="button" onClick={() => setLibraryOpen(true)} aria-label="Teljes fókuszüzenet-tár megnyitása">
          Összes üzenet <ChevronRight size={14} />
        </button>
      </section>

      {libraryOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Fókuszüzenet-tár bezárása" onClick={() => setLibraryOpen(false)} /> : null}
      {libraryOpen ? (
        <aside className="benjadmin-data-drawer benjadmin-founder-focus-drawer" data-testid="benjadmin-founder-focus-library">
          <header>
            <div><span>ALAPÍTÓI FÓKUSZ</span><strong>Teljes üzenettár · {founderFocusMessages.length} alapelv</strong></div>
            <button type="button" onClick={() => setLibraryOpen(false)} aria-label="Bezárás"><X size={18} /></button>
          </header>
          <div className="benjadmin-data-drawer__body">
            <section className="benjadmin-founder-focus__principles" aria-label="Információmegosztási alapelvek">
              <div><span>Munkahelyen</span><strong>Probléma és igény</strong><small>Magas szinten megosztható.</small></div>
              <div><span>DIMPRO</span><strong>Workflow és architektúra</strong><small>Saját termékismeret.</small></div>
              <div><span>Fejlesztés</span><strong>Roadmap és technikai recept</strong><small>Ne add át automatikusan.</small></div>
              <div><span>Cél</span><strong>Működő rendszerrel megjelenni</strong><small>Előbb eredmény, utána kommunikáció.</small></div>
            </section>
            <div className="benjadmin-founder-focus__library-list">
              {founderFocusMessages.map((item, index) => (
                <article key={item.title} className={index === messageIndex ? "is-current" : ""}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{item.title}</strong><p>{item.body}</p></div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
