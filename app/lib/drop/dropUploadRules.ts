export const DROP_UPLOAD_RULES_VERSION = "DIMPRO-DROP-UPLOAD-HU-1.0";
export const DROP_UPLOAD_RULES_EFFECTIVE_DATE = "2026-08-02";
export const DROP_UPLOAD_RULES_MAX_FILE_BYTES = 500 * 1024 * 1024;
export const DROP_UPLOAD_RULES_CHUNK_BYTES = 64 * 1024 * 1024;
export const DROP_UPLOAD_RULES_RESUME_HOURS = 24;
export const DROP_UPLOAD_RULES_ACCEPTANCE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const DROP_UPLOAD_RULES_ACCEPTANCE_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const DROP_UPLOAD_ALLOWED_GROUPS = [
  "Dokumentumok: PDF, DOC/DOCX, XLS/XLSX/XLSM, CSV, TXT, RTF, ODT/ODS és PPT/PPTX.",
  "Képek: JPG/JPEG, PNG, WEBP, HEIC/HEIF, TIFF, BMP, GIF és ICO.",
  "Mérnöki állományok: DWG, DXF, IFC/IFCZIP és BCF/BCFZIP.",
  "Egyéb engedélyezett fájlok: ZIP, XML, JSON, EML és MSG.",
] as const;

export const DROP_UPLOAD_RULE_ITEMS = [
  "Egy fájl maximális mérete 500 MB. A csomag és a Drop tér ennél alacsonyabb szabad tárhelykerete további korlátot jelenthet.",
  "A nagy fájlok 64 MB-os részekben töltődnek fel. Megszakadás után ugyanazon fájl újbóli kiválasztásával a rendszer a hiányzó részekkel folytatja.",
  "A folytathatóság legfeljebb 24 óráig él, de a meghívólink vagy a csomag korábbi lejárata ezt lerövidítheti.",
  "Végrehajtható, script jellegű, veszélyes vagy az engedélyezett listán nem szereplő fájl nem tölthető fel.",
  "A ZIP és ZIP-alapú dokumentumok szerkezeti ellenőrzésen mennek át. Legfeljebb 5000 bejegyzés, 2 GB kibontott méret és 100-szoros tömörítési arány engedélyezett.",
  "A feltöltött fájl SHA-256-, MIME-, kiterjesztés- és ZIP-ellenőrzés után privát karanténba kerül.",
  "Vírusellenőrzés és biztonsági jóváhagyás előtt a fájl nem tölthető le és nem tekinthető végleges, biztonságos állománynak.",
  "A feltöltött fájl a csomaghoz beállított megőrzési idő, lezárási és törlési szabályok szerint kezelhető vagy törölhető.",
  "Csak olyan fájl tölthető fel, amelynek továbbítására a feltöltő jogosult. Személyes, üzleti vagy bizalmas adat csak jogszerű projektcélból kerülhet a rendszerbe.",
] as const;

export type DropUploadRulesAcceptance = {
  version: typeof DROP_UPLOAD_RULES_VERSION;
  acceptedAt: string;
};

function rulesError(message: string, code: string) {
  const error = new Error(message);
  Object.assign(error, { code, status: 400 });
  return error;
}

export function isDropUploadRulesAcceptanceFresh(input: {
  version?: string | null;
  acceptedAt?: string | null;
  nowMs?: number;
}) {
  if ((input.version || "").trim() !== DROP_UPLOAD_RULES_VERSION) return false;
  const acceptedTime = new Date(input.acceptedAt || "").getTime();
  const now = input.nowMs ?? Date.now();
  return Number.isFinite(acceptedTime)
    && acceptedTime <= now + DROP_UPLOAD_RULES_ACCEPTANCE_FUTURE_SKEW_MS
    && acceptedTime >= now - DROP_UPLOAD_RULES_ACCEPTANCE_MAX_AGE_MS;
}

export function validateDropUploadRulesAcceptance(input: unknown): DropUploadRulesAcceptance {
  const value = input as Record<string, unknown> | null;
  const accepted = value?.rulesAccepted === true;
  const version = String(value?.rulesVersion || "").trim();
  const acceptedAt = String(value?.rulesAcceptedAt || "").trim();
  if (!accepted) {
    throw rulesError("A feltöltés előtt el kell fogadni a feltöltési szabályokat.", "DROP_UPLOAD_RULES_NOT_ACCEPTED");
  }
  if (version !== DROP_UPLOAD_RULES_VERSION) {
    throw rulesError("A feltöltési szabályzat verziója elavult. Frissítsd az oldalt és fogadd el az aktuális szabályokat.", "DROP_UPLOAD_RULES_VERSION_MISMATCH");
  }
  if (!isDropUploadRulesAcceptanceFresh({ version, acceptedAt })) {
    throw rulesError("A feltöltési szabályzat elfogadási időpontja érvénytelen vagy lejárt.", "DROP_UPLOAD_RULES_ACCEPTANCE_EXPIRED");
  }
  return { version: DROP_UPLOAD_RULES_VERSION, acceptedAt: new Date(acceptedAt).toISOString() };
}
