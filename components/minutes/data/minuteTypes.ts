export type MinuteTypeCard = {
  title: string
  description: string
  count: number
  open: number
  icon: string
  actionLabel?: string
  moduleOnly?: boolean
}

export const projectMinuteGroups = [
  "Tervezői / megrendelői egyeztetés",
  "Beruházói jegyzőkönyv",
  "Kooperációs jegyzőkönyv",
  "Terepi állapotrögzítés",
  "Terepi hibafelvétel",
  "Hibajegyzék",
  "Egyéb feljegyzés",
]

export const minuteTypeCards: MinuteTypeCard[] = [
  {
    title: "Tervezői / megrendelői egyeztetés",
    description:
      "Tervi kérdések, megrendelői döntések és módosítási igények rögzítése.",
    count: 8,
    open: 1,
    icon: "📐",
  },
  {
    title: "Beruházói jegyzőkönyv",
    description:
      "Beruházói döntések, költség-, határidő- és teljesítési egyeztetések.",
    count: 12,
    open: 2,
    icon: "🏢",
  },
  {
    title: "Kooperációs jegyzőkönyv",
    description:
      "Heti kooperációk, felelősök, határidők és nyitott feladatok rögzítése.",
    count: 24,
    open: 5,
    icon: "🤝",
  },
  {
    title: "Terepi állapotrögzítés",
    description:
      "Helyszíni állapotok, fotók, készültség és bejárási megállapítások rögzítése.",
    count: 0,
    open: 0,
    icon: "🏗️📸",
  },
  {
    title: "Terepi hibafelvétel",
    description:
      "Helyszíni hibák gyors rögzítése fotóval, felelőssel és tervi HJ jelöléssel.",
    count: 0,
    open: 0,
    icon: "📍📸",
  },
  {
    title: "Hibajegyzék",
    description:
      "Hibák, felelősök, határidők és javítási státuszok követése.",
    count: 18,
    open: 6,
    icon: "⚠️",
    actionLabel: "Hibajegyzék megnyitása →",
    moduleOnly: true,
  },
  {
    title: "Egyéb feljegyzés",
    description:
      "Gyors projektfeljegyzések, belső megjegyzések és egyedi rögzítések.",
    count: 9,
    open: 2,
    icon: "📝",
  },
]
