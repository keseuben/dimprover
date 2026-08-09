import ModulePlaceholderPage from "@/components/layout/ModulePlaceholderPage";

export default function UzemeltetesPage() {
  return (
    <ModulePlaceholderPage
      moduleId="uzemeltetes"
      introBadge="Üzemeltetési főmodul előkészítve"
      features={[
        { title: "Létesítmény nyilvántartás", description: "Átadás utáni épület/létesítmény alapadatok és dokumentumkapcsolatok.", status: "mvp" },
        { title: "Garanciális hibák", description: "Garanciális bejelentések, javítási státuszok és határidők követése.", status: "next" },
        { title: "Karbantartási tervek", description: "Időszakos ellenőrzések, karbantartási ütemtervek és felelősök kezelése.", status: "next" },
        { title: "Bejelentések", description: "Felhasználói/létesítményi hibabejelentések fogadása és feldolgozása.", status: "later" },
        { title: "Üzemeltetési dokumentumok", description: "Átadási dokumentációk, gépkönyvek és karbantartási jegyzőkönyvek kezelése.", status: "later" },
        { title: "Felülvizsgálatok", description: "Kötelező és belső időszakos vizsgálatok nyilvántartása.", status: "later" },
      ]}
      engines={["Létesítmény", "Dokumentum", "Hibabejelentés", "Ütemterv", "Értesítés", "PDF riport", "Audit napló"]}
      nextTitle="Létesítmény-alapú adatmodell"
      nextDescription="Az Üzemeltetés főmodul projekt utáni életciklust kezel. A következő lépés a létesítmény, garancia és karbantartási alapmodell kialakítása."
    />
  );
}
