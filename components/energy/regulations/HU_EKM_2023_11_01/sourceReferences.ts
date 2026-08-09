import type { EnergyRuleSourceReference } from "@/components/energy/regulations/energyRuleSetTypes";

export const huEkm20231101SourceReferences: EnergyRuleSourceReference[] = [
  {
    id: "HU-EKM-9-2023",
    title: "9/2023. (V. 25.) ÉKM rendelet – 2026-07-29-én ellenőrzött hatályos szöveg",
    publisher: "Nemzeti Jogszabálytár",
    documentVersion: "2026-07-29-én ellenőrzött hatályállapot",
    referenceNote: "A szerkezeti követelmények jogszabályi alapja. A hatályállapotot minden új kiadás előtt ismét ellenőrizni kell.",
    verificationStatus: "verified",
  },
  {
    id: "HU-EKM-9-2023-ANNEX-1",
    title: "9/2023. (V. 25.) ÉKM rendelet 1. melléklet – hőátbocsátási tényező követelmények",
    publisher: "Nemzeti Jogszabálytár",
    documentVersion: "2026-07-29-én ellenőrzött hatályállapot",
    referenceNote: "A v0.7.2 követelményszintjei közvetlenül ebből a táblázatból származnak. Talajjal érintkező szerkezetnél egyenértékű U-érték szükséges.",
    verificationStatus: "verified",
  },
  {
    id: "HU-EM-CALCULATION-METHOD",
    title: "Épületek energetikai jellemzőinek meghatározása – Számítási módszer",
    publisher: "Magyarország Kormánya / illetékes szakmai minisztérium",
    documentDate: "2023-07-27",
    documentVersion: "2023. november 1-jétől alkalmazandó kiadás; 2026-07-29-én ellenőrizve",
    referenceNote: "A hivatalos számítási módszer fejezeteinek és függelékeinek forrása.",
    verificationStatus: "verified",
  },
  {
    id: "HU-EM-CALCULATION-METHOD-APPENDIX-1",
    title: "A számítási módszer 1. függeléke – hőátbocsátási tényező, felületi ellenállások, légréteg és korrekciók",
    publisher: "Magyarország Kormánya / illetékes szakmai minisztérium",
    documentDate: "2023-07-27",
    documentVersion: "2026-07-29-én ellenőrzött hivatalos PDF",
    referenceNote: "A v0.7.2 Rsi/Rse értékei, zárt légréteg-táblája és U-korrekciói ebből a függelékből származnak.",
    verificationStatus: "verified",
  },
  {
    id: "HU-ENERGY-CERTIFICATION-RULES",
    title: "Energetikai tanúsításra vonatkozó hatályos jogszabályi munkafolyamat",
    publisher: "Magyarország jogszabályi nyilvántartása",
    referenceNote: "A hiteles tanúsítói munkafolyamat még külön ellenőrzést és fejlesztési kiadást igényel.",
    verificationStatus: "reviewRequired",
  },
];
