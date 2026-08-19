import { compareDecimal, normalizeQuantity, subtractDecimal, type DecimalString } from "../core/decimal";

export type InventoryQuantitySet = {
  physicalQuantity: DecimalString;
  reservedQuantity: DecimalString;
  availableQuantity: DecimalString;
  incomingQuantity: DecimalString;
};

export function calculateInventoryQuantities(input: {
  physicalQuantity: DecimalString;
  reservedQuantity: DecimalString;
  incomingQuantity?: DecimalString;
  allowNegativeAvailable?: boolean;
}): InventoryQuantitySet {
  const physicalQuantity = normalizeQuantity(input.physicalQuantity);
  const reservedQuantity = normalizeQuantity(input.reservedQuantity);
  const incomingQuantity = normalizeQuantity(input.incomingQuantity ?? "0");
  if (compareDecimal(physicalQuantity, "0") < 0) throw new Error("Physical inventory cannot be negative.");
  if (compareDecimal(reservedQuantity, "0") < 0) throw new Error("Reserved inventory cannot be negative.");
  if (compareDecimal(incomingQuantity, "0") < 0) throw new Error("Incoming inventory cannot be negative.");
  const availableQuantity = subtractDecimal(physicalQuantity, reservedQuantity);
  if (!input.allowNegativeAvailable && compareDecimal(availableQuantity, "0") < 0) {
    throw new Error("Reserved inventory exceeds physical inventory.");
  }
  return { physicalQuantity, reservedQuantity, availableQuantity, incomingQuantity };
}
