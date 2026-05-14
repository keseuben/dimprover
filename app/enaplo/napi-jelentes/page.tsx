"use client";

import React, { useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImagePlus,
  Plus,
  Save,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";

const professions = [
  "Ács",
  "Adminisztratív",
  "Burkoló",
  "Daru, felvonó és hasonló anyagmozgató gép kezelője",
  "Egyéb",
  "Egyéb építési szakipari foglalkozású",
  "Egyéb építési, szerelési foglalkozású",
  "Egyéb építőmesteri foglalkozású",
  "Egyéb, kivitelezési tevékenységet saját vagy hozzátartozó részére végző személy",
  "Egyéb, máshova nem sorolható, helyhez kötött gép kezelője",
  "Egyéb, máshova nem sorolható ipari és építőipari foglalkozású",
  "Építményszerkezet-szerelő",
  "Épületasztalos",
  "Épület-, építménybádogos",
  "Épületvillamossági szerelő, villanyszerelő",
  "Felvonószerelő",
  "Festő és mázoló",
  "Gipszkartonozó, stukkózó",
  "Kályha- és kandallóépítő",
  "Kéményseprő, épületszerkezet-tisztító",
  "Kisegítő",
  "Kőműves",
  "Személygépkocsi-vezető",
  "Szigetelő",
  "Targoncavezető",
  "Tehergépkocsi-vezető, kamionsofőr",
  "Tetőfedő",
  "Üvegező",
  "Vezeték- és csőhálózat-szerelő (víz, gáz, fűtés)",
];

const windStrengths = ["Szélcsend", "Gyenge", "Mérsékelt", "Élénk", "Erős", "Viharos"];
const windDirections = ["É", "ÉK", "K", "DK", "D", "DNY", "NY", "ÉNY", "Változó"];
const skyOptions = ["Derült", "Gyengén felhős", "Közepesen felhős", "Borult", "Ködös"];
const rainOptions = ["Nincs", "Szemerkélő eső", "Eső", "Zápor", "Hó", "Havas eső"];

type WorkforceRow = {
  id: number;
  profession: string;
  count: string;
  contractor: string;
  note: string;
};

type EntryRow = {
  id: number;
  time: string;
  type: string;
  role: string;
  text: string;
};

export default function ENaploPage() {
  const [date, setDate] = useState("2026-05-14");

  const [weather, setWeather] = useState({
    morningTemp: "",
    afternoonTemp: "",
    windStrength: "",
    windDirection: "",
    sky: "",
    rain: "",
    other: "",
  });

  const [workHappened, setWorkHappened] = useState("igen");
  const [workSummary, setWorkSummary] = useState("");
  const [obstruction, setObstruction] = useState("nem");
  const [obstructionText, setObstructionText] = useState("");

  const [shift, setShift] = useState({
    name: "Nappali műszak",
    start: "08:00",
    end: "17:00",
  });

  const [professionSearch, setProfessionSearch] = useState("");
  const [workforce, setWorkforce] = useState<WorkforceRow[]>([
    { id: 1, profession: "", count: "", contractor: "", note: "" },
  ]);

  const [entries, setEntries] = useState<EntryRow[]>([
    {
      id: 1,
      time: "13:39",
      type: "Napi jelentés",
      role: "Felelős műszaki vezető",
      text: "",
    },
  ]);

  const filteredProfessions = useMemo(() => {
    return professions.filter((item) =>
      item.toLowerCase().includes(professionSearch.toLowerCase())
    );
  }, [professionSearch]);

  const totalWorkers = workforce.reduce((sum, row) => sum + Number(row.count || 0), 0);

  const generatedText = useMemo(() => {
    const workforceText = workforce
      .filter((row) => row.profession || row.count)
      .map((row) => `${row.profession || "meg nem nevezett szakma"}: ${row.count || 0} fő`)
      .join(", ");

    const entryText = entries
      .filter((entry) => entry.text.trim())
      .map((entry) => `${entry.time} - ${entry.text}`)
      .join("\n");

    return [
      `A napi jelentés dátuma: ${date}.`,
      `Munkavégzés történt: ${workHappened === "igen" ? "igen" : "nem"}.`,
      `Műszak: ${shift.name}, ${shift.start} - ${shift.end}.`,
      `Napi létszám összesen: ${totalWorkers} fő.`,
      workforceText ? `Szakmánkénti létszám: ${workforceText}.` : "",
      `Meteorológiai adatok: délelőtt ${weather.morningTemp || "-"} °C, délután ${
        weather.afternoonTemp || "-"
      } °C, szélerő: ${weather.windStrength || "-"}, szélirány: ${
        weather.windDirection || "-"
      }, égkép: ${weather.sky || "-"}, csapadék: ${weather.rain || "-"}.`,
      weather.other ? `Egyéb időjárás: ${weather.other}.` : "",
      workSummary ? `Munkavégzés összefoglalása: ${workSummary}.` : "",
      obstruction === "igen" ? `Akadályoztatás: ${obstructionText || "-"}.` : "",
      entryText ? `Bejegyzések:\n${entryText}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [
    date,
    workHappened,
    shift,
    totalWorkers,
    workforce,
    weather,
    workSummary,
    obstruction,
    obstructionText,
    entries,
  ]);

  function updateWorkforce(id: number, key: keyof WorkforceRow, value: string) {
    setWorkforce((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [key]: value } : row))
    );
  }

  function addWorkforceRow() {
    setWorkforce((prev) => [
      ...prev,
      { id: Date.now(), profession: "", count: "", contractor: "", note: "" },
    ]);
  }

  function removeWorkforceRow(id: number) {
    setWorkforce((prev) => prev.filter((row) => row.id !== id));
  }

  function updateEntry(id: number, key: keyof EntryRow, value: string) {
    setEntries((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [key]: value } : row))
    );
  }

  function addEntry() {
    setEntries((prev) => [
      ...prev,
      { id: Date.now(), time: "08:00", type: "Napi jelentés", role: "", text: "" },
    ]);
  }

  function exportTxt() {
    const blob = new Blob([generatedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `epitesi-naplo-napi-jelentes-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPdf() {
    window.print();
  }

  return (
    <AppLayout>
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Építési napló rögzítő</h1>

              <div className="mt-2 space-y-2">
                <p className="text-sm text-slate-500">
                  Napi jelentés, meteorológiai adatok, műszakok, létszám,
                  bejegyzések és export kezelése építési projektekhez.
                </p>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <strong>Fontos:</strong> Ez a modul nem helyettesíti a kötelező
                  állami e-építési naplót. A felület segéd napi rögzítésre,
                  előkészítésre, belső dokumentálásra és export készítésre szolgál.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className="rounded-lg border px-3 py-2">
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <CalendarDays size={18} />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="outline-none"
                />
              </div>
              <button className="rounded-lg border px-3 py-2">
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
              >
                Mai nap
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">Meteorológiai adatok</h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Hőmérséklet délelőtt">
              <input
                className="input"
                value={weather.morningTemp}
                onChange={(e) => setWeather({ ...weather, morningTemp: e.target.value })}
                placeholder="°C"
              />
            </Field>

            <Field label="Hőmérséklet délután">
              <input
                className="input"
                value={weather.afternoonTemp}
                onChange={(e) => setWeather({ ...weather, afternoonTemp: e.target.value })}
                placeholder="°C"
              />
            </Field>

            <Field label="Szélerő">
              <Select
                value={weather.windStrength}
                onChange={(v) => setWeather({ ...weather, windStrength: v })}
                items={windStrengths}
              />
            </Field>

            <Field label="Szélirány">
              <Select
                value={weather.windDirection}
                onChange={(v) => setWeather({ ...weather, windDirection: v })}
                items={windDirections}
              />
            </Field>

            <Field label="Égkép">
              <Select
                value={weather.sky}
                onChange={(v) => setWeather({ ...weather, sky: v })}
                items={skyOptions}
              />
            </Field>

            <Field label="Csapadék">
              <Select
                value={weather.rain}
                onChange={(v) => setWeather({ ...weather, rain: v })}
                items={rainOptions}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Egyéb időjárás">
              <textarea
                className="input min-h-24"
                maxLength={250}
                value={weather.other}
                onChange={(e) => setWeather({ ...weather, other: e.target.value })}
                placeholder="Egyéb időjárási információ"
              />
            </Field>
            <div className="text-right text-sm text-slate-500">
              {weather.other.length} / 250
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">Munkavégzésre vonatkozó adatok</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Munkavégzés történt">
              <select
                className="input"
                value={workHappened}
                onChange={(e) => setWorkHappened(e.target.value)}
              >
                <option value="igen">Igen</option>
                <option value="nem">Nem</option>
              </select>
            </Field>

            <Field label="Akadályoztatás történt">
              <select
                className="input"
                value={obstruction}
                onChange={(e) => setObstruction(e.target.value)}
              >
                <option value="nem">Nem</option>
                <option value="igen">Igen</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Munkavégzés összefoglalása">
              <textarea
                className="input min-h-28"
                value={workSummary}
                onChange={(e) => setWorkSummary(e.target.value)}
              />
            </Field>

            <Field label="Akadályoztatás leírása">
              <textarea
                className="input min-h-28"
                value={obstructionText}
                onChange={(e) => setObstructionText(e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">Műszak adatok</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Műszak megnevezése">
              <input
                className="input"
                value={shift.name}
                onChange={(e) => setShift({ ...shift, name: e.target.value })}
              />
            </Field>

            <Field label="Kezdés">
              <input
                type="time"
                className="input"
                value={shift.start}
                onChange={(e) => setShift({ ...shift, start: e.target.value })}
              />
            </Field>

            <Field label="Zárás">
              <input
                type="time"
                className="input"
                value={shift.end}
                onChange={(e) => setShift({ ...shift, end: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Napi létszám adatok</h2>
              <p className="text-sm text-slate-500">Összes létszám: {totalWorkers} fő</p>
            </div>

            <button onClick={addWorkforceRow} className="button-blue">
              <Plus size={18} /> Sor hozzáadása
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-xl border px-3 py-2">
            <Search size={18} className="text-slate-400" />
            <input
              className="w-full outline-none"
              placeholder="Szakma keresése a listában"
              value={professionSearch}
              onChange={(e) => setProfessionSearch(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            {workforce.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-[2fr_100px_1.5fr_1.5fr_44px]"
              >
                <select
                  className="input"
                  value={row.profession}
                  onChange={(e) => updateWorkforce(row.id, "profession", e.target.value)}
                >
                  <option value="">szakma megnevezése</option>
                  {filteredProfessions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="fő"
                  value={row.count}
                  onChange={(e) => updateWorkforce(row.id, "count", e.target.value)}
                />

                <input
                  className="input"
                  placeholder="vállalkozó / alvállalkozó"
                  value={row.contractor}
                  onChange={(e) => updateWorkforce(row.id, "contractor", e.target.value)}
                />

                <input
                  className="input"
                  placeholder="megjegyzés"
                  value={row.note}
                  onChange={(e) => updateWorkforce(row.id, "note", e.target.value)}
                />

                <button
                  onClick={() => removeWorkforceRow(row.id)}
                  className="rounded-lg border bg-white p-2 text-red-600"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Bejegyzések</h2>
            <button onClick={addEntry} className="button-blue">
              <Plus size={18} /> Bejegyzés hozzáadása
            </button>
          </div>

          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    type="time"
                    className="input"
                    value={entry.time}
                    onChange={(e) => updateEntry(entry.id, "time", e.target.value)}
                  />

                  <select
                    className="input"
                    value={entry.type}
                    onChange={(e) => updateEntry(entry.id, "type", e.target.value)}
                  >
                    <option>Napi jelentés</option>
                    <option>Műszaki észrevétel</option>
                    <option>Akadályoztatás</option>
                    <option>Utasítás</option>
                    <option>Ellenőrzés</option>
                    <option>Készültség jelentés</option>
                    <option>Fotódokumentáció</option>
                    <option>Egyéb</option>
                  </select>

                  <input
                    className="input"
                    placeholder="szerep"
                    value={entry.role}
                    onChange={(e) => updateEntry(entry.id, "role", e.target.value)}
                  />
                </div>

                <textarea
                  className="input mt-3 min-h-36"
                  maxLength={5000}
                  placeholder="jelentés szövege"
                  value={entry.text}
                  onChange={(e) => updateEntry(entry.id, "text", e.target.value)}
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="button-outline">
                    <ImagePlus size={18} /> Fotók (.jpg) csatolása
                  </button>
                  <span className="ml-auto text-sm text-slate-500">
                    {entry.text.length} / 5000
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Wand2 size={20} /> Építési napló szöveg generálása
          </h2>

          <textarea className="input min-h-72 font-mono text-sm" readOnly value={generatedText} />

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="button-blue">
              <Save size={18} /> Mentés
            </button>
            <button onClick={exportTxt} className="button-outline">
              <Download size={18} /> Másolható TXT export
            </button>
            <button onClick={printPdf} className="button-outline">
              <FileText size={18} /> PDF / nyomtatás
            </button>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #cbd5e1;
          background: white;
          padding: 0.65rem 0.8rem;
          outline: none;
        }

        .input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .button-blue {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 0.75rem;
          background: #2563eb;
          padding: 0.65rem 1rem;
          font-weight: 700;
          color: white;
        }

        .button-outline {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 0.75rem;
          border: 1px solid #2563eb;
          background: white;
          padding: 0.65rem 1rem;
          font-weight: 700;
          color: #2563eb;
        }

        @media print {
          body {
            background: white !important;
          }

          button,
          input[type="date"] {
            print-color-adjust: exact;
          }
        }
      `}</style>
    </main>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-bold text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: string[];
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Válasszon</option>
      {items.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
}