"use client"

import { useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import EditorPage from "@/components/minutes/pages/EditorPage"

export default function EditorMinuteRoutePage() {
  const router = useRouter()

  return (
    <AppLayout>
      <EditorPage onBack={() => router.push("/jegyzokonyvek/uj")} selectedMinuteType="Tervezői / megrendelői egyeztetés" />
    </AppLayout>
  )
}
