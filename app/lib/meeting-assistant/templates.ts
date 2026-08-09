import type { MeetingAgendaItem, MeetingAgendaTemplateKey } from "./types";

export type MeetingAgendaTemplate = {
  key: MeetingAgendaTemplateKey;
  label: string;
  description: string;
  meetingType: string;
  meetingTypeCode: string;
  items: string[];
};

const JOKER_TITLE = "Egyéb felmerülő témák / Joker pont";

export const MEETING_AGENDA_TEMPLATES: MeetingAgendaTemplate[] = [
  {
    key: "general",
    label: "Általános egyeztetés",
    description: "Általános egyeztetéshez használható rövid alapminta.",
    meetingType: "Általános egyeztetés",
    meetingTypeCode: "ÁLT",
    items: [
      "Jelenlévők",
      "Előzmények / előző egyeztetés",
      "Nyitott feladatok",
      "Aktuális kérdések",
      "Határidők és felelősök",
      "Következő lépések",
    ],
  },
  {
    key: "quick_general",
    label: "Gyors egyeztetés – szabad témakörök",
    description: "Egyetlen szabad Joker pont, amelyben menet közben egymás után rögzíthetők a felmerülő témák. Hivatalos kategóriakódja ÁLT.",
    meetingType: "Általános egyeztetés",
    meetingTypeCode: "ÁLT",
    items: [JOKER_TITLE],
  },
  {
    key: "weekly_coordination",
    label: "Heti kooperáció",
    description: "Építési heti kooperáció, kivitelezési állapot és feladatkövetés.",
    meetingType: "Heti kooperáció",
    meetingTypeCode: "KOOP",
    items: [
      "Jelenlévők és meghívottak",
      "Előző jegyzőkönyv nyitott pontjai",
      "Kivitelezési állapot és készültség",
      "Tervek és adatszolgáltatások",
      "Minőség, hibák és eltérések",
      "Határidők és felelősök",
      "Költség, pótmunka és változások",
      "Munkavédelem és organizáció",
      "Következő hét feladatai",
    ],
  },
  {
    key: "design_coordination",
    label: "Tervezői egyeztetés",
    description: "Szakági tervkérdések, ütközések, jóváhagyások és adatszolgáltatások.",
    meetingType: "Tervezői egyeztetés",
    meetingTypeCode: "TERV",
    items: [
      "Jelenlévők",
      "Előző egyeztetés nyitott pontjai",
      "Építészeti tervkérdések",
      "Szakági tervkérdések és ütközések",
      "Megrendelői döntések és jóváhagyások",
      "Hiányzó adatszolgáltatások",
      "Tervszállítási határidők",
      "Felelősök és következő lépések",
    ],
  },
  {
    key: "technical_inspection",
    label: "Műszaki ellenőri bejárás",
    description: "Helyszíni műszaki ellenőrzés, minőség, dokumentáció és intézkedések.",
    meetingType: "Műszaki ellenőri bejárás",
    meetingTypeCode: "MEB",
    items: [
      "Jelenlévők",
      "Bejárás célja és érintett területek",
      "Elvégzett munkák műszaki állapota",
      "Minőségi és technológiai észrevételek",
      "Tervtől vagy előírástól való eltérések",
      "Beépített anyagok és dokumentumok",
      "Hibák, hiányok és intézkedések",
      "Határidők, felelősök és visszaellenőrzés",
    ],
  },
  {
    key: "defect_review",
    label: "Hiba- és hiányegyeztetés",
    description: "Nyitott hibák, javítások, visszaellenőrzések és új feladatok kezelése.",
    meetingType: "Hiba- és hiányegyeztetés",
    meetingTypeCode: "HIBA",
    items: [
      "Jelenlévők",
      "Előző hibalista nyitott tételei",
      "Elvégzett javítások ellenőrzése",
      "Új hibák és hiányok",
      "Fotók és tervi hivatkozások",
      "Javítási módok és felelősök",
      "Javítási határidők",
      "Következő visszaellenőrzés",
    ],
  },
  {
    key: "handover",
    label: "Műszaki átadás-átvétel",
    description: "Átadási dokumentumok, műszaki állapot, hiányok és lezárási feladatok.",
    meetingType: "Műszaki átadás-átvétel",
    meetingTypeCode: "ATADAS",
    items: [
      "Jelenlévők és jogosultságok",
      "Átadási dokumentumok ellenőrzése",
      "Megvalósult műszaki állapot",
      "Próbaüzemek és mérési jegyzőkönyvek",
      "Hibák, hiányok és fenntartások",
      "Kezelési oktatás, kulcsok és hozzáférések",
      "Hiánypótlási határidők és felelősök",
      "Átadás-átvételi nyilatkozatok",
    ],
  },
];

export function getMeetingAgendaTemplate(key: string | null | undefined) {
  return MEETING_AGENDA_TEMPLATES.find((item) => item.key === key) || MEETING_AGENDA_TEMPLATES[0];
}

export function createAgendaContentDefaults(title: string, now = new Date().toISOString()) {
  return {
    description: `${title} témakör céljának, előzményeinek és szükséges döntési pontjainak rövid rögzítése.`,
    discussionNotes: "Az egyeztetés során az alábbiak kerültek megtárgyalásra:\n",
    decisionSummary: "Döntés / megállapodás:\n",
    openQuestions: "Nyitott kérdések:\n",
    privateNotes: "",
    updatedAt: now,
    updatedBy: "Rendszer",
  };
}

export function createAgendaFromTemplate(
  key: MeetingAgendaTemplateKey,
  createId: (index: number) => string,
): MeetingAgendaItem[] {
  const now = new Date().toISOString();
  const template = getMeetingAgendaTemplate(key);
  const titles = template.key === "quick_general"
    ? template.items
    : [...template.items, ...(template.items.includes(JOKER_TITLE) ? [] : [JOKER_TITLE])];

  return titles.map((title, index) => ({
    id: createId(index),
    order: index + 1,
    title,
    ...createAgendaContentDefaults(title, now),
    completed: false,
    shared: true,
    isJoker: title === JOKER_TITLE,
    topicBlocks: [],
  }));
}
