import type { DriveMetadataOptionKey, DriveMetadataOptions } from "./types";

export const DRIVE_METADATA_OPTION_KEYS: DriveMetadataOptionKey[] = [
  "discipline",
  "documentType",
  "issueStatus",
  "approvalStatus",
  "building",
  "level",
  "zone",
  "topic",
];

export const DEFAULT_DRIVE_METADATA_OPTIONS: DriveMetadataOptions = {
  discipline: [
    "Építészet",
    "Tartószerkezet",
    "Gépészet",
    "Villamosság",
    "Közmű",
    "Technológia",
    "Tűzvédelem",
    "Geodézia",
    "Egyéb",
  ],
  documentType: [
    "Tervlap",
    "Műszaki leírás",
    "Számítás",
    "Költségvetés",
    "Jegyzőkönyv",
    "Fotó",
    "Adatlap",
    "Egyéb",
  ],
  issueStatus: [
    "Munkaközi",
    "Jóváhagyásra",
    "KIV",
    "Tender",
    "Tájékoztatásra",
    "Kiadva",
  ],
  approvalStatus: [
    "Nincs jóváhagyva",
    "Jóváhagyásra vár",
    "Jóváhagyva",
    "Elutasítva",
  ],
  building: [
    "Főépület",
    "Melléképület",
    "Külső létesítmény",
  ],
  level: [
    "Pince",
    "Földszint",
    "1. emelet",
    "2. emelet",
    "Tetőszint",
    "Kültér",
  ],
  zone: [
    "A zóna",
    "B zóna",
    "C zóna",
    "Kültér",
  ],
  topic: [
    "Általános",
    "Szerkezet",
    "Belső kialakítás",
    "Külső munkák",
  ],
};

function normalizedOptionList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value.slice(0, 50)) {
    if (typeof raw !== "string") continue;
    const option = raw.trim().slice(0, 120);
    const key = option.toLocaleLowerCase("hu-HU");
    if (!option || seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }
  return result.length ? result : [...fallback];
}

export function normalizeDriveMetadataOptions(value: unknown): DriveMetadataOptions {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    DRIVE_METADATA_OPTION_KEYS.map((key) => [
      key,
      normalizedOptionList(source[key], DEFAULT_DRIVE_METADATA_OPTIONS[key]),
    ]),
  ) as DriveMetadataOptions;
}
