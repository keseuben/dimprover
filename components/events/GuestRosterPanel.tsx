"use client";

import { useEffect, useState } from "react";
import type { EventPerson, EventPersonDraft } from "./types";

function personLabel(person: EventPerson) {
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

type GuestRosterPanelProps = {
  registrations: EventPerson[];
  activePerson: EventPerson;
  memberDraft: EventPersonDraft;
  memberError: string;
  moveGroupError: string;
  onMemberDraftChange: (draft: EventPersonDraft) => void;
  onAddMember: () => void;
  onMoveActivePersonGroup: (groupName: string) => void;
  onUpdateActivePersonProfile: (profile: { fullName: string; nickname: string; email: string; phone: string }) => void;
};

export default function GuestRosterPanel({ registrations, activePerson, memberDraft, memberError, moveGroupError, onMemberDraftChange, onAddMember, onMoveActivePersonGroup, onUpdateActivePersonProfile }: GuestRosterPanelProps) {
  const groups = groupedPeople(registrations);
  const groupNames = uniqueGroups(registrations);
  const [moveGroupName, setMoveGroupName] = useState(activePerson.groupName);
  const [newGroupName, setNewGroupName] = useState("");
  const [profileFullName, setProfileFullName] = useState(activePerson.fullName);
  const [profileNickname, setProfileNickname] = useState(activePerson.nickname);
  const [profileEmail, setProfileEmail] = useState(activePerson.email);
  const [profilePhone, setProfilePhone] = useState(activePerson.phone);

  useEffect(() => {
    setMoveGroupName(activePerson.groupName);
    setProfileFullName(activePerson.fullName);
    setProfileNickname(activePerson.nickname);
    setProfileEmail(activePerson.email);
    setProfilePhone(activePerson.phone);
  }, [activePerson]);

  function moveToSelectedGroup() {
    onMoveActivePersonGroup(moveGroupName);
  }

  function saveProfile() {
    onUpdateActivePersonProfile({
      fullName: profileFullName,
      nickname: profileNickname,
      email: profileEmail,
      phone: profilePhone,
    });
  }

  function moveToNewGroup() {
    onMoveActivePersonGroup(newGroupName);
    setNewGroupName("");
  }

  return (
    <aside className="space-y-5 lg:sticky lg:top-4">
      <section className="rounded-[28px] border border-sky-100 bg-white/95 p-5 shadow-md shadow-sky-100/70">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-500">Aktív belépő</p>
        <h2 className="mt-2 text-xl font-black text-slate-800">{personLabel(activePerson)}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{activePerson.groupName}</p>
        <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
          A válaszok, szavazatok, felajánlások és üzenetek ezzel a névvel lesznek rögzítve.
        </p>
      </section>

      <section className="rounded-[28px] border border-rose-100 bg-white/95 p-5 shadow-md shadow-rose-100/70">
        <h2 className="text-xl font-black text-slate-800">Saját adatok módosítása</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">A regisztrált tag később is javíthatja a nevét, becenevét és elérhetőségeit.</p>
        <div className="mt-4 grid gap-3">
          <SmallField label="Teljes név" value={profileFullName} onChange={setProfileFullName} />
          <SmallField label="Becenév" value={profileNickname} onChange={setProfileNickname} />
          <SmallField label="E-mail cím" value={profileEmail} onChange={setProfileEmail} />
          <SmallField label="Telefonszám" value={profilePhone} onChange={setProfilePhone} />
        </div>
        <button onClick={saveProfile} className="mt-4 w-full rounded-2xl bg-rose-400 px-4 py-3 font-black text-white hover:bg-rose-500">
          Saját adatok mentése
        </button>
      </section>

      <section className="rounded-[28px] border border-sky-100 bg-white/95 p-5 shadow-md shadow-sky-100/70">
        <h2 className="text-xl font-black text-slate-800">Saját csoport módosítása</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Ha rossz család/csapat/csoport alá kerültél, itt át tudod tenni magad máshová.</p>

        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Áthelyezés meglévő csoportba
          <select
            value={moveGroupName}
            onChange={(event) => setMoveGroupName(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-slate-800 outline-none focus:border-sky-300"
          >
            {groupNames.map((groupName) => <option key={groupName} value={groupName}>{groupName}</option>)}
          </select>
        </label>
        <button onClick={moveToSelectedGroup} className="mt-3 w-full rounded-2xl bg-sky-400 px-4 py-3 font-black text-white hover:bg-sky-500">
          Áthelyezem magam ide
        </button>

        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
          <SmallField label="Új csoportnév" value={newGroupName} onChange={setNewGroupName} placeholder="pl. Zoli és családja" />
          <button onClick={moveToNewGroup} className="mt-3 w-full rounded-2xl bg-amber-300 px-4 py-3 font-black text-slate-800 hover:bg-amber-400">
            Új csoportba teszem magam
          </button>
        </div>

        {moveGroupError && <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-600">{moveGroupError}</p>}
      </section>

      <section className="rounded-[28px] border border-amber-100 bg-white/95 p-5 shadow-md shadow-amber-100/70">
        <h2 className="text-xl font-black text-slate-800">Családtag / ismerős hozzáadása</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Az új személy a(z) <strong>{activePerson.groupName}</strong> csoport alá kerül.</p>

        <div className="mt-4 grid gap-3">
          <SmallField label="Teljes név" value={memberDraft.fullName} onChange={(value) => onMemberDraftChange({ ...memberDraft, fullName: value })} />
          <SmallField label="Becenév" value={memberDraft.nickname} onChange={(value) => onMemberDraftChange({ ...memberDraft, nickname: value })} />
          <SmallField label="E-mail cím" value={memberDraft.email} onChange={(value) => onMemberDraftChange({ ...memberDraft, email: value })} placeholder="opcionális, de ajánlott" />
          <SmallField label="Telefonszám" value={memberDraft.phone} onChange={(value) => onMemberDraftChange({ ...memberDraft, phone: value })} placeholder="opcionális" />
          <SmallField label="4 számjegyű PIN" value={memberDraft.pin} onChange={(value) => onMemberDraftChange({ ...memberDraft, pin: value.replace(/\D/g, "").slice(0, 4) })} type="password" placeholder="ezt küldd el neki" />
        </div>

        {memberError && <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-600">{memberError}</p>}

        <button onClick={onAddMember} className="mt-4 w-full rounded-2xl bg-amber-300 px-4 py-3 font-black text-slate-800 hover:bg-amber-400">
          + személy hozzáadása a csoporthoz
        </button>
      </section>

      <section className="rounded-[28px] border border-rose-100 bg-white/95 p-5 shadow-md shadow-rose-100/70">
        <h2 className="text-xl font-black text-slate-800">Fix névsor</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">A regisztrált személyek csoportosítva, elérhetőségekkel.</p>
        <div className="mt-4 max-h-[520px] space-y-3 overflow-auto pr-1">
          {Object.entries(groups).map(([groupName, people]) => (
            <div key={groupName} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="rounded-xl bg-white px-3 py-2 shadow-sm"><p className="font-black text-slate-800">{groupName}</p><p className="text-xs font-semibold text-slate-400">{people.length} fő</p></div>
              <div className="mt-3 space-y-2 border-l-4 border-slate-200 pl-3">
                {people.map((person) => (
                  <div key={person.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
                    <p className="font-bold text-slate-800">{personLabel(person)}</p>
                    <p className="mt-1 text-xs font-bold text-amber-700">{person.role === "organizer" ? "Szervező" : person.role === "captain" ? "Családfő / csoportkapitány" : "Tag"}</p>
                    <p className="mt-1 text-xs text-slate-500">{person.email || "E-mail: -"}</p>
                    <p className="text-xs text-slate-500">{person.phone || "Telefon: -"}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function SmallField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        className="mt-2 w-full rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-slate-800 outline-none focus:border-amber-300 focus:bg-white"
      />
    </label>
  );
}