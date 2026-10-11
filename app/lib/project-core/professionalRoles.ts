/** Construction-specific membership descriptors. They NEVER grant any permission.
 * Project Core access role and folder/document ACL are the only authorization authority.
 */
export const PROJECT_PROFESSIONAL_ROLES = {
  INVESTOR: "Beruházó",
  CLIENT: "Megrendelő",
  INVESTMENT_MANAGER: "Beruházáslebonyolító",
  TECHNICAL_INSPECTOR: "Műszaki ellenőr",
  GENERAL_DESIGNER: "Generáltervező",
  DISCIPLINE_DESIGNER: "Szakági tervező",
  PROJECT_MANAGER_ENGINEER: "Projektvezető mérnök",
  GENERAL_CONTRACTOR: "Generálkivitelező",
  RESPONSIBLE_SITE_MANAGER: "Felelős műszaki vezető",
  SPECIALIST_CONTRACTOR: "Szakági kivitelező",
  SUPPLIER: "Beszállító",
  OTHER_PARTICIPANT: "Egyéb projektrésztvevő",
} as const;

export type ProfessionalRoleCode = keyof typeof PROJECT_PROFESSIONAL_ROLES;
const known=new Set<string>(Object.keys(PROJECT_PROFESSIONAL_ROLES));

export function normalizeProfessionalRoles(input:unknown):ProfessionalRoleCode[] {
  if (!Array.isArray(input) || input.length > 8 || input.some((r)=>typeof r!=="string" || !known.has(r))) {
    throw new Error("DRIVE_PROFESSIONAL_ROLE_INVALID");
  }
  return [...new Set(input)] as ProfessionalRoleCode[];
}
