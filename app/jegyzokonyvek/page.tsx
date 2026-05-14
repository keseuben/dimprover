"use client"
import { useState } from "react"
import AppLayout from "@/components/layout/AppLayout"
import MinuteTypeSelectorModal from "@/components/minutes/modals/MinuteTypeSelectorModal"
import MinutesListPage from "@/components/minutes/pages/MinutesListPage"
import EditorPage from "@/components/minutes/pages/EditorPage"

export default function DimproJegyzokonyvPage() {
  const [view, setView] = useState<"list" | "editor">("list")
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [selectedMinuteType, setSelectedMinuteType] = useState("Helyszíni jegyzőkönyv")

  return (
    <AppLayout>
      {view === "list" ? (
        <MinutesListPage
          onOpenEditor={() => setView("editor")}
          onOpenTypeSelector={() => setShowTypeSelector(true)}
        />
      ) : (
        <EditorPage
          onBack={() => setView("list")}
          selectedMinuteType={selectedMinuteType}
        />
      )}

      {showTypeSelector && (
        <MinuteTypeSelectorModal
          onClose={() => setShowTypeSelector(false)}
          onSelect={(type) => {
            setSelectedMinuteType(type)
            setShowTypeSelector(false)
            setView("editor")
          }}
        />
      )}
    </AppLayout>
  )
}