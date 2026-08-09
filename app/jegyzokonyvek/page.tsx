"use client"

import { useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import MinutesListPage from "@/components/minutes/pages/MinutesListPage"

export default function DimproJegyzokonyvPage() {
  const router = useRouter()

  return (
    <AppLayout>
      <MinutesListPage
        onOpenEditor={() => router.push("/jegyzokonyvek/uj/kooperacios-jegyzokonyv")}
        onOpenTypeSelector={() => router.push("/jegyzokonyvek/uj")}
      />
    </AppLayout>
  )
}
