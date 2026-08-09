export const DIMPRO_LICENSE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function currentDimproLicenseYear() {
  return String(new Date().getFullYear()).slice(-2);
}

function cleanSuffix(value: string) {
  const allowed = new Set(DIMPRO_LICENSE_CODE_ALPHABET.split(""));
  return value
    .toUpperCase()
    .normalize("NFKC")
    .split("")
    .filter((char) => allowed.has(char))
    .join("")
    .slice(0, 8);
}

/**
 * Gépelés közbeni, nem agresszív normalizálás.
 * Nem szúr be automatikusan előtagot vagy kötőjeleket, így a teljes
 * LIC-ÉÉ-XXXX-XXXX kód kényelmesen begépelhető vagy beilleszthető.
 */
export function normalizeDimproLicenseCodeInput(value: string) {
  return value
    .toUpperCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);
}

/**
 * Kilépéskor / beillesztés után szabványos formára hozza a kódot.
 * Elfogad teljes kódot (LIC-26-ABCD-2345), kötőjel nélküli teljes kódot
 * (LIC26ABCD2345), illetve csak a nyolc karakteres suffixet (ABCD2345).
 */
export function formatDimproLicenseCodeInput(value: string, year = currentDimproLicenseYear()) {
  const upper = normalizeDimproLicenseCodeInput(value);
  let compact = upper.replace(/[^A-Z0-9]/g, "");

  if (compact.startsWith("LIC")) compact = compact.slice(3);
  if (/^[0-9]{2}/.test(compact)) compact = compact.slice(2);

  const suffix = cleanSuffix(compact);
  if (!suffix) return "";

  const first = suffix.slice(0, 4);
  const second = suffix.slice(4, 8);
  return `LIC-${year}-${first}${second ? `-${second}` : ""}`;
}

export function isValidDimproLicenseCode(value: string) {
  return /^LIC-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(
    value.trim().toUpperCase(),
  );
}
