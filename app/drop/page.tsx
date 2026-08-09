import Link from "next/link";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileStack,
  FolderInput,
  HardDriveUpload,
  KeyRound,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import DropBrand from "@/components/drop/DropBrand";
import DropAnimatedHexLogo from "@/components/drop/DropAnimatedHexLogo";
import { getDropRuntimeHealth } from "@/app/lib/drop/dropRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const hexClip = "polygon(25% 2%,75% 2%,98% 50%,75% 98%,25% 98%,2% 50%)";

type DriveState = "active" | "optional" | "planned";

type WorkflowCardProps = {
  icon: LucideIcon;
  title: string;
  eyebrow: string;
  description: string;
  chooserText: string;
  accessText: string;
  driveText: string;
  driveState: DriveState;
  highlightTitle?: string;
  highlightText?: string;
  limit: string;
  href: string;
  action: string;
  active: boolean;
  tone: "cyan" | "teal" | "blue" | "slate";
};

export default async function DropLandingPage() {
  const health = await getDropRuntimeHealth().catch(() => null);
  const version = health?.version || "DROP 1.0.0";
  const packageDropReady = Boolean(health?.readiness?.packageDrop);
  const gateReady = Boolean(health?.readiness?.submissionGate);
  const sendReady = Boolean(health?.readiness?.dimproSend);
  const spaceReady = Boolean(health?.readiness?.spacesEngine);
  const readyCount = [packageDropReady, gateReady, sendReady, spaceReady].filter(Boolean).length;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef5f7] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <DropBrand compact />
          <div className="flex items-center gap-2">
            <div className="hidden text-right lg:block">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800">Béta tesztüzem · korlátozott hozzáférés</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Tervezett nyilvános indulás · 2027. I. negyedév · {readyCount}/4 munkafolyamat aktív</p>
            </div>
            <Link href="/open" className="rounded-xl border border-cyan-700 bg-cyan-50 px-4 py-2.5 text-sm font-black text-cyan-900">Csomag megnyitása</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(14,116,144,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute -right-24 -top-28 h-96 w-96 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-teal-200/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1500px] gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-[.15em] text-emerald-800"><ShieldCheck size={14}/> Védett fájlátadás és beküldés</div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-[-.04em] text-slate-950 sm:text-5xl lg:text-6xl">Egy Drop rendszer, négy eltérő fájlátadási munkafolyamat.</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">A DIMPRO Drop ugyanazt a HexaUpload, képméretcsökkentő, robotvédelmi, privát tárhely- és ClamAV-motort használja a meghívásos CsomagDropban, a Beküldőkapuban, a DIMPRO Sendben és a tartós Drop Térben.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/send" className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white shadow-[0_18px_45px_rgba(15,23,42,.16)]"><Send size={18}/> DIMPRO Send</Link>
              <Link href="/bekuldes" className="inline-flex items-center gap-2 rounded-2xl border border-teal-300 bg-teal-50 px-5 py-3.5 text-sm font-black text-teal-900"><FolderInput size={18}/> Beküldőkapu</Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-slate-600">
              <span className="inline-flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-600"/> Nincs szabad, csomaghoz nem kötött feltöltés</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-600"/> Privát Object Storage</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-600"/> Vírusellenőrzött letöltés</span>
            </div>
          </div>

          <div className="relative mx-auto flex h-80 w-full max-w-[31rem] flex-col items-center justify-center sm:h-96">
            <div className="absolute left-1/2 top-[44%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200/30 blur-3xl sm:h-80 sm:w-80" />
            <DropAnimatedHexLogo variant="hero" tone="dark" label="DIMPRO HexaUpload animált fájlfeltöltési embléma" />
            <div className="relative -mt-3 text-center">
              <p className="text-xs font-black uppercase tracking-[.22em] text-cyan-800">DIMPRO HexaUpload</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Közös feltöltőmotor</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Drag & drop · Galéria · Kamera · Képoptimalizálás · Képcsoportok · Megjegyzések · Folytatható feltöltés</p>
              <span className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">{version} · {readyCount}/4 workflow aktív</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-700">DIMPRO Drop termékstruktúra</p><h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Válassza ki, hogyan szeretne fájlt átadni</h2></div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">Minden kártyán látható, mikor célszerű használni a modult, kitől kérhető hozzáférés, és hogyan kapcsolódik a DIMPRO Drive-hoz.</p>
        </div>
        <div className="mt-8 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4">
          <WorkflowCard
            icon={FileStack}
            eyebrow="Meghívásos csomagátadás"
            title="DIMPRO CsomagDrop"
            description="Kép-, fájl-, ZIP- és vegyes dokumentumcsomag biztonságos feltöltéssel, megtekintéssel és letöltéssel."
            chooserText="Meghívott résztvevőkkel közösen gyűjtene vagy osztana meg határidős projektanyagokat és dokumentumcsomagokat."
            accessText="A csomag linkjét és az esetleges PIN-kódot a csomag létrehozójától vagy kezelőjétől kérheti. Technikai segítség: admin@dimpro.hu."
            driveText="A jóváhagyott fájlok, képcsoportok és riportok a kapcsolódó projekt DIMPRO Drive-mappájába archiválhatók."
            driveState="active"
            limit="500 MB / fájl"
            href="/open"
            action="Csomag megnyitása"
            active={packageDropReady}
            tone="cyan"
          />
          <WorkflowCard
            icon={FolderInput}
            eyebrow="Előre meghatározott cél"
            title="DIMPRO Beküldőkapu"
            description="Személyes, projekt- vagy szervezeti kapu rögzített címzettel és opcionális célmappával."
            chooserText="Külső személyektől ajánlatot, tervet, hiánypótlást vagy teljesítési dokumentumot szeretne rendezett módon bekérni."
            accessText="A Beküldőkapu linkjét a meghívót küldő projektkapcsolattartótól vagy a kapu gazdájától kérheti. Technikai segítség: admin@dimpro.hu."
            driveText="A beérkezett és jóváhagyott fájlok a kapuhoz rendelt projekt vagy célmappa Beérkező Drop területére továbbíthatók."
            driveState="active"
            limit="250 MB / csomag"
            href="/bekuldes"
            action="Beküldőkapu megnyitása"
            active={gateReady}
            tone="teal"
          />
          <WorkflowCard
            icon={Send}
            eyebrow="Külső fájlküldés"
            title="DIMPRO Send"
            description="Kész fájlok, dokumentumcsomagok és helyszíni fényképek biztonságos, időkorlátos továbbítása."
            chooserText="Kimenő fájlküldést indítana szabadon vagy admin által engedélyezett címzetteknek, opcionális letöltési védelemmel."
            accessText="Külön DIMPRO Send küldési jogosultság szükséges. A személyhez és licenchez kötött kódot a licencgazdától vagy a DIMPRO-adminisztrátortól kérheti: admin@dimpro.hu."
            driveText="A projektkapcsolat előkészítés alatt áll. Érvényes projekt kiválasztása vagy projektkód esetén a küldemény később a projekt Beérkező Drop területére kerülhet."
            driveState="planned"
            highlightTitle="Gyors KépSend"
            highlightText="Sok helyszíni kép csökkentett fájlmérettel küldhető, képcsoportokba rendezve és képenkénti megjegyzésekkel."
            limit="250 MB / csomag"
            href="/send"
            action="Fájl küldése"
            active={sendReady}
            tone="blue"
          />
          <WorkflowCard
            icon={UsersRound}
            eyebrow="Tartós együttműködés"
            title="DIMPRO Drop Tér"
            description="Nem egyszeri fájlküldéshez, hanem folyamatos közös munkához kialakított állandó megosztási tér."
            chooserText="Ugyanazzal a csapattal, céggel vagy projekt résztvevőivel rendszeresen cserélnek fájlokat, csomagokat és megjegyzéseket."
            accessText="Tértagság és meghívás szükséges. A hozzáférést a Drop Tér gazdájától, a szervezet adminisztrátorától vagy a projekt kapcsolattartójától kérheti. Technikai segítség: admin@dimpro.hu."
            driveText="A jóváhagyott közös csomagok és fájlok képcsoportok szerint átadhatók és tartósan archiválhatók a kapcsolódó projekt DIMPRO Drive-mappájában."
            driveState="active"
            limit="Tér- és licenckeret"
            href="/open"
            action="Kapott hozzáférés megnyitása"
            active={spaceReady}
            tone="slate"
          />
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white"><div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-3">
        <InfoCard icon={KeyRound} title="Célzott hozzáférés" text="A DIMPRO Send személyhez és licenchez kötött küldési jogosultságot, a Beküldőkapu egyedi kapulinket, a CsomagDrop pedig PIN-t vagy titkos capability-linket használ."/>
        <InfoCard icon={ShieldCheck} title="Rétegezett védelem" text="Human Timing Gate, egyszer használható intent, honeypot, Nginx rate limit, csomagkvóta, karantén és ClamAV működik együtt."/>
        <InfoCard icon={Archive} title="Szabályozott megőrzés" text="A Send és Beküldőkapu időkorlátos tárolást, a CsomagDrop és a Drop Tér projektalapú riport- és Drive-archiválást támogat."/>
      </div></section>

      <footer className="bg-slate-950 px-5 py-6 text-slate-300 sm:px-8"><div className="mx-auto flex max-w-[1500px] flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-bold">DIMPRO Drop · {version} · béta tesztüzem</span><span>Tervezett nyilvános indulás: <strong className="text-emerald-300">2027. I. negyedév</strong></span></div></footer>
    </main>
  );
}

function WorkflowCard({
  icon: Icon,
  title,
  eyebrow,
  description,
  chooserText,
  accessText,
  driveText,
  driveState,
  highlightTitle,
  highlightText,
  limit,
  href,
  action,
  active,
  tone,
}: WorkflowCardProps) {
  const tones = {
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
    teal: "border-teal-200 bg-teal-50 text-teal-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
  }[tone];
  const driveMeta = {
    active: { label: "DIMPRO Drive-kapcsolat aktív", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    optional: { label: "Opcionális DIMPRO Drive-mentés", className: "border-cyan-200 bg-cyan-50 text-cyan-800" },
    planned: { label: "DIMPRO Drive · előkészítés alatt", className: "border-amber-200 bg-amber-50 text-amber-900" },
  }[driveState];

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
      <div className="flex items-start justify-between gap-4">
        <span className={`grid h-16 w-16 place-items-center ${tones}`} style={{ clipPath: hexClip }}><Icon size={25}/></span>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em] ${active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{active ? "Aktív" : "Ellenőrzés"}</span>
      </div>
      <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-slate-500">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-[15px] font-normal leading-6 text-slate-600">{description}</p>

      <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-100/90 p-4">
        <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-700">Mikor ezt válassza?</p><p className="mt-1.5 text-sm font-normal leading-6 text-slate-700">{chooserText}</p></div>
        {highlightTitle && highlightText ? <div className="rounded-xl border border-teal-200 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-[.1em] text-teal-800">{highlightTitle}</p><p className="mt-1 text-sm font-normal leading-6 text-slate-700">{highlightText}</p></div> : null}
        <div className="border-t border-slate-200 pt-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-700">Hozzáférés</p><p className="mt-1.5 text-sm font-normal leading-6 text-slate-700">{accessText}</p></div>
        <div className="border-t border-slate-200 pt-3"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.08em] ${driveMeta.className}`}><HardDriveUpload size={12}/>{driveMeta.label}</span><p className="mt-2 text-sm font-normal leading-6 text-slate-700">{driveText}</p></div>
      </div>

      <div className="mt-auto pt-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{limit}</div>
        <Link href={href} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">{action}<ExternalLink size={15}/></Link>
      </div>
    </article>
  );
}

function InfoCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <article className="rounded-[1.75rem] border border-slate-200 bg-[#f8fbfd] p-6"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-200 bg-white text-cyan-800"><Icon size={22}/></span><h3 className="mt-5 text-xl font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>;
}
