import type { EventMode } from "./types";

type EventHeroProps = {
  eventMode: EventMode;
  intro: string;
  quote: string;
  families: number;
  coming: number;
  people: number;
  allergyCount: number;
  mamaPeople: number;
  apuPeople: number;
  storageStatus?: string;
  onEventModeChange: (mode: EventMode) => void;
};

export default function EventHero({
  eventMode,
  intro,
  quote,
  families,
  coming,
  people,
  allergyCount,
  mamaPeople,
  apuPeople,
  storageStatus,
  onEventModeChange,
}: EventHeroProps) {
  const title = "Közös családi ünneplés\nMama 85. és Apu 65.";
  const subtitle = "Egy közös, nyár végi családi kerti party szervezése.";

  return (
    <header className="border-b border-rose-100 bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-500">esemeny.dimpro.hu/torta</p>
          {storageStatus && <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{storageStatus}</span>}
        </div>

        <section className="mt-6 overflow-hidden rounded-[2.25rem] border border-white/80 bg-white/90 p-5 text-center shadow-xl shadow-rose-100/70 sm:p-7 lg:p-8">
          <div className="mx-auto inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 shadow-sm">
            Szervező: Bénike
          </div>

          <h1 className="mx-auto mt-6 max-w-5xl whitespace-pre-line text-3xl font-black leading-tight text-slate-800 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 text-base font-bold text-slate-600 sm:text-lg">{subtitle}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <PhotoCard title="Mama" subtitle="85. születésnap" imageSrc="/events/torta/mama.JPG" tone="rose" />
            <PhotoCard title="Apu" subtitle="65. születésnap" imageSrc="/events/torta/apu.JPG" tone="sky" />
          </div>

          <p className="mx-auto mt-6 max-w-4xl whitespace-pre-line text-center text-base leading-8 text-slate-700">
            {intro}
          </p>

          <div className="mx-auto mt-6 max-w-4xl rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center text-base font-bold leading-7 text-amber-700">
            „{quote}”
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Stat label="Család" value={families} />
            <Stat label="Jön" value={coming} />
            <Stat label="Várható fő" value={people} />
            <Stat label="Ételérzékenység" value={allergyCount} />
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-rose-100 bg-white/90 p-5 text-center shadow-md shadow-rose-100/50">
          <p className="text-sm font-semibold text-slate-600">Esemény szervezési módja</p>
          <div className="mx-auto mt-3 max-w-4xl rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm leading-7 text-slate-700">
            Az oldal jelenleg úgy indul, hogy Mama 85. és Apu 65. születésnapját egy közös családi alkalomként szervezzük. A szavazásokban viszont mindenki jelezheti, ha inkább két külön eseményt tartana jobb megoldásnak. Ha a válaszok alapján a többség a külön ünneplés mellett dönt, a szervező új, külön eseményoldalt fog létrehozni, és arra új meghívást küld. Így a mostani válaszok segítenek a döntés előkészítésében, de nem zárják le véglegesen a szervezést.
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <button
              onClick={() => onEventModeChange("together")}
              className={`rounded-2xl px-4 py-3 text-center font-bold transition ${eventMode === "together" ? "bg-rose-400 text-white shadow-md" : "bg-rose-50 text-slate-700 hover:bg-rose-100"}`}
            >
              Együtt legyen megtartva
            </button>
            <button
              onClick={() => onEventModeChange("separate")}
              className={`rounded-2xl px-4 py-3 text-center font-bold transition ${eventMode === "separate" ? "bg-sky-400 text-white shadow-md" : "bg-sky-50 text-slate-700 hover:bg-sky-100"}`}
            >
              Két különböző esemény legyen
            </button>
          </div>
        </section>

        {eventMode === "separate" && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <EventCard title="1. esemény – Mama 85." text="Mama születésnapja: július 20. Külön időpont, helyszín és részvétel is kezelhető." people={mamaPeople} tone="rose" />
            <EventCard title="2. esemény – Apu 65." text="Apu születésnapja: augusztus 19. Külön időpont, helyszín és részvétel is kezelhető." people={apuPeople} tone="sky" />
          </div>
        )}
      </div>
    </header>
  );
}

function PhotoCard({ title, subtitle, imageSrc, tone }: { title: string; subtitle: string; imageSrc: string; tone: "rose" | "sky" }) {
  const classes = tone === "rose" ? "border-rose-200 bg-rose-50" : "border-sky-200 bg-sky-50";
  const badgeClasses = tone === "rose" ? "bg-rose-500 text-white" : "bg-sky-500 text-white";

  return (
    <figure className={`overflow-hidden rounded-3xl border ${classes} text-left shadow-md`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-white">
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white via-amber-50 to-rose-50 p-6 text-center text-sm font-bold text-slate-500">
          {title} fotó feltöltésre vár
        </div>
        <img
          src={imageSrc}
          alt={`${title} családi esemény fotó`}
          className="relative h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      </div>
      <figcaption className="flex items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">{title}</h2>
          <p className="text-sm font-semibold text-slate-500">{subtitle}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${badgeClasses}`}>fotó</span>
      </figcaption>
    </figure>
  );
}

function EventCard({ title, text, people, tone }: { title: string; text: string; people: number; tone: "rose" | "sky" }) {
  const classes = tone === "rose" ? "border-rose-200 bg-rose-50" : "border-sky-200 bg-sky-50";
  return (
    <div className={`rounded-3xl border p-5 text-center shadow-sm ${classes}`}>
      <h2 className="text-lg font-black text-slate-800">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
      <p className="mt-4 text-sm font-bold text-slate-700">Jelzett létszám: {people} fő</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-rose-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-800">{value}</p>
    </div>
  );
}