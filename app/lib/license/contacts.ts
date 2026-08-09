import type { LicenseRecord } from "./types";

export type LicenseContact = {
  id: string;
  order: number;
  source: "primary" | "secondary" | "additional";
  name: string;
  role: string;
  email: string;
  phone: string;
  receiveEmail: boolean;
};

function clean(value?: string) {
  return value?.trim() ?? "";
}

export function isValidEmail(value: string) {
  const email = value.trim();
  const atIndex = email.indexOf("@");
  return atIndex > 0 && atIndex < email.length - 1 && email.slice(atIndex + 1).includes(".");
}

export function getLicenseContacts(license: LicenseRecord): LicenseContact[] {
  const contacts: LicenseContact[] = [
    {
      id: "primary-contact",
      order: 1,
      source: "primary",
      name: clean(license.contactName),
      role: "Elsődleges kapcsolattartó",
      email: clean(license.contactEmail),
      phone: clean(license.contactPhone),
      receiveEmail: true,
    },
    {
      id: "secondary-contact",
      order: 2,
      source: "secondary",
      name: clean(license.secondaryContactName),
      role: "Másodlagos kapcsolattartó",
      email: clean(license.secondaryContactEmail),
      phone: clean(license.secondaryContactPhone),
      receiveEmail: true,
    },
    ...(license.additionalContacts ?? []).map((contact, index) => ({
      id: contact.id,
      order: index + 3,
      source: "additional" as const,
      name: clean(contact.name),
      role: clean(contact.role) || "További értesítési kapcsolattartó",
      email: clean(contact.email),
      phone: clean(contact.phone),
      receiveEmail: contact.receiveEmail !== false,
    })),
  ];

  return contacts.filter(
    (contact) => contact.name || contact.email || contact.phone || contact.source === "additional",
  );
}

export function getLicenseEmailContacts(license: LicenseRecord): LicenseContact[] {
  const seen = new Set<string>();
  return getLicenseContacts(license).filter((contact) => {
    if (!contact.receiveEmail || !isValidEmail(contact.email)) return false;
    const normalized = contact.email.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function getContactGreetingName(contact: LicenseContact, license: LicenseRecord) {
  return contact.name || license.companyName;
}
