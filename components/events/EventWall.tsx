"use client";

import { EventPanel, EventTextarea } from "./EventShell";
import type { EventMessageItem, EventPerson } from "./types";

type EventWallProps = {
  message: string;
  messages: EventMessageItem[];
  activePerson: EventPerson;
  onMessageChange: (value: string) => void;
  onAdd: () => void;
};

function personLabel(person: EventPerson) {
  return `${person.groupName} – ${person.fullName}${person.nickname ? ` (${person.nickname})` : ""}`;
}

function messageOwner(item: EventMessageItem) {
  return `${item.ownerGroupName ? `${item.ownerGroupName} – ` : ""}${item.ownerFullName || item.owner || "Névtelen"}${item.ownerNickname ? ` (${item.ownerNickname})` : ""}`;
}

export default function EventWall({ message, messages, activePerson, onMessageChange, onAdd }: EventWallProps) {
  return (
    <EventPanel title="Üzenőfal" description="Kérdések, ötletek, helyszínnel vagy ajándékkal kapcsolatos megjegyzések.">
      <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
        Üzenet írója: <strong>{personLabel(activePerson)}</strong>
      </div>
      <EventTextarea label="Megjegyzés" value={message} onChange={onMessageChange} />
      <button onClick={onAdd} className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 font-bold text-rose-700 hover:bg-rose-100">
        Megjegyzés mentése
      </button>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="grid grid-cols-[0.85fr_1.15fr] bg-slate-50 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          <div className="border-r border-slate-100 p-3">Író</div>
          <div className="p-3">Megjegyzés</div>
        </div>
        {messages.length === 0 && <p className="p-4 text-sm text-slate-500">Még nincs rögzített megjegyzés.</p>}
        {messages.map((item) => (
          <div key={item.id} className="grid grid-cols-[0.85fr_1.15fr] border-t border-slate-100 text-sm">
            <div className="border-r border-slate-100 p-3 font-bold text-rose-700">{messageOwner(item)}</div>
            <div className="p-3 text-slate-700">{item.text}</div>
          </div>
        ))}
      </div>
    </EventPanel>
  );
}
