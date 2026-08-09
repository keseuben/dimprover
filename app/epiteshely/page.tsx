import ModulePlaceholderPage from "@/components/layout/ModulePlaceholderPage";

export default function EpiteshelyPage() {
  return (
    <ModulePlaceholderPage
      moduleId="epiteshely"
      introBadge="Terepi főmodul előkészítve"
      features={[
        { title: "Terepi hibafelvétel", description: "Gyors helyszíni hibarögzítés fotókkal, tervlap-jelöléssel és PDF kimenettel.", status: "mvp" },
        { title: "Hibajegyzék", description: "Élő hibakövető modul státuszokkal, felelőssel, határidővel és értesítéssel.", status: "next" },
        { title: "Terepi állapotrögzítés", description: "Részleges vagy teljes körű állapotfelvétel lefedettségi jelöléssel és fotódokumentációval.", status: "next" },
        { title: "Fotódokumentáció", description: "Projektkapcsolt képfeltöltés, KépBOX kapcsolat, képmetszés és jegyzőkönyv-fotómelléklet.", status: "next" },
        { title: "E-napló előkészítő", description: "Napi jelentés és eseti bejegyzés előkészítése DIMPROVER adatokból.", status: "later" },
        { title: "Kivitelezési heti nézet", description: "Terepi ütemezési nézet mobil/tablet használatra optimalizálva.", status: "later" },
      ]}
      engines={["Projekt", "Terepi jegyzőkönyv", "Hibajegy", "Fotó / KépBOX", "PDF export", "Értesítés", "Audit napló"]}
      nextTitle="Terepi állapotrögzítés előkészítése"
      nextDescription="A hibafelvétel után az Építéshely főmodul következő fontos munkaterülete a terepi állapotrögzítés: rögzített tételek átlaga, lefedettség, fotók és PDF figyelmeztetés."
    />
  );
}
