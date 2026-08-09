"use client"

import { useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import FieldMinutePage from "@/components/minutes/field/FieldMinutePage"

export default function FieldMinuteRoutePage() {
  const router = useRouter()

  return (
    <AppLayout>
      <FieldMinutePage onBack={() => router.push("/jegyzokonyvek/uj")} />
    </AppLayout>
  )
}
