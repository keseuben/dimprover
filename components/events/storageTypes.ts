import type { EventBringItem, EventFamilyTreeNote, EventFamilyTreePerson, EventGuest, EventMessageItem, EventMode, EventPerson, EventVoteGroup } from "./types";

export type EventStoredData = {
  eventMode: EventMode;
  registrations: EventPerson[];
  guests: EventGuest[];
  votes: EventVoteGroup[];
  bringItems: EventBringItem[];
  messages: EventMessageItem[];
  familyTreeNotes: EventFamilyTreeNote[];
  familyTreePeople: EventFamilyTreePerson[];
  intro: string;
  quote: string;
  updatedAt: string;
};