"use client";

import { EventInput, EventPanel } from "./EventShell";
import type { EventBringItem, EventPerson } from "./types";

type BringListProps = {
  text: string;
  items: EventBringItem[];
  activePerson: EventPerson;
  onTextChange: (value: string) => void;
  onAdd: () => void;
};

function personLabel(person: EventPerson) {
  return `${person.groupName} – ${person.fullName}${person.nickname ? ` (${person.nickname})` : ""}`;
}

export default function BringList({ text, items, activePerson, onTextChange, onAdd }: BringListProps) {
  return (
    <EventPanel title="Ki mit hoz?" description="Étel, ital, sütemény, szék, sátor, dekoráció vagy bármilyen felajánlás.">
      <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
        Felajánló: <strong>{personLabel(activePerson)}</strong>
      </div>
      <EventInput label="Felajánlás" value={text} onChange={onTextChange} />
      <button onClick={onAdd} className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 font-bold text-sky-700 hover:bg-sky-100">
        Hozzáadás
      </button>
      <div className="mt-4 space-y-2">
        {items.length === 0 && <p className="text-sm text-slate-500">Még nincs rögzített felajánlás.</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl bg-white p-3 text-sm text-slate-700 shadow-sm">
            <p>{item.text}</p>
            <p className="mt-1 text-xs font-bold text-sky-700">Felajánló: {item.ownerGroupName ? `${item.ownerGroupName} – ` : ""}{item.ownerFullName || item.owner || "Névtelen"}{item.ownerNickname ? ` (${item.ownerNickname})` : ""}</p>
          </div>
        ))}
      </div>
    </EventPanel>
  );
}