"use client"

import AppLayout from "@/components/layout/AppLayout"
import IssueRegisterPage from "@/components/minutes/pages/IssueRegisterPage"

export default function IssueRegisterRoutePage() {
  return (
    <AppLayout>
      <IssueRegisterPage
        onBack={() => {
          window.location.href = "/jegyzokonyvek"
        }}
      />
    </AppLayout>
  )
}
