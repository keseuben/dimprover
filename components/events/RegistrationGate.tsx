"use client";

import type { EventPerson, EventPersonDraft } from "./types";

type RegistrationGateProps = {
  registrations: EventPerson[];
  draft: EventPersonDraft;
  loginPins: Record<number, string>;
  error: string;
  onDraftChange: (draft: EventPersonDraft) => void;
  onPinChange: (personId: number, pin: string) => void;
  onRegister: () => void;
  onLogin: (person: EventPerson) => void;
};

function displayPerson(person: EventPerson) {
  return `${person.fullName}${person.nickname ? ` (${person.nickname})` : ""}`;
}

function groupedPeople(registrations: EventPerson[]) {
  return registrations.reduce<Record<string, EventPerson[]>>((groups, person) => {
    const groupName = person.groupName || "Csoport nélkül";
    groups[groupName] = [...(groups[groupName] ?? []), person];
    return groups;
  }, {});
}

function uniqueGroups(registrations: EventPerson[]) {
  return Array.from(new Set(registrations.map((person) => person.groupName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "hu-HU"));
}

export default function RegistrationGate({ registrations, draft, loginPins, error, onDraftChange, onPinChange, onRegister, onLogin }: RegistrationGateProps) {
  const groups = groupedPeople(registrations);
  const groupNames = uniqueGroups(registrations);

  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 px-4 py-8 text-slate-800 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="rounded-[32px] border border-white/80 bg-white/90 p-5 text-center shadow-xl shadow-rose-100 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-500">2. lépés</p>
          <h1 className="mt-3 text-3xl font-black text-slate-800 sm:text-5xl">Regisztráció vagy belépés</h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Először nézd meg, hogy szerepelsz-e már a regisztrált névsorban. Ha igen, csak írd be a saját 4 számjegyű PIN-kódodat. Ha még nem szerepelsz, töltsd ki az adatlapot, és válaszd ki, melyik családhoz/csoporthoz tartozol.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[28px] border border-rose-100 bg-white/95 p-5 shadow-md shadow-rose-100/70">
            <h2 className="text-2xl font-black text-slate-800">Új regisztráció</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">A lista alapján be tudod sorolni magad egy meglévő család/csapat/csoport alá, vagy létrehozhatsz új csoportot.</p>

            {groupNames.length > 0 && (
              <div className="mt-5 rounded-3xl border border-sky-100 bg-sky-50/70 p-4">
                <label className="block text-sm font-semibold text-slate-700">
                  Meglévő család / csapat / csoport kiválasztása
                  <select
                    value={groupNames.includes(draft.groupName) ? draft.groupName : ""}
                    onChange={(event) => onDraftChange({ ...draft, groupName: event.target.value })}
                    className="mt-2 w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-slate-800 outline-none focus:border-sky-300"
                  >
                    <option value="">Új csoportot adok meg lent</option>
                    {groupNames.map((groupName) => <option key={groupName} value={groupName}>{groupName}</option>)}
                  </select>
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  {groupNames.map((groupName) => (
                    <button
                      key={groupName}
                      type="button"
                      onClick={() => onDraftChange({ ...draft, groupName })}
                      className={`rounded-full px-3 py-1 text-xs font-black transition ${draft.groupName === groupName ? "bg-sky-500 text-white" : "bg-white text-sky-700 hover:bg-sky-100"}`}
                    >
                      {groupName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <Field label="Teljes név" value={draft.fullName} onChange={(value) => onDraftChange({ ...draft, fullName: value })} required />
              <Field label="Becenév" value={draft.nickname} onChange={(value) => onDraftChange({ ...draft, nickname: value })} placeholder="pl. Kati, Bénike, Józsi" />
              <Field label="Család / csapat / csoport neve" value={draft.groupName} onChange={(value) => onDraftChange({ ...draft, groupName: value })} placeholder="pl. Kati és családja, Keserű család" required />
              <Field label="E-mail cím" value={draft.email} onChange={(value) => onDraftChange({ ...draft, email: value })} placeholder="opcionális, de ajánlott" type="email" />
              <Field label="Telefonszám" value={draft.phone} onChange={(value) => onDraftChange({ ...draft, phone: value })} placeholder="opcionális" />
              <Field label="Saját 4 számjegyű PIN" value={draft.pin} onChange={(value) => onDraftChange({ ...draft, pin: value.replace(/\D/g, "").slice(0, 4) })} type="password" placeholder="••••" required />
            </div>

            {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</p>}

            <button onClick={onRegister} className="mt-5 w-full rounded-2xl bg-rose-400 px-5 py-4 font-black text-white shadow-md transition hover:bg-rose-500">
              Regisztrálok és belépek
            </button>
          </section>

          <section className="rounded-[28px] border border-sky-100 bg-white/95 p-5 shadow-md shadow-sky-100/70">
            <h2 className="text-2xl font-black text-slate-800">Már regisztrált névsor</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Ha itt látod magad, ne hozz létre új regisztrációt, csak írd be a saját PIN-kódodat.</p>

            <div className="mt-5 space-y-4">
              {registrations.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Még nincs regisztrált személy.</p>}
              {Object.entries(groups).map(([groupName, people]) => (
                <div key={groupName} className="overflow-hidden rounded-3xl border border-slate-100 bg-slate-50">
                  <div className="border-b border-slate-100 bg-white px-4 py-3">
                    <h3 className="font-black text-slate-800">{groupName}</h3>
                    <p className="text-xs font-semibold text-slate-400">{people.length} fő</p><div className="mt-3 h-px w-full bg-slate-200" />
                  </div>
                  <div className="space-y-2 border-l-4 border-slate-200 bg-slate-50 p-3">
                    {people.map((person) => (
                      <div key={person.id} className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm xl:grid-cols-[1fr_220px] xl:items-center">
                        <div>
                          <p className="font-black text-slate-800">{displayPerson(person)}</p>
                          <p className="mt-1 text-xs text-slate-500">{person.email || "E-mail: -"} {person.phone ? ` • ${person.phone}` : " • Telefon: -"}</p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={loginPins[person.id] ?? ""}
                            onChange={(event) => onPinChange(person.id, event.target.value.replace(/\D/g, "").slice(0, 4))}
                            onKeyDown={(event) => event.key === "Enter" && onLogin(person)}
                            type="password"
                            inputMode="numeric"
                            placeholder="PIN"
                            className="w-full rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-center font-black tracking-[0.25em] text-slate-800 outline-none focus:border-sky-300"
                          />
                          <button onClick={() => onLogin(person)} className="rounded-2xl bg-sky-400 px-4 py-3 text-sm font-black text-white hover:bg-sky-500">Belépés</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label} {required && <span className="text-rose-500">*</span>}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        className="mt-2 w-full rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
      />
    </label>
  );
}