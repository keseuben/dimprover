"use client"

import { useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import NewMinutePage from "@/components/minutes/pages/NewMinutePage"

const minuteTypeRoutes: Record<string, string> = {
  "Terepi hibafelvétel": "/jegyzokonyvek/uj/terepi-hibafelvetel",
  "Terepi állapotrögzítés": "/jegyzokonyvek/uj/terepi-allapotrogzites",
  "Hibajegyzék": "/jegyzokonyvek/hibajegyzek",
  "Kooperációs jegyzőkönyv": "/jegyzokonyvek/uj/kooperacios-jegyzokonyv",
  "Tervezői / megrendelői egyeztetés": "/jegyzokonyvek/uj/tervezoi-megrendeloi-egyeztetes",
  "Beruházói jegyzőkönyv": "/jegyzokonyvek/uj/beruhazoi-jegyzokonyv",
  "Fotódokumentáció / melléklet": "/jegyzokonyvek/uj/foto-melleklet",
  "Műszaki feljegyzés": "/jegyzokonyvek/uj/muszaki-feljegyzes",
}

export default function NewMinuteRoutePage() {
  const router = useRouter()

  return (
    <AppLayout>
      <NewMinutePage
        onBack={() => router.push("/jegyzokonyvek")}
        onSelect={(type) => router.push(minuteTypeRoutes[type] ?? "/jegyzokonyvek/uj/kooperacios-jegyzokonyv")}
      />
    </AppLayout>
  )
}
