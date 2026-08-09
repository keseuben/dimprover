import ModulePlaceholderPage from "@/components/layout/ModulePlaceholderPage";

export default function VallalkozoiMuhelyPage() {
  return (
    <ModulePlaceholderPage
      moduleId="vallalkozoi-muhely"
      introBadge="Kivitelezői főmodul előkészítve"
      features={[
        { title: "Brigádok és munkacsapatok", description: "Saját csapatok, alvállalkozók és napi munkaszervezési egységek kezelése.", status: "mvp" },
        { title: "Munkalapok", description: "Napi/heti munkalap, teljesítés, fotó és felelős személy összekapcsolása.", status: "next" },
        { title: "Anyagigények", description: "Projekt- és munkafázis-alapú anyagigény előkészítés és státuszkövetés.", status: "next" },
        { title: "Eszközök és járművek", description: "Eszköz-, gép- és járműnyilvántartás későbbi kivitelezői workflow-hoz.", status: "later" },
        { title: "Teljesítés és elszámolás", description: "Munkalapokból és teljesítési adatokból készülő elszámolási előkészítő.", status: "later" },
        { title: "Vállalkozói Drive", description: "Korlátozott projektfájl-hozzáférés és saját dokumentumcsomagok.", status: "later" },
      ]}
      engines={["Cég / szervezet", "Feladat", "Munkalap", "Drive", "Értesítés", "Riport", "Audit napló"]}
      nextTitle="Brigád- és munkalapmodell"
      nextDescription="A Vállalkozói Műhely következő alapja a brigád, munkalap és teljesítés adatmodell lesz, közös projekt- és jogosultsági motorral."
    />
  );
}
