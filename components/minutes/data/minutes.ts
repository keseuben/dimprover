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
    title: "FMV kooperáció – 19. hét",
    type: "Kooperációs jegyzőkönyv",
    date: "2026.05.10.",
    creator: "Nagy Péter",
    status: "Végleges",
    project: "Metrodom Park",
  },

  {
    id: "T-JKV-001",
    title: "Tervezői egyeztetés – módosított alaprajz",
    type: "Tervezői jegyzőkönyv",
    date: "2026.05.09.",
    creator: "Tóth Gábor",
    status: "Folyamatban",
    project: "Metrodom Park",
  },

  {
    id: "H-JKV-001",
    title: "Helyszíni bejárás – szerkezetkész állapot",
    type: "Helyszíni jegyzőkönyv",
    date: "2026.05.08.",
    creator: "Kovács István",
    status: "Vázlat",
    project: "Metrodom Park",
  },

  {
    id: "FELJ-001",
    title: "Telefonos egyeztetés – kivitelező",
    type: "Egyéb feljegyzések",
    date: "2026.05.07.",
    creator: "Kovács István",
    status: "Vázlat",
    project: "Metrodom Park",
  },

  {
    id: "HIBA-001",
    title: "Hibajegyzék – közös területek",
    type: "Hibajegyzék",
    date: "2026.05.06.",
    creator: "Szabó Anna",
    status: "Folyamatban",
    project: "Metrodom Park",
  },

  {
    id: "FOTO-001",
    title: "Fotós melléklet – homlokzati javítások",
    type: "Fotós melléklet",
    date: "2026.05.05.",
    creator: "Kovács István",
    status: "Archivált",
    project: "Metrodom Park",
  },
]

export const projectMinutes: MinuteItem[] = [
  {
    id: "B-JKV-001",
    title: "Beruházói egyeztetés – költségkeret",
    type: "Beruházói jegyzőkönyv",
    date: "2026.05.10.",
    creator: "Kovács István",
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
    title: "FMV kooperáció – 19. hét",
    type: "Kooperációs jegyzőkönyv",
    date: "2026.05.08.",
    creator: "Nagy Péter",
    status: "Végleges",
  },

  {
    id: "T-JKV-001",
    title: "Tervezői egyeztetés – módosított alaprajz",
    type: "Tervezői jegyzőkönyv",
    date: "2026.05.03.",
    creator: "Tóth Gábor",
    status: "Végleges",
  },

  {
    id: "H-JKV-001",
    title: "Helyszíni bejárás – szerkezetkész állapot",
    type: "Helyszíni jegyzőkönyv",
    date: "2026.05.10.",
    creator: "Kovács István",
    status: "Vázlat",
  },

  {
    id: "HIBA-001",
    title: "Hibajegyzék – közös területek",
    type: "Hibajegyzék",
    date: "2026.05.06.",
    creator: "Szabó Anna",
    status: "Folyamatban",
  },

  {
    id: "FELJ-001",
    title: "Telefonos egyeztetés – kivitelező",
    type: "Egyéb feljegyzések",
    date: "2026.05.09.",
    creator: "Kovács István",
    status: "Vázlat",
  },

  {
    id: "FOTO-001",
    title: "Fotós melléklet – homlokzati javítások",
    type: "Fotós melléklet",
    date: "2026.04.30.",
    creator: "Kovács István",
    status: "Archivált",
  },
]