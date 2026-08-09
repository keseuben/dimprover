"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AiIntroAssistant from "@/components/events/AiIntroAssistant";
import BringList from "@/components/events/BringList";
import EventAdminSummary from "@/components/events/EventAdminSummary";
import EventHero from "@/components/events/EventHero";
import EventLogin from "@/components/events/EventLogin";
import FamilyTreePanel from "@/components/events/FamilyTreePanel";
import GuestRosterPanel from "@/components/events/GuestRosterPanel";
import RegistrationGate from "@/components/events/RegistrationGate";
import { EventShell } from "@/components/events/EventShell";
import EventWall from "@/components/events/EventWall";
import GuestForm from "@/components/events/GuestForm";
import VotePanel from "@/components/events/VotePanel";
import type { EventStoredData } from "@/components/events/storageTypes";
import type {
  EventBringItem,
  EventFamilyTreeNote,
  EventFamilyTreePerson,
  EventFamilyTreePersonDraft,
  EventGuest,
  EventMessageItem,
  EventMode,
  EventPerson,
  EventPersonDraft,
  EventVoteGroup,
} from "@/components/events/types";

const ACCESS_CODE = "8565";
const ORGANIZER_CODE = "8565-admin";

const ORGANIZER_PERSON: EventPerson = {
  id: 8565001,
  fullName: "Bénike",
  nickname: "Szervező",
  groupName: "Szervező",
  email: "",
  phone: "",
  pin: ORGANIZER_CODE,
  role: "organizer",
  createdAt: "2026-06-28T00:00:00.000Z",
};

const DEFAULT_INTRO = `Vannak alkalmak, amelyeket nem érdemes későbbre halasztani. Mama 85 éves, Apu pedig 65 éves lesz – két szép kerek évforduló, amit jó lenne együtt, családi körben megünnepelni.

Ez a nap nem a nagy felhajtásról szólna, hanem arról, hogy együtt legyünk, beszélgessünk, nevessünk, együnk egy jót, és adjunk nekik egy olyan emléket, amit sokáig őrizhetnek.

Kérlek, ha csak tehetitek, gyertek el. Az ilyen közös családi alkalmakból mindig kevesebb van, mint gondolnánk.`;

const DEFAULT_QUOTE = "A legszebb ajándék nem mindig az, amit becsomagolunk, hanem az idő, amit együtt töltünk.";

const EMPTY_DRAFT: EventPersonDraft = {
  fullName: "",
  nickname: "",
  groupName: "",
  email: "",
  phone: "",
  pin: "",
};

const EMPTY_GUEST: EventGuest = {
  id: 0,
  personId: undefined,
  responderName: "",
  responderCode: "",
  fullName: "",
  nickname: "",
  groupName: "",
  name: "",
  phone: "",
  email: "",
  status: "jovunk",
  eventPreference: "mindketto",
  count: "1",
  guestNames: "",
  guestMembers: [],
  allergy: "-",
  note: "",
};

const START_VOTES: EventVoteGroup[] = [
  {
    title: "Esemény formája",
    options: ["Egy közös családi esemény", "Két külön esemény legyen"],
    votes: [0, 0],
    voters: [[], []],
  },
  {
    title: "Időpont",
    options: ["Aug. 23. szombat", "Aug. 24. vasárnap", "Aug. 30. szombat", "Aug. 31. vasárnap"],
    votes: [0, 0, 0, 0],
    voters: [[], [], [], []],
  },
  {
    title: "Helyszín",
    options: ["Mama kertje", "Apuéknál", "Másik családi kert", "Bérelhető helyszín"],
    votes: [0, 0, 0, 0],
    voters: [[], [], [], []],
  },
  {
    title: "Ajándék",
    options: ["Családi fotóalbum", "Emlékkönyv", "Közös élmény", "Egyéb ötlet"],
    votes: [0, 0, 0, 0],
    voters: [[], [], [], []],
  },
  {
    title: "Ha külön lesz – Mama időpontja",
    options: ["Aug. 23. szombat", "Aug. 24. vasárnap", "Aug. 30. szombat", "Aug. 31. vasárnap"],
    votes: [0, 0, 0, 0],
    voters: [[], [], [], []],
  },
  {
    title: "Ha külön lesz – Apu időpontja",
    options: ["Aug. 23. szombat", "Aug. 24. vasárnap", "Aug. 30. szombat", "Aug. 31. vasárnap"],
    votes: [0, 0, 0, 0],
    voters: [[], [], [], []],
  },
  {
    title: "Ha külön lesz – helyszín",
    options: ["Mama kertje", "Apuéknál", "Másik családi kert", "Bérelhető helyszín"],
    votes: [0, 0, 0, 0],
    voters: [[], [], [], []],
  },
];

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("hu-HU");
}

function isBenike(draftOrPerson: Pick<EventPersonDraft, "fullName" | "nickname" | "groupName">) {
  const combined = `${draftOrPerson.fullName} ${draftOrPerson.nickname} ${draftOrPerson.groupName}`.toLocaleLowerCase("hu-HU");
  return combined.includes("bénike") || combined.includes("benike");
}

function personDisplayName(person: EventPerson) {
  return `${person.groupName} – ${person.fullName}${person.nickname ? ` (${person.nickname})` : ""}`;
}

function makeGuestForPerson(person: EventPerson, existing?: EventGuest): EventGuest {
  return {
    ...EMPTY_GUEST,
    ...existing,
    id: existing?.id ?? 0,
    personId: person.id,
    responderName: personDisplayName(person),
    responderCode: person.pin,
    fullName: person.fullName,
    nickname: person.nickname,
    groupName: person.groupName,
    name: personDisplayName(person),
    phone: person.phone,
    email: person.email,
  };
}

function ensureVoteGroups(existingVotes: EventVoteGroup[]) {
  const nextVotes = [...existingVotes];
  for (const starter of START_VOTES) {
    if (!nextVotes.some((vote) => vote.title === starter.title)) {
      nextVotes.push(starter);
    }
  }
  return nextVotes;
}

export default function TortaEventPage() {
  const [code, setCode] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [intro, setIntro] = useState(DEFAULT_INTRO);
  const [quote, setQuote] = useState(DEFAULT_QUOTE);
  const [eventMode, setEventMode] = useState<EventMode>("together");
  const [eventDescription, setEventDescription] = useState("Családi meglepetés születésnapi kerti partit szervezünk Mamának és Apunak. Mama 85 éves, Apu 65 éves lesz. Augusztus végén tartanánk, családi nyárzáró hangulatban.");
  const [registrations, setRegistrations] = useState<EventPerson[]>([]);
  const [activePerson, setActivePerson] = useState<EventPerson | null>(null);
  const [selectedResponsePersonId, setSelectedResponsePersonId] = useState<number | null>(null);
  const [registrationDraft, setRegistrationDraft] = useState<EventPersonDraft>(EMPTY_DRAFT);
  const [memberDraft, setMemberDraft] = useState<EventPersonDraft>(EMPTY_DRAFT);
  const [registrationError, setRegistrationError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [moveGroupError, setMoveGroupError] = useState("");
  const [loginPins, setLoginPins] = useState<Record<number, string>>({});
  const [guest, setGuest] = useState<EventGuest>(EMPTY_GUEST);
  const [guests, setGuests] = useState<EventGuest[]>([]);
  const [votes, setVotes] = useState<EventVoteGroup[]>(START_VOTES);
  const [bringText, setBringText] = useState("");
  const [bringItems, setBringItems] = useState<EventBringItem[]>([]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<EventMessageItem[]>([]);
  const [familyTreeNotes, setFamilyTreeNotes] = useState<EventFamilyTreeNote[]>([]);
  const [familyTreePeople, setFamilyTreePeople] = useState<EventFamilyTreePerson[]>([]);
  const [storageStatus, setStorageStatus] = useState("Nincs még betöltve");
  const hasLoadedStoredData = useRef(false);

  const isOrganizer = !!activePerson && activePerson.role === "organizer";
  const isGroupCaptain = !!activePerson && (activePerson.role === "captain" || activePerson.role === "organizer");

  useEffect(() => {
    if (!isUnlocked || hasLoadedStoredData.current) return;

    async function loadStoredData() {
      try {
        setStorageStatus("Betöltés folyamatban...");
        const response = await fetch("/api/events/torta", { cache: "no-store" });
        if (!response.ok) throw new Error("Nem sikerült betölteni az esemény adatait.");
        const data = (await response.json()) as EventStoredData;
        const loadedRegistrations = Array.isArray(data.registrations) ? data.registrations : [];
        setRegistrations(loadedRegistrations.some((person) => person.id === ORGANIZER_PERSON.id) ? loadedRegistrations : [ORGANIZER_PERSON, ...loadedRegistrations]);
        setGuests(Array.isArray(data.guests) ? data.guests : []);
        setVotes(Array.isArray(data.votes) && data.votes.length ? ensureVoteGroups(data.votes) : START_VOTES);
        setBringItems(Array.isArray(data.bringItems) ? data.bringItems : []);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setFamilyTreeNotes(Array.isArray(data.familyTreeNotes) ? data.familyTreeNotes : []);
        setFamilyTreePeople(Array.isArray(data.familyTreePeople) ? data.familyTreePeople : []);
        if (data.intro) setIntro(data.intro);
        if (data.quote) setQuote(data.quote);
        if (data.eventMode === "together" || data.eventMode === "separate") setEventMode(data.eventMode);
        hasLoadedStoredData.current = true;
        setStorageStatus("Adatok betöltve");
      } catch (error) {
        console.error(error);
        hasLoadedStoredData.current = true;
        setStorageStatus("Betöltési hiba, helyi adatokkal folytatva");
      }
    }

    loadStoredData();
  }, [isUnlocked]);


  useEffect(() => {
    if (!isUnlocked || !hasLoadedStoredData.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        setStorageStatus("Mentés folyamatban...");
        const payload: EventStoredData = {
          eventMode,
          registrations,
          guests,
          votes,
          bringItems,
          messages,
          familyTreeNotes,
          familyTreePeople,
          intro,
          quote,
          updatedAt: new Date().toISOString(),
        };
        const response = await fetch("/api/events/torta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Nem sikerült menteni az esemény adatait.");
        setStorageStatus("Mentve");
      } catch (error) {
        console.error(error);
        setStorageStatus("Mentési hiba");
      }
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [isUnlocked, eventMode, registrations, guests, votes, bringItems, messages, familyTreeNotes, familyTreePeople, intro, quote]);

  const summary = useMemo(() => {
    const coming = guests.filter((item) => item.status === "jovunk");
    const mamaGuests = coming.filter((item) => item.eventPreference === "mindketto" || item.eventPreference === "mama");
    const apuGuests = coming.filter((item) => item.eventPreference === "mindketto" || item.eventPreference === "apu");
    return {
      families: new Set(registrations.map((item) => item.groupName || "Csoport nélkül")).size,
      coming: coming.length,
      people: coming.reduce((sum, item) => sum + Number(item.count || 0), 0),
      mamaPeople: mamaGuests.reduce((sum, item) => sum + Number(item.count || 0), 0),
      apuPeople: apuGuests.reduce((sum, item) => sum + Number(item.count || 0), 0),
      allergyCount: guests.filter((item) => item.allergy.trim()).length,
    };
  }, [guests, registrations]);


  const editablePeople = useMemo<EventPerson[]>(() => {
    if (!activePerson) return [];
    if (isOrganizer) return registrations.length ? registrations : [activePerson];
    const createdByActivePerson = registrations.some((person) => person.parentPersonId === activePerson.id || person.createdByPersonId === activePerson.id);
    if (isGroupCaptain || createdByActivePerson) {
      return registrations.filter((person) => person.groupName === activePerson.groupName);
    }
    return [activePerson];
  }, [activePerson, registrations, isOrganizer, isGroupCaptain]);

  const canManageGroupResponses = editablePeople.length > 1;
  const responsePerson = activePerson ? editablePeople.find((person) => person.id === selectedResponsePersonId) ?? activePerson : null;

  useEffect(() => {
    if (!responsePerson) return;
    const existingGuest = guests.find((item) => item.personId === responsePerson.id || (item.responderName === personDisplayName(responsePerson) && item.responderCode === responsePerson.pin));
    setGuest(makeGuestForPerson(responsePerson, existingGuest));
  }, [responsePerson, guests]);

  function unlock() {
    const typedCode = code.trim();

    if (typedCode === ORGANIZER_CODE) {
      setIsUnlocked(true);
      setActivePerson(ORGANIZER_PERSON);
      setSelectedResponsePersonId(ORGANIZER_PERSON.id);
      setCodeError("");
      return;
    }

    if (typedCode === ACCESS_CODE) {
      setIsUnlocked(true);
      setCodeError("");
      return;
    }

    setCodeError("A megadott kód nem megfelelő.");
  }

  function registerPerson() {
    const fullName = registrationDraft.fullName.trim();
    const groupName = registrationDraft.groupName.trim();
    const pin = registrationDraft.pin.trim();

    if (!fullName || !groupName) {
      setRegistrationError("A teljes név és a csoportnév kötelező.");
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setRegistrationError("A PIN pontosan 4 számjegy legyen.");
      return;
    }

    const duplicate = registrations.some((person) => normalizeText(person.fullName) === normalizeText(fullName) && normalizeText(person.groupName) === normalizeText(groupName));
    if (duplicate) {
      setRegistrationError("Ez a név ebben a csoportban már szerepel. Válaszd ki a listából, és PIN-kóddal lépj be.");
      return;
    }

    const person: EventPerson = {
      id: Date.now(),
      fullName,
      nickname: registrationDraft.nickname.trim(),
      groupName,
      email: registrationDraft.email.trim(),
      phone: registrationDraft.phone.trim(),
      pin,
      role: registrations.filter((item) => item.groupName === groupName).length === 0 ? "captain" : "guest",
      createdAt: new Date().toISOString(),
    };

    setRegistrations([person, ...registrations]);
    setActivePerson(person);
    setSelectedResponsePersonId(person.id);
    setRegistrationDraft(EMPTY_DRAFT);
    setRegistrationError("");
    window.localStorage.setItem("dimpro_event_person_id", String(person.id));
  }

  function loginPerson(person: EventPerson) {
    const typedPin = loginPins[person.id] ?? "";
    if (typedPin !== person.pin) {
      setRegistrationError("Nem megfelelő PIN-kód ehhez a személyhez.");
      return;
    }
    setActivePerson(person);
    setSelectedResponsePersonId(person.id);
    setRegistrationError("");
    window.localStorage.setItem("dimpro_event_person_id", String(person.id));
  }

  function addMember() {
    if (!activePerson) return;
    const fullName = memberDraft.fullName.trim();
    const pin = memberDraft.pin.trim();

    if (!fullName) {
      setMemberError("A teljes név kötelező.");
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setMemberError("A családtag / ismerős PIN-kódja pontosan 4 számjegy legyen.");
      return;
    }

    const duplicate = registrations.some((person) => normalizeText(person.fullName) === normalizeText(fullName) && normalizeText(person.groupName) === normalizeText(activePerson.groupName));
    if (duplicate) {
      setMemberError("Ez a személy már szerepel ebben a csoportban.");
      return;
    }

    const person: EventPerson = {
      id: Date.now(),
      fullName,
      nickname: memberDraft.nickname.trim(),
      groupName: activePerson.groupName,
      email: memberDraft.email.trim(),
      phone: memberDraft.phone.trim(),
      pin,
      role: "guest",
      parentPersonId: activePerson.id,
      createdByPersonId: activePerson.id,
      createdAt: new Date().toISOString(),
    };

    setRegistrations([...registrations, person]);
    setMemberDraft(EMPTY_DRAFT);
    setMemberError("");
  }

  function moveActivePersonGroup(groupName: string) {
    if (!activePerson) return;
    const nextGroupName = groupName.trim();

    if (!nextGroupName) {
      setMoveGroupError("Adj meg vagy válassz ki egy csoportnevet.");
      return;
    }

    const duplicateInTargetGroup = registrations.some((person) =>
      person.id !== activePerson.id &&
      normalizeText(person.fullName) === normalizeText(activePerson.fullName) &&
      normalizeText(person.groupName) === normalizeText(nextGroupName)
    );

    if (duplicateInTargetGroup) {
      setMoveGroupError("Ebben a csoportban már szerepel ugyanez a teljes név.");
      return;
    }

    const updatedPerson: EventPerson = { ...activePerson, groupName: nextGroupName };
    const oldDisplayName = personDisplayName(activePerson);
    const newDisplayName = personDisplayName(updatedPerson);
    const voterPrefix = `${activePerson.pin}|`;

    setRegistrations(registrations.map((person) => person.id === activePerson.id ? updatedPerson : person));
    setActivePerson(updatedPerson);
    setMoveGroupError("");

    setGuests(guests.map((item) => item.personId === activePerson.id ? {
      ...item,
      groupName: nextGroupName,
      name: newDisplayName,
      responderName: newDisplayName,
    } : item));

    setBringItems(bringItems.map((item) => item.ownerPersonId === activePerson.id ? {
      ...item,
      owner: newDisplayName,
      ownerGroupName: nextGroupName,
    } : item));

    setMessages(messages.map((item) => item.ownerPersonId === activePerson.id ? {
      ...item,
      owner: newDisplayName,
      ownerGroupName: nextGroupName,
    } : item));

    setVotes(votes.map((group) => ({
      ...group,
      voters: group.voters?.map((list) => list.map((voter) => voter.startsWith(voterPrefix) || voter === oldDisplayName ? `${activePerson.pin}|${newDisplayName}` : voter)),
    })));
  }


  function updateActivePersonProfile(profile: { fullName: string; nickname: string; email: string; phone: string }) {
    if (!activePerson) return;
    const nextFullName = profile.fullName.trim();
    if (!nextFullName) return;

    const updatedPerson: EventPerson = {
      ...activePerson,
      fullName: nextFullName,
      nickname: profile.nickname.trim(),
      email: profile.email.trim(),
      phone: profile.phone.trim(),
    };

    const oldDisplayName = personDisplayName(activePerson);
    const newDisplayName = personDisplayName(updatedPerson);
    const voterPrefix = `${activePerson.pin}|`;

    setRegistrations(registrations.map((person) => person.id === activePerson.id ? updatedPerson : person));
    setActivePerson(updatedPerson);

    setGuests(guests.map((item) => item.personId === activePerson.id ? {
      ...item,
      fullName: updatedPerson.fullName,
      nickname: updatedPerson.nickname,
      email: updatedPerson.email,
      phone: updatedPerson.phone,
      name: newDisplayName,
      responderName: newDisplayName,
    } : item));

    setBringItems(bringItems.map((item) => item.ownerPersonId === activePerson.id ? {
      ...item,
      owner: newDisplayName,
      ownerFullName: updatedPerson.fullName,
      ownerNickname: updatedPerson.nickname,
    } : item));

    setMessages(messages.map((item) => item.ownerPersonId === activePerson.id ? {
      ...item,
      owner: newDisplayName,
      ownerFullName: updatedPerson.fullName,
      ownerNickname: updatedPerson.nickname,
    } : item));

    setFamilyTreeNotes(familyTreeNotes.map((item) => item.ownerPersonId === activePerson.id ? {
      ...item,
      owner: newDisplayName,
      ownerFullName: updatedPerson.fullName,
      ownerNickname: updatedPerson.nickname,
    } : item));

    setVotes(votes.map((group) => ({
      ...group,
      voters: group.voters?.map((list) => list.map((voter) => voter.startsWith(voterPrefix) || voter === oldDisplayName ? `${activePerson.pin}|${newDisplayName}` : voter)),
    })));
  }

  function saveGuest() {
    if (!responsePerson) return;
    const nextGuest = makeGuestForPerson(responsePerson, { ...guest, id: guest.id || Date.now() });
    const existingIndex = guests.findIndex((item) => item.personId === responsePerson.id || (item.responderName === nextGuest.responderName && item.responderCode === nextGuest.responderCode));

    if (existingIndex >= 0) {
      setGuests(guests.map((item, index) => index === existingIndex ? { ...nextGuest, id: item.id } : item));
    } else {
      setGuests([nextGuest, ...guests]);
    }
  }

  function addBringItem() {
    if (!activePerson || !bringText.trim()) return;
    setBringItems([{
      id: Date.now(),
      text: bringText.trim(),
      owner: personDisplayName(activePerson),
      ownerCode: activePerson.pin,
      ownerPersonId: activePerson.id,
      ownerFullName: activePerson.fullName,
      ownerNickname: activePerson.nickname,
      ownerGroupName: activePerson.groupName,
    }, ...bringItems]);
    setBringText("");
  }

  function addMessage() {
    if (!activePerson || !message.trim()) return;
    setMessages([{
      id: Date.now(),
      text: message.trim(),
      owner: personDisplayName(activePerson),
      ownerCode: activePerson.pin,
      ownerPersonId: activePerson.id,
      ownerFullName: activePerson.fullName,
      ownerNickname: activePerson.nickname,
      ownerGroupName: activePerson.groupName,
    }, ...messages]);
    setMessage("");
  }

  function addFamilyTreeNote(text: string) {
    if (!activePerson || !text.trim()) return;
    setFamilyTreeNotes([{
      id: Date.now(),
      text: text.trim(),
      owner: personDisplayName(activePerson),
      ownerPersonId: activePerson.id,
      ownerFullName: activePerson.fullName,
      ownerNickname: activePerson.nickname,
      ownerGroupName: activePerson.groupName,
      createdAt: new Date().toISOString(),
    }, ...familyTreeNotes]);
  }


  function deleteFamilyTreePerson(personId: number) {
    setFamilyTreePeople(familyTreePeople.filter((person) => person.id !== personId || person.locked));
  }

  function deleteFamilyTreeNote(noteId: number) {
    setFamilyTreeNotes(familyTreeNotes.filter((note) => note.id !== noteId));
  }

  function addFamilyTreePerson(draft: EventFamilyTreePersonDraft) {
    if (!activePerson) return;
    const name = draft.name.trim();
    if (!name) return;

    const sameLevelPeople = familyTreePeople.filter((person) => person.level === draft.level);
    const nextPerson: EventFamilyTreePerson = {
      id: Date.now(),
      name,
      nickname: draft.nickname.trim(),
      relationType: draft.relationType,
      relationToMama: draft.relationToMama.trim() || "-",
      relationToApu: draft.relationToApu.trim() || "-",
      level: draft.level,
      column: sameLevelPeople.length,
      highlightedFor: draft.highlightedFor,
      createdAt: new Date().toISOString(),
      createdByPersonId: activePerson.id,
      createdByFullName: activePerson.fullName,
      createdByNickname: activePerson.nickname,
      createdByGroupName: activePerson.groupName,
    };

    setFamilyTreePeople([...familyTreePeople, nextPerson]);
  }

  function moveFamilyTreePerson(personId: number, level: EventFamilyTreePerson["level"], column: number) {
    setFamilyTreePeople(familyTreePeople.map((person) => person.id === personId && !person.locked ? {
      ...person,
      level,
      column,
      updatedAt: new Date().toISOString(),
    } : person));
  }

  function applyAiSuggestion() {
    if (!isOrganizer) return;
    setIntro(`Ez az esemény azért készül, hogy a család egy közös, emlékezetes napon együtt ünnepelhessen. ${eventDescription} A cél nem a nagy felhajtás, hanem az együtt töltött idő, a beszélgetés, a közös ebéd, a torta és az, hogy azokkal lehessünk, akik igazán fontosak. Kérlek, jelezz vissza, hogy számíthatunk-e rátok.`);
    setQuote("A közös emlékekből lesznek azok a történetek, amelyeket évekkel később is jó szívvel mesélünk tovább.");
  }


  if (!isUnlocked) {
    return <EventLogin code={code} error={codeError} onCodeChange={setCode} onUnlock={unlock} />;
  }

  if (!activePerson) {
    return (
      <RegistrationGate
        registrations={registrations}
        draft={registrationDraft}
        loginPins={loginPins}
        error={registrationError}
        onDraftChange={setRegistrationDraft}
        onPinChange={(personId, pin) => setLoginPins({ ...loginPins, [personId]: pin })}
        onRegister={registerPerson}
        onLogin={loginPerson}
      />
    );
  }

  if (!responsePerson) {
    return null;
  }

  return (
    <EventShell>
      <EventHero
        eventMode={eventMode}
        intro={intro}
        quote={quote}
        families={summary.families}
        coming={summary.coming}
        people={summary.people}
        mamaPeople={summary.mamaPeople}
        apuPeople={summary.apuPeople}
        allergyCount={summary.allergyCount}
        storageStatus={storageStatus}
        onEventModeChange={setEventMode}
      />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-amber-100 bg-white/90 p-5 shadow-md shadow-amber-100/60">
            <h2 className="text-xl font-black text-slate-800">Aktív válaszadó</h2>
            <p className="mt-1 text-sm text-slate-500">{personDisplayName(activePerson)} néven vagy belépve.</p>
            <button onClick={() => setActivePerson(null)} className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100">Másik személy / új belépés</button>
          </div>
          {isOrganizer && <AiIntroAssistant description={eventDescription} onDescriptionChange={setEventDescription} onApply={applyAiSuggestion} />}
          <FamilyTreePanel people={familyTreePeople} notes={familyTreeNotes} activePerson={activePerson} onAddPerson={addFamilyTreePerson} onMovePerson={moveFamilyTreePerson} onDeletePerson={deleteFamilyTreePerson} onAddNote={addFamilyTreeNote} onDeleteNote={deleteFamilyTreeNote} />
          <EventWall message={message} messages={messages} activePerson={activePerson} onMessageChange={setMessage} onAdd={addMessage} />
          <GuestForm eventMode={eventMode} activePerson={activePerson} responsePerson={responsePerson} editablePeople={editablePeople} canManageGroupResponses={canManageGroupResponses} guest={guest} onResponsePersonChange={setSelectedResponsePersonId} onGuestChange={setGuest} onSave={saveGuest} />
          <VotePanel groups={votes} currentUserName={personDisplayName(activePerson)} currentUserCode={activePerson.pin} isOrganizer={isOrganizer} onGroupsChange={setVotes} />
          <BringList text={bringText} items={bringItems} activePerson={activePerson} onTextChange={setBringText} onAdd={addBringItem} />
          <EventAdminSummary guests={guests} bringItems={bringItems} messages={messages} votes={votes} />
        </div>
        <GuestRosterPanel registrations={registrations} activePerson={activePerson} memberDraft={memberDraft} memberError={memberError} moveGroupError={moveGroupError} onMemberDraftChange={setMemberDraft} onAddMember={addMember} onMoveActivePersonGroup={moveActivePersonGroup} onUpdateActivePersonProfile={updateActivePersonProfile} />
      </div>
    </EventShell>
  );
}
