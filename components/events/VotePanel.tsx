"use client";

import { useState } from "react";
import { EventPanel } from "./EventShell";
import type { EventVoteGroup } from "./types";

type VotePanelProps = {
  groups: EventVoteGroup[];
  currentUserName: string;
  currentUserCode: string;
  isOrganizer: boolean;
  onGroupsChange: (groups: EventVoteGroup[]) => void;
};

function normalizeVoters(group: EventVoteGroup) {
  return group.options.map((_, index) => group.voters?.[index] ?? []);
}

function visibleVoterName(item: string) {
  return item.includes("|") ? item.split("|").slice(1).join("|") : item;
}

function isSeparatePlanningVote(title: string) {
  return title.toLocaleLowerCase("hu-HU").includes("ha külön lesz");
}

export default function VotePanel({ groups, currentUserName, currentUserCode, isOrganizer, onGroupsChange }: VotePanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newOptionTexts, setNewOptionTexts] = useState<Record<number, string>>({});

  function vote(groupIndex: number, optionIndex: number) {
    const voterName = currentUserName.trim() || "Névtelen válaszadó";
    const voterCode = currentUserCode.trim() || "0000";
    const voter = `${voterCode}|${voterName}`;

    onGroupsChange(groups.map((group, gi) => {
      if (gi !== groupIndex) return group;
      const voters = normalizeVoters(group);
      const clickedOptionAlreadyHasVote = voters[optionIndex]?.includes(voter);
      const nextVoters = voters.map((list, oi) => {
        const withoutCurrent = list.filter((name) => name !== voter);
        return oi === optionIndex && !clickedOptionAlreadyHasVote ? [...withoutCurrent, voter] : withoutCurrent;
      });
      return { ...group, votes: nextVoters.map((list) => list.length), voters: nextVoters };
    }));
  }

  function updateTitle(groupIndex: number, title: string) {
    if (!isOrganizer) return;
    onGroupsChange(groups.map((group, gi) => gi === groupIndex ? { ...group, title } : group));
  }

  function updateOption(groupIndex: number, optionIndex: number, value: string) {
    if (!isOrganizer) return;
    onGroupsChange(groups.map((group, gi) => gi !== groupIndex ? group : {
      ...group,
      options: group.options.map((option, oi) => oi === optionIndex ? value : option),
    }));
  }

  function addOption(groupIndex: number) {
    const optionText = (newOptionTexts[groupIndex] ?? "").trim() || "Új javaslat";
    onGroupsChange(groups.map((group, gi) => gi !== groupIndex ? group : {
      ...group,
      options: [...group.options, optionText],
      votes: [...group.votes, 0],
      voters: [...normalizeVoters(group), []],
    }));
    setNewOptionTexts({ ...newOptionTexts, [groupIndex]: "" });
    setIsEditing(true);
  }

  function removeOption(groupIndex: number, optionIndex: number) {
    if (!isOrganizer) return;
    onGroupsChange(groups.map((group, gi) => {
      if (gi !== groupIndex) return group;
      const voters = normalizeVoters(group);
      return {
        ...group,
        options: group.options.filter((_, oi) => oi !== optionIndex),
        votes: group.votes.filter((_, oi) => oi !== optionIndex),
        voters: voters.filter((_, oi) => oi !== optionIndex),
      };
    }).filter((group) => group.options.length > 0));
  }

  function addGroup() {
    if (!isOrganizer) return;
    onGroupsChange([...groups, { title: "Új szavazás", options: ["1. opció", "2. opció"], votes: [0, 0], voters: [[], []] }]);
    setIsEditing(true);
  }

  function removeGroup(groupIndex: number) {
    if (!isOrganizer) return;
    onGroupsChange(groups.filter((_, gi) => gi !== groupIndex));
  }

  return (
    <EventPanel title="Szavazások" description="Minden szavazat a belépett személy saját nevével kerül mentésre. Ha ugyanarra a válaszra még egyszer rákattintasz, a szavazatod törlődik. Új válaszlehetőséget bárki hozzáadhat, törölni csak a szervező tud.">
      <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
        Aktív válaszadó: <strong>{currentUserName.trim() || "nincs megadva"}</strong>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button onClick={() => setIsEditing((current) => !current)} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-black text-sky-700 hover:bg-sky-100">
          {isEditing ? "Javaslatlista bezárása" : "Válaszlehetőségek / javaslatok"}
        </button>
        {isOrganizer && (
          <button onClick={addGroup} className="rounded-2xl bg-rose-400 px-4 py-2 text-sm font-black text-white hover:bg-rose-500">
            + új szavazás
          </button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group, groupIndex) => {
          const voters = normalizeVoters(group);

          return (
            <div key={`${group.title}-${groupIndex}`} className={`rounded-2xl border p-4 shadow-sm ${isSeparatePlanningVote(group.title) ? "border-sky-200 bg-sky-50/70" : "border-slate-100 bg-white"}`}>
              {isEditing ? (
                <div className="space-y-3">
                  {isOrganizer ? (
                    <label className="block text-sm font-semibold text-slate-700">
                      Szavazás címe
                      <input value={group.title} onChange={(event) => updateTitle(groupIndex, event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none focus:border-rose-300" />
                    </label>
                  ) : (
                    <div><h3 className="font-black text-slate-800">{group.title}</h3>{isSeparatePlanningVote(group.title) && <p className="mt-1 text-xs font-bold text-sky-700">Opcionális szavazás arra az esetre, ha az esemény külön lenne megtartva.</p>}</div>
                  )}
                  <div className="space-y-2">
                    {group.options.map((option, optionIndex) => (
                      <div key={`${option}-${optionIndex}`} className="flex gap-2">
                        <input value={option} readOnly={!isOrganizer} onChange={(event) => updateOption(groupIndex, optionIndex, event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-rose-300" />
                        {isOrganizer && <button onClick={() => removeOption(groupIndex, optionIndex)} className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-100">Törlés</button>}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input value={newOptionTexts[groupIndex] ?? ""} onChange={(event) => setNewOptionTexts({ ...newOptionTexts, [groupIndex]: event.target.value })} placeholder="Új válaszlehetőség / javaslat" className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-slate-800 outline-none focus:border-amber-300" />
                    <button onClick={() => addOption(groupIndex)} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100">+ hozzáadás</button>
                    {isOrganizer && <button onClick={() => removeGroup(groupIndex)} className="rounded-2xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100">Szavazás törlése</button>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="font-black text-slate-800">{group.title}</h3>{isSeparatePlanningVote(group.title) && <p className="mt-1 text-xs font-bold text-sky-700">Külön esemény esetére</p>}</div>
                    <button onClick={() => setIsEditing(true)} className="rounded-xl bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 hover:bg-amber-100">+ javaslat</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.options.map((option, optionIndex) => (
                      <button key={`${option}-${optionIndex}`} onClick={() => vote(groupIndex, optionIndex)} className="w-full rounded-xl bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:bg-rose-50">
                        <span className="flex justify-between gap-3"><span>{option}</span><b>{voters[optionIndex]?.length ?? 0}</b></span>
                        {voters[optionIndex]?.length > 0 && <span className="mt-1 block text-xs text-slate-500">{voters[optionIndex].map(visibleVoterName).join(", ")}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </EventPanel>
  );
}