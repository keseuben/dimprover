export type EventMode = "together" | "separate";

export type EventGuestStatus = "jovunk" | "kerdeses" | "nem";

export type EventGuestPreference = "mindketto" | "mama" | "apu" | "egyik_sem";

export type EventPersonRole = "organizer" | "captain" | "guest";

export type EventPerson = {
  id: number;
  fullName: string;
  nickname: string;
  groupName: string;
  email: string;
  phone: string;
  pin: string;
  role: EventPersonRole;
  parentPersonId?: number;
  createdByPersonId?: number;
  createdAt: string;
};

export type EventPersonDraft = {
  fullName: string;
  nickname: string;
  groupName: string;
  email: string;
  phone: string;
  pin: string;
};

export type EventGuest = {
  id: number;
  personId?: number;
  responderName: string;
  responderCode: string;
  fullName?: string;
  nickname?: string;
  groupName?: string;
  name: string;
  phone: string;
  email: string;
  status: EventGuestStatus;
  eventPreference: EventGuestPreference;
  count: string;
  guestNames: string;
  guestMembers: string[];
  allergy: string;
  note: string;
};

export type EventVoteGroup = {
  title: string;
  options: string[];
  votes: number[];
  voters?: string[][];
};

export type EventBringItem = {
  id: number;
  text: string;
  owner: string;
  ownerCode: string;
  ownerPersonId?: number;
  ownerFullName?: string;
  ownerNickname?: string;
  ownerGroupName?: string;
  createdAt?: string;
};

export type EventMessageItem = {
  id: number;
  text: string;
  owner: string;
  ownerCode: string;
  ownerPersonId?: number;
  ownerFullName?: string;
  ownerNickname?: string;
  ownerGroupName?: string;
};

export type EventFamilyTreeNote = {
  id: number;
  text: string;
  owner: string;
  ownerPersonId?: number;
  ownerFullName?: string;
  ownerNickname?: string;
  ownerGroupName?: string;
  createdAt?: string;
};


export type EventFamilyTreeViewMode = "mama" | "apu";

export type EventFamilyTreeLevel = "ancestor" | "center" | "descendant";

export type EventFamilyTreeRelationType = "felmeno" | "szulo" | "hazastars" | "gyermek" | "testver" | "unoka" | "rokon" | "egyeb";

export type EventFamilyTreePerson = {
  id: number;
  name: string;
  nickname: string;
  relationType: EventFamilyTreeRelationType;
  relationToMama: string;
  relationToApu: string;
  level: EventFamilyTreeLevel;
  column: number;
  highlightedFor: EventFamilyTreeViewMode | "both";
  locked?: boolean;
  createdAt: string;
  createdByPersonId?: number;
  createdByFullName?: string;
  createdByNickname?: string;
  createdByGroupName?: string;
  updatedAt?: string;
};

export type EventFamilyTreePersonDraft = {
  name: string;
  nickname: string;
  relationType: EventFamilyTreeRelationType;
  relationToMama: string;
  relationToApu: string;
  level: EventFamilyTreeLevel;
  highlightedFor: EventFamilyTreeViewMode | "both";
};
