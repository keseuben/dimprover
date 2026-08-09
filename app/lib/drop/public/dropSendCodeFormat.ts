export const DROP_SEND_CODE_PLACEHOLDER = "____-___-___";
export const DROP_SEND_CODE_COMPACT_LENGTH = 10;

export function normalizeDropSendCode(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, DROP_SEND_CODE_COMPACT_LENGTH);
}

export function isLegacyDropSendCode(value: unknown) {
  return /^\d{6}$/.test(normalizeDropSendCode(value));
}

export function isModernDropSendCode(value: unknown) {
  return /^[A-Z]{4}\d{6}$/.test(normalizeDropSendCode(value));
}

export function isCompleteDropSendCode(value: unknown) {
  return isLegacyDropSendCode(value) || isModernDropSendCode(value);
}

export function formatDropSendCode(value: unknown) {
  const compact = normalizeDropSendCode(value);
  if (/^\d/.test(compact)) {
    if (compact.length <= 3) return compact;
    return `${compact.slice(0, 3)}-${compact.slice(3, 6)}`;
  }
  const letters = compact.slice(0, 4).replace(/[^A-Z]/g, "");
  const digits = compact.slice(4).replace(/\D/g, "").slice(0, 6);
  const blocks = [letters];
  if (digits.length) blocks.push(digits.slice(0, 3));
  if (digits.length > 3) blocks.push(digits.slice(3, 6));
  return blocks.filter(Boolean).join("-");
}

export function normalizeModernDropSendInput(value: unknown) {
  const compact = normalizeDropSendCode(value);
  const letters = compact.slice(0, 4).replace(/[^A-Z]/g, "");
  const digits = compact.slice(4).replace(/\D/g, "").slice(0, 6);
  return `${letters}${digits}`;
}
