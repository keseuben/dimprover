"use client";

import { EventInput, EventPanel, EventTextarea } from "./EventShell";
import type { EventGuest, EventMode, EventPerson } from "./types";

type GuestFormProps = {
  eventMode: EventMode;
  activePerson: EventPerson;
  responsePerson: EventPerson;
  editablePeople: EventPerson[];
  canManageGroupResponses: boolean;
  guest: EventGuest;
  onResponsePersonChange: (personId: number) => void;
  onGuestChange: (guest: EventGuest) => void;
  onSave: () => void;
};

function personLabel(person: EventPerson) {
  return `${person.fullName}${person.nickname ? ` (${person.nickname})` : ""}`;
}

export default function GuestForm({ eventMode, activePerson, responsePerson, editablePeople, canManageGroupResponses, guest, onResponsePersonChange, onGuestChange, onSave }: GuestFormProps) {
  return (
    <EventPanel title="5. lépés – Saját válaszok" description="A válaszok regisztrált személyenként kerülnek mentésre. Így mindenki külön jelezheti, hogy jön-e, és van-e ételallergiája.">
      <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800">
        Belépett személy: <strong>{personLabel(activePerson)}</strong><br />
        Kitöltött válasz: <strong>{personLabel(responsePerson)}</strong><br />
        Csoport: <strong>{responsePerson.groupName}</strong>
      </div>

      {canManageGroupResponses && editablePeople.length > 1 && (
        <label className="mb-4 block text-sm font-semibold text-slate-700">
          Kinek a válaszát töltöd ki?
          <select
            value={responsePerson.id}
            onChange={(event) => onResponsePersonChange(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-slate-800 outline-none focus:border-amber-300"
          >
            {editablePeople.map((person) => <option key={person.id} value={person.id}>{person.groupName} – {personLabel(person)}</option>)}
          </select>
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            Csoportfőként / csoportlétrehozóként a saját magad által felvett családtagok vagy csapattagok válaszát is rögzítheted.
          </span>
        </label>
      )}

      {eventMode === "separate" && (
        <label className="mb-4 block text-sm font-semibold text-slate-700">
          Melyik eseményen tud részt venni?
          <select
            value={guest.eventPreference}
            onChange={(event) => onGuestChange({ ...guest, eventPreference: event.target.value as EventGuest["eventPreference"] })}
            className="mt-2 w-full rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-slate-800 outline-none focus:border-sky-300"
          >
            <option value="mindketto">Mindkét eseményen</option>
            <option value="mama">Csak Mama 85. eseményén</option>
            <option value="apu">Csak Apu 65. eseményén</option>
            <option value="egyik_sem">Egyiken sem</option>
          </select>
        </label>
      )}

      <label className="block text-sm font-semibold text-slate-700">
        Jön-e?
        <select
          value={guest.status}
          onChange={(event) => onGuestChange({ ...guest, status: event.target.value as EventGuest["status"] })}
          className="mt-2 w-full rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-slate-800 outline-none focus:border-rose-300"
        >
          <option value="jovunk">Igen, jön</option>
          <option value="kerdeses">Még nem biztos</option>
          <option value="nem">Nem tud jönni</option>
        </select>
      </label>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <EventInput label="Hány fővel számoljunk ehhez a válaszhoz?" value={guest.count} onChange={(value) => onGuestChange({ ...guest, count: value })} />
        <EventInput label="Ételallergia / érzékenység" value={guest.allergy || "-"} onChange={(value) => onGuestChange({ ...guest, allergy: value || "-" })} />
      </div>

      <div className="mt-4">
        <EventTextarea label="Megjegyzés" value={guest.note} onChange={(value) => onGuestChange({ ...guest, note: value })} />
      </div>

      <button onClick={onSave} className="mt-5 rounded-2xl bg-rose-400 px-5 py-3 font-black text-white transition hover:bg-rose-500">
        Válasz mentése
      </button>
    </EventPanel>
  );
}