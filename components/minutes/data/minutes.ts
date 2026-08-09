export type MinuteItem = {
  id: string
  title: string
  type: string
  date: string
  creator: string
  status: string
  project?: string
}

export const recentMinutes: MinuteItem[] = [
  {
    id: "TM-EGY-002",
    title: "Tervi kérdések – módosított alaprajzi döntések",
    type: "Tervezői / megrendelői egyeztetés",
    date: "2026.05.11.",
    creator: "Tóth Gábor",
    status: "Folyamatban",
    project: "Metrodom Park",
  },
  {
    id: "B-JKV-002",
    title: "Beruházói döntés – homlokzati anyagok",
    type: "Beruházói jegyzőkönyv",
    date: "2026.05.11.",
    creator: "Kovács István",
    status: "Végleges",
    project: "Metrodom Park",
  },
  {
    id: "K-JKV-001",
    title: "Heti kooperáció – 19. hét",
    type: "Kooperációs jegyzőkönyv",
    date: "2026.05.10.",
    creator: "Nagy Péter",
    status: "Végleges",
    project: "Metrodom Park",
  },
  {
    id: "TA-001",
    title: "Terepi állapot – szerkezetkész bejárás",
    type: "Terepi állapotrögzítés",
    date: "2026.05.08.",
    creator: "Kovács István",
    status: "Vázlat",
    project: "Metrodom Park",
  },
  {
    id: "HJ-001",
    title: "Sérült burkolati él – A épület földszint",
    type: "Terepi hibafelvétel",
    date: "2026.05.07.",
    creator: "Kovács István",
    status: "Új",
    project: "Metrodom Park",
  },
  {
    id: "HIBA-LIVE-001",
    title: "Hibajegyzék – közös területek élő követése",
    type: "Hibajegyzék",
    date: "2026.05.06.",
    creator: "Szabó Anna",
    status: "Folyamatban",
    project: "Metrodom Park",
  },
  {
    id: "FELJ-001",
    title: "Telefonos egyeztetés – kivitelező",
    type: "Egyéb feljegyzés",
    date: "2026.05.05.",
    creator: "Kovács István",
    status: "Vázlat",
    project: "Metrodom Park",
  },
]

export const projectMinutes: MinuteItem[] = [
  {
    id: "TM-EGY-001",
    title: "Tervezői / megrendelői egyeztetés – költségkeret",
    type: "Tervezői / megrendelői egyeztetés",
    date: "2026.05.10.",
    creator: "Tóth Gábor",
    status: "Vázlat",
  },
  {
    id: "B-JKV-002",
    title: "Beruházói döntés – homlokzati anyagok",
    type: "Beruházói jegyzőkönyv",
    date: "2026.05.07.",
    creator: "Kovács István",
    status: "Végleges",
  },
  {
    id: "K-JKV-001",
    title: "Heti kooperáció – 19. hét",
    type: "Kooperációs jegyzőkönyv",
    date: "2026.05.08.",
    creator: "Nagy Péter",
    status: "Végleges",
  },
  {
    id: "TA-001",
    title: "Terepi állapot – szerkezetkész bejárás",
    type: "Terepi állapotrögzítés",
    date: "2026.05.10.",
    creator: "Kovács István",
    status: "Vázlat",
  },
  {
    id: "HJ-001",
    title: "Sérült burkolati él – A épület földszint",
    type: "Terepi hibafelvétel",
    date: "2026.05.09.",
    creator: "Kovács István",
    status: "Új",
  },
  {
    id: "HIBA-LIVE-001",
    title: "Hibajegyzék – közös területek élő követése",
    type: "Hibajegyzék",
    date: "2026.05.06.",
    creator: "Szabó Anna",
    status: "Folyamatban",
  },
  {
    id: "FELJ-001",
    title: "Telefonos egyeztetés – kivitelező",
    type: "Egyéb feljegyzés",
    date: "2026.05.09.",
    creator: "Kovács István",
    status: "Vázlat",
  },
]
