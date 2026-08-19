export type DecimalString = string;

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

function parse(value: DecimalString, scale: number) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) {
    throw new Error("Commerce decimal scale must be an integer between 0 and 12.");
  }
  const normalized = value.trim();
  const match = DECIMAL_PATTERN.exec(normalized);
  if (!match) throw new Error(`Invalid commerce decimal: ${value}`);
  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > scale) {
    throw new Error(`Commerce decimal ${value} exceeds scale ${scale}.`);
  }
  const padded = fraction.padEnd(scale, "0");
  const magnitude = BigInt(`${whole}${padded}` || "0");
  return sign === "-" ? -magnitude : magnitude;
}

function format(value: bigint, scale: number): DecimalString {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const raw = absolute.toString().padStart(scale + 1, "0");
  if (scale === 0) return `${negative ? "-" : ""}${raw}`;
  const whole = raw.slice(0, -scale) || "0";
  const fraction = raw.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function normalizeDecimal(value: DecimalString, scale = 6): DecimalString {
  return format(parse(value, scale), scale);
}

export function addDecimal(left: DecimalString, right: DecimalString, scale = 6): DecimalString {
  return format(parse(left, scale) + parse(right, scale), scale);
}

export function subtractDecimal(left: DecimalString, right: DecimalString, scale = 6): DecimalString {
  return format(parse(left, scale) - parse(right, scale), scale);
}

export function compareDecimal(left: DecimalString, right: DecimalString, scale = 6) {
  const a = parse(left, scale);
  const b = parse(right, scale);
  return a === b ? 0 : a > b ? 1 : -1;
}

function assertPrecision(value: DecimalString, precision: number, scale: number) {
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  const [whole = "0"] = unsigned.split(".");
  const significantWhole = whole.replace(/^0+/, "") || "0";
  if (significantWhole.length > precision - scale) {
    throw new Error(`Commerce decimal ${value} exceeds precision ${precision}, scale ${scale}.`);
  }
}

export function normalizeQuantity(value: DecimalString): DecimalString {
  const normalized = normalizeDecimal(value, 6);
  assertPrecision(normalized, 19, 6);
  return normalized;
}

export function normalizeMoney(value: DecimalString): DecimalString {
  const normalized = normalizeDecimal(value, 4);
  assertPrecision(normalized, 19, 4);
  return normalized;
}
