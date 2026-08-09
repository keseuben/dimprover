"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ClipboardList,
  FileText,
  Info,
  Mail,
  MessageSquareText,
  MonitorUp,
  Paperclip,
  Pencil,
  Share2,
  Upload,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingViewRole } from "@/app/lib/meeting-assistant/types";

type TabKey = "participant" | "editor" | "contact";

type GuideItem = {
  id: string;
  title: string;
  short: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  who: string;
  when: string;
  result: string;
  steps: string[];
};

const PARTICIPANT_ITEMS: GuideItem[] = [
  {
    id: "participant-upload",
    title: "Kép vagy fájl feltöltése",
    short: "Helyszíni kép, PDF, Word, Excel vagy ZIP átadása az értekezlethez.",
    icon: Upload,
    who: "Minden résztvevő",
    when: "Amikor egy képet, tervlapot vagy egyéb dokumentumot szeretnél a szervezőnek átadni.",
    result: "A rendszer jelzi, hogy a szervező megkapta. A melléklet jóváhagyás után jelenik meg minden résztvevőnél.",
    steps: [
      "Nyisd meg a Képek és mellékletek fejezetet.",
      "Írd be a feltöltő nevét.",
      "Húzd be a fájlt vagy kattints a tallózáshoz.",
      "Várd meg az „A szervező megkapta” visszajelzést.",
    ],
  },
  {
    id: "participant-shared-image",
    title: "Megosztott kép megnyitása",
    short: "A szervező által jóváhagyott képek és mellékletek megtekintése.",
    icon: Paperclip,
    who: "Minden résztvevő",
    when: "Amikor a szervező képet, tervrészletet vagy dokumentumot osztott meg.",
    result: "A kártya lenyílik, megjelenik a nagyobb előnézet, a közös képaláírás és a letöltési lehetőség.",
    steps: [
      "Kattints a kisméretű mellékletkártyára.",
      "Olvasd el a kép alatti közös szöveget.",
      "Szükség esetén nyisd meg vagy töltsd le az eredeti fájlt.",
    ],
  },
  {
    id: "participant-caption",
    title: "Kép alatti közös szöveg szerkesztése",
    short: "A megosztott kép magyarázatának közös pontosítása.",
    icon: MessageSquareText,
    who: "Minden résztvevő megosztott képnél",
    when: "Amikor a képaláírásból hiányzik egy helyszín, munkarész, észrevétel vagy pontosítás.",
    result: "A módosított szöveg az élő szinkronnal a szervező és a többi résztvevő felületén is megjelenik.",
    steps: [
      "Nyisd le a kép kártyáját.",
      "Írd át a Kép alatti közös szöveg mezőt.",
      "Kattints a mezőn kívülre, vagy a mellékletszerkesztőben használd a Közös szöveg mentése gombot.",
    ],
  },
  {
    id: "participant-text-suggestion",
    title: "Szöveges javaslat küldése",
    short: "Rövid szöveg átadása a szervezőnek vagy jegyzőkönyv-szerkesztőnek.",
    icon: MessageSquareText,
    who: "Minden résztvevő",
    when: "Amikor egy mondatot, műszaki észrevételt vagy közösen megjelenítendő szöveget szeretnél beküldeni.",
    result: "A szervező vagy szerkesztő jóváhagyhatja, majd a szöveg minden résztvevőnél megjelenik.",
    steps: [
      "Kattints az alsó szövegküldő gombra.",
      "Írd vagy illeszd be a javaslatot.",
      "Kattints a Küldés a szervezőnek vagy szerkesztőnek gombra.",
    ],
  },
  {
    id: "participant-feedback",
    title: "Visszajelzés és tudomásulvétel",
    short: "A közzétett emlékeztető elfogadása vagy megjegyzés küldése.",
    icon: CheckCircle2,
    who: "Minden résztvevő",
    when: "Amikor a szervező összefoglalót vagy jegyzőkönyvi tervezetet tett közzé.",
    result: "A szervező látja, hogy a résztvevő tudomásul vette vagy megjegyzést küldött.",
    steps: [
      "Nyisd meg a Résztvevői visszaigazolások fejezetet.",
      "Válaszd a tudomásulvételt vagy írj megjegyzést.",
      "Küldd el a visszajelzést.",
    ],
  },
  {
    id: "participant-live-follow",
    title: "Élő követés és saját olvasás",
    short: "A megosztott Teams-nézet követi az aktív előadó nyilvános modulját, napirendi pontját és mellékletét.",
    icon: Share2,
    who: "Minden résztvevő",
    when: "Amikor a szervező vagy kijelölt vezérlő élő követést indított.",
    result: "A közös nézet automatikusan ugyanarra a nyilvános tartalomra vált. Saját olvasáshoz szüneteltethető, majd a Vissza az előadóhoz gombbal folytatható.",
    steps: [
      "Figyeld a felső piros megosztási címkén az aktuális módot.",
      "Saját olvasáshoz kattints a Saját olvasás gombra.",
      "Az élő nézet folytatásához kattints a Vissza az előadóhoz gombra.",
    ],
  },
  {
    id: "participant-control-code",
    title: "Közös nézet vezérlőkód aktiválása",
    short: "Hatjegyű kóddal átvehető a megosztott nyilvános nézet navigációja.",
    icon: UserRoundCheck,
    who: "A szervező vagy szerkesztő által kijelölt személy",
    when: "Amikor a közös nézet vezetését ideiglenesen másik résztvevő kapja meg.",
    result: "A jogosultság csak a közös nézet navigációjára vonatkozik; jegyzőkönyv-szerkesztési és adminjogot nem ad.",
    steps: [
      "Nyisd meg az alsó vezérlőkód gombot.",
      "Add meg a nevedet, szükség esetén az e-mail-címedet és a hatjegyű kódot.",
      "Kattints a Vezérlés aktiválása gombra.",
      "Az Élő követés bekapcsolása után a közös nézet a te navigációdat követi.",
    ],
  },
  {
    id: "participant-stage",
    title: "DIMPRO felület megosztása a Teamsben",
    short: "A közös értekezleti felület megjelenítése a Teams nagy munkaterületén.",
    icon: Share2,
    who: "A Teams által engedélyezett szervező vagy előadó",
    when: "Amikor minden résztvevőnek ugyanazt a DIMPRO tartalmat kell látnia.",
    result: "A DIMPRO Értekezleti Kísérő megjelenik a Teams közös nagy felületén.",
    steps: [
      "Kattints a jobb alsó négyzetes megosztásgombra.",
      "A Teams megnyitja a közös nagy nézetet.",
      "A jobb oldali panel továbbra is használható vezérlésre.",
    ],
  },
];

const EDITOR_ITEMS: GuideItem[] = [
  {
    id: "editor-approve",
    title: "Résztvevői feltöltés jóváhagyása",
    short: "A beérkező kép vagy fájl ellenőrzése és közös megosztása.",
    icon: UserRoundCheck,
    who: "Szervező",
    when: "Amikor egy résztvevő új mellékletet küldött.",
    result: "A Jóváhagyás és megosztás után a melléklet minden résztvevőnél megjelenik.",
    steps: [
      "Nyisd meg a Képek és mellékletek fejezetet.",
      "Nyisd le az „A szervező megkapta” állapotú kártyát.",
      "Adj címet és képaláírást.",
      "Kattints a Jóváhagyás és megosztás gombra.",
    ],
  },
  {
    id: "editor-attachment",
    title: "Mellékletszerkesztő megnyitása",
    short: "Kép, PDF-oldal vagy képernyőrészlet jelölése.",
    icon: Pencil,
    who: "Megtekintés: mindenki · rajzolás: csak szervező",
    when: "Amikor nyilat, alakzatot, sorszámot vagy szöveget kell a képre tenni.",
    result: "Az eredeti fájl megmarad, a szerkesztett változat külön mellékletként mentődik.",
    steps: [
      "Nyisd le a mellékletkártyát.",
      "Kattints a Megnyitás és rajzolás gombra.",
      "Válassz eszközt, színt és vonalvastagságot.",
      "Mentsd a szerkesztett képet az asszisztensbe.",
    ],
  },
  {
    id: "editor-capture",
    title: "Képernyő vagy alkalmazásablak rögzítése",
    short: "Megosztott terv, alkalmazás vagy képernyő pillanatképének elkészítése.",
    icon: MonitorUp,
    who: "Szervező",
    when: "Amikor egy Teamsben bemutatott tartalmat képként kell az értekezlethez menteni.",
    result: "Nagy Teams-ablak nyílik, ott választható ki a képernyő vagy alkalmazásablak, majd a kép megvágható és jelölhető.",
    steps: [
      "Kattints a Képernyő vagy alkalmazásablak rögzítése gombra.",
      "A nagy ablakban kattints a rögzítés indítására.",
      "Válaszd ki a képernyőt vagy alkalmazásablakot.",
      "Használd a Képmetsző és jelölő eszközöket, majd ments.",
    ],
  },
  {
    id: "editor-agenda",
    title: "Napirend és jegyzőkönyvi tartalom",
    short: "Témakörök, döntések, nyitott kérdések és felelősök rögzítése.",
    icon: ClipboardList,
    who: "Szervező vagy jegyzőkönyv-szerkesztő",
    when: "Az értekezlet előkészítésekor és vezetése közben.",
    result: "A témák rendezett formában kerülnek a folyamatos emlékeztetőbe és a későbbi exportba.",
    steps: [
      "Nyisd meg a Napirend és jegyzőkönyvi tartalom fejezetet.",
      "Adj hozzá vagy nyiss meg egy napirendi pontot.",
      "Rögzítsd az előzményt, egyeztetést, döntést és nyitott kérdést.",
    ],
  },
  {
    id: "editor-access",
    title: "Jegyzőkönyv-szerkesztés átadása",
    short: "Ideiglenes szerkesztő meghívása párosítókóddal.",
    icon: Users,
    who: "Szervező",
    when: "Amikor más személy vezeti vagy egészíti ki a jegyzőkönyvet.",
    result: "A meghívott korlátozott szerkesztői hozzáférést kap, a szervezői privát adatok nélkül.",
    steps: [
      "Kattints a felső ceruza ikonra.",
      "Hozz létre egyszer használatos szerkesztői kódot.",
      "Add át a kódot a kijelölt szerkesztőnek.",
      "Szükség esetén vond vissza a hozzáférést.",
    ],
  },
  {
    id: "editor-ai",
    title: "AI dokumentumtervezet készítése",
    short: "Átiratból, döntésekből és jóváhagyott mellékletekből szerkeszthető tervezet készítése.",
    icon: Bot,
    who: "Szervező",
    when: "Az értekezlet közben gyors kivonathoz vagy utána teljes emlékeztető készítéséhez.",
    result: "Az AI csak tervezetet készít; az eredmény emberi ellenőrzés után emelhető át a dokumentumba.",
    steps: [
      "Kattints a felső AI gombra.",
      "Válassz műveletet és ellenőrizd a becsült költséget.",
      "Indítsd el a feldolgozást.",
      "Emeld át, szerkeszd vagy vesd el az eredményt.",
    ],
  },
  {
    id: "editor-text-entries",
    title: "Szöveges bejegyzések moderálása",
    short: "A gyorsrögzítőből érkező bejegyzések jóváhagyása, napirendhez rendelése és dokumentumba emelése.",
    icon: MessageSquareText,
    who: "Szervező vagy jegyzőkönyv-szerkesztő",
    when: "Amikor a résztvevők szöveges észrevételeket küldtek.",
    result: "A bepipált és jóváhagyott bejegyzések bekerülnek az élő dokumentumba és az exportba; a kizárt bejegyzések az auditnaplóban megmaradnak.",
    steps: [
      "Nyisd meg a Szöveges bejegyzések modult.",
      "Ellenőrizd a nevet, a szöveget és az opcionális napirendi kapcsolatot.",
      "A pipával szabályozd, bekerüljön-e a dokumentumba.",
      "Jóváhagyáshoz használd a zöld gombot, kizáráshoz az X-et.",
    ],
  },
  {
    id: "editor-teams-attendance",
    title: "Teams meghívottak és jelenléti jelentés",
    short: "A meghívottak előzetes, majd a tényleges részvétel utólagos beolvasása.",
    icon: Users,
    who: "Szervező",
    when: "Értekezlet előtt a meghívottakhoz, befejezés után a tényleges be- és kilépési adatokhoz.",
    result: "A jelenléti lista forrásjelöléssel, szerepkörrel, jelenléti idővel és csatlakozási intervallumokkal frissül.",
    steps: [
      "A Jelenlévők modulban add meg a Graph-kapcsolati azonosítókat.",
      "Értekezlet előtt kattints a Teams meghívottak betöltése gombra.",
      "Befejezés után kattints a Tényleges jelenlét frissítése gombra.",
      "Ellenőrizd és szükség esetén kézzel javítsd az adatokat.",
    ],
  },
  {
    id: "editor-transcript-import",
    title: "Teams-átirat importálása",
    short: "Automatikus Graph-import vagy kézi VTT, DOCX, TXT és beillesztett szöveg feldolgozása.",
    icon: FileText,
    who: "Szervező",
    when: "Az értekezlet után, amikor az átirat elérhetővé vált.",
    result: "A beszélők és időbélyegek az értekezlet átiratába kerülnek, majd használhatók az AI Dokumentumműhelyben.",
    steps: [
      "Automatikus importhoz mentsd a Graph-azonosítókat és kapcsold be az átiratfigyelést.",
      "Kézi importhoz nyisd meg a Teams-átirat kézi importálása kártyát.",
      "Válassz VTT, DOCX vagy TXT fájlt, illetve illeszd be a szöveget.",
      "Válaszd a kiegészítést vagy teljes cserét, majd indítsd az importot.",
    ],
  },
  {
    id: "editor-safe-close",
    title: "Munkamenet biztonságos bezárása",
    short: "Minden DIMPRO-adat mentése, vezérlés elengedése és megosztásleállítás az értekezlet formális lezárása nélkül.",
    icon: CheckCircle2,
    who: "Szervező vagy jegyzőkönyv-szerkesztő",
    when: "Mielőtt kilépsz a Teams-panelből, de az értekezleti dokumentum még nem feltétlenül végleges.",
    result: "A rendszer visszajelzi, hogy minden mentve, és a Teams-panel biztonságosan bezárható. Az átiratfigyelés opcionálisan tovább működik.",
    steps: [
      "Kattints az alsó piros bezárás gombra.",
      "Ellenőrizd a mentési és átiratállapotot.",
      "Szükség esetén kapcsold be az automatikus átiratfigyelést.",
      "Kattints a Minden mentése és munkamenet bezárása gombra.",
    ],
  },
  {
    id: "editor-close",
    title: "Értekezlet lezárása és archiválása",
    short: "Piszkozat, jóváhagyási vagy végleges közzétételi állapot kezelése.",
    icon: FileText,
    who: "Szervező",
    when: "Az értekezlet végén, az összefoglaló ellenőrzése után.",
    result: "Verziózott pillanatkép készül, és a dokumentum exportálható vagy archiválható.",
    steps: [
      "Ellenőrizd a napirendet, döntéseket, feladatokat és mellékleteket.",
      "Nyisd meg az Értekezlet lezárása és archiválása fejezetet.",
      "Válaszd a piszkozat, jóváhagyás, közzététel vagy archiválás műveletet.",
    ],
  },
];

function GuideCard({ item, open, onToggle }: { item: GuideItem; open: boolean; onToggle: () => void }) {
  const Icon = item.icon;
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-4 p-4 text-left hover:bg-slate-50 sm:p-5" aria-expanded={open}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800"><Icon size={22} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black text-slate-950 sm:text-lg">{item.title}</span>
          <span className="mt-1 block text-sm leading-6 text-slate-600">{item.short}</span>
        </span>
        {open ? <ChevronUp size={22} className="mt-1 shrink-0 text-slate-400" /> : <ChevronDown size={22} className="mt-1 shrink-0 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-black uppercase tracking-[0.12em] text-teal-700">Ki használhatja?</div><p className="mt-2 text-sm leading-6 text-slate-700">{item.who}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-black uppercase tracking-[0.12em] text-indigo-700">Mikor használd?</div><p className="mt-2 text-sm leading-6 text-slate-700">{item.when}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Mi történik utána?</div><p className="mt-2 text-sm leading-6 text-slate-700">{item.result}</p></div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-900">Használati lépések</div>
            <ol className="mt-3 space-y-2">
              {item.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span><span>{step}</span></li>)}
            </ol>
          </div>
        </div>
      )}
    </article>
  );
}

export default function MeetingHelpModal({ meetingId, role, onClose }: { meetingId: string; role: MeetingViewRole; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>(role === "participant" ? "participant" : "editor");
  const [openItem, setOpenItem] = useState("");
  const shortMeetingId = meetingId.slice(0, 32);
  const infoSubject = `DIMPRO Értekezleti Kísérő – használati kérdés vagy funkciójavaslat – ${shortMeetingId}`;
  const adminSubject = `DIMPRO Értekezleti Kísérő – technikai hiba, jogosultság vagy párosítás – ${shortMeetingId}`;
  const items = useMemo(() => tab === "participant" ? PARTICIPANT_ITEMS : EDITOR_ITEMS, [tab]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label="DIMPRO Értekezleti Kísérő útmutató">
      <div className="flex h-[min(92vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#f7f9fc] shadow-2xl">
        <header className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800"><Info size={25} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-950 sm:text-2xl">DIMPRO Értekezleti Kísérő – útmutató és információ</h2><p className="mt-1 text-sm text-slate-600">Gombonkénti, lépésről lépésre használható segítség.</p></div>
          <button type="button" onClick={onClose} title="Bezárás" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><X size={21} /></button>
        </header>

        <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-slate-200 bg-white px-2 py-2 sm:px-6">
          {([
            ["participant", "Felhasználói útmutató", Users],
            ["editor", "Szerkesztői útmutató", Pencil],
            ["contact", "Kapcsolat és információ", Mail],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => { setTab(key); setOpenItem(""); }} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-black transition sm:text-base ${tab === key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}><Icon size={18} /><span>{label}</span></button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
          {tab !== "contact" ? (
            <div className="space-y-3">
              <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950 sm:text-base">
                <div className="flex items-start gap-3"><CircleHelp size={22} className="mt-0.5 shrink-0" /><p>Kattints egy funkció gombkártyájára. A lenyíló részben látható, hogy <b>ki használhatja</b>, <b>mikor érdemes használni</b>, <b>mi történik utána</b>, és milyen lépésekből áll a művelet.</p></div>
              </div>
              {items.map((item) => <GuideCard key={item.id} item={item} open={openItem === item.id} onToggle={() => setOpenItem((current) => current === item.id ? "" : item.id)} />)}
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <h3 className="text-xl font-black text-slate-950">Kapcsolat</h3>
                <p className="mt-2 text-base leading-7 text-slate-600">Az alábbi gombok megnyitják az alapértelmezett levelezőprogramot. A tárgymező automatikusan tartalmazza a DIMPRO Értekezleti Kísérő nevét és az értekezlet rövid azonosítóját.</p>
              </section>

              <a href={`mailto:info@dimpro.hu?subject=${encodeURIComponent(infoSubject)}`} className="flex items-start gap-4 rounded-2xl border border-teal-200 bg-white p-5 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 sm:p-7">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-800"><Mail size={23} /></span>
                <span className="min-w-0"><span className="block text-lg font-black text-slate-950 sm:text-xl">info@dimpro.hu</span><span className="mt-2 block text-base leading-7 text-slate-600">Használati kérdés, funkciójavaslat, általános tájékoztatás vagy a felület működésével kapcsolatos észrevétel.</span><span className="mt-3 block rounded-xl bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900">Automatikus tárgy: {infoSubject}</span></span>
              </a>

              <a href={`mailto:admin@dimpro.hu?subject=${encodeURIComponent(adminSubject)}`} className="flex items-start gap-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 sm:p-7">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800"><Mail size={23} /></span>
                <span className="min-w-0"><span className="block text-lg font-black text-slate-950 sm:text-xl">admin@dimpro.hu</span><span className="mt-2 block text-base leading-7 text-slate-600">Belépési hiba, jogosultsági probléma, Teams-párosítás, technikai hiba vagy rendszerüzemeltetési kérdés.</span><span className="mt-3 block rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900">Automatikus tárgy: {adminSubject}</span></span>
              </a>

              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6"><div className="flex items-start gap-3"><Info size={22} className="mt-0.5 shrink-0 text-amber-800" /><div><h3 className="text-base font-black text-amber-950">Mit érdemes a levélbe beleírni?</h3><p className="mt-2 text-sm leading-6 text-amber-900">Írd le röviden, melyik gombnál vagy folyamatnál jelentkezett a kérdés vagy hiba. Technikai hibánál csatolj képernyőképet, add meg a hozzávetőleges időpontot és azt, hogy Teamsben vagy a webes felületen történt-e.</p></div></div></section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
