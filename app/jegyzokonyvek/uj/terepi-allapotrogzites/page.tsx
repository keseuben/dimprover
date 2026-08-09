"use client"

import { useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import FieldStatusCapturePage from "@/components/minutes/field/FieldStatusCapturePage"

export default function FieldStatusCaptureRoutePage() {
  const router = useRouter()

  return (
    <AppLayout>
      <FieldStatusCapturePage onBack={() => router.push("/jegyzokonyvek/uj")} />
    </AppLayout>
  )
}
