// Commercial scenario uses the 7 GiB steps; a test asserts these remain
// exactly aligned with the independent, unpriced AUTH plan catalog.
const USER_SELECTED_DRIVE_SIZES_GIB = [5,10,25,50,100,250,500] as const;

/**
 * 2026-10-11 INTERNAL COMMERCIAL WORKING PAPER ONLY.
 * These are not public prices, live plan tariffs, invoice data or entitlements.
 * FX and storage unit prices are scenario inputs, NOT verified DIMPRO invoices.
 * The public Hetzner 2024 release documented EUR 4.99/TB-month, but live offers
 * may have changed. Backblaze advertises USD 6.95/TB-month in Oct 2026.
 */
export const DEFAULT_PRICING_ASSUMPTIONS = {
  eurHuf: 400,
  usdHuf: 360,
  primaryEurPerTerabyte: 4.99,
  independentBackupUsdPerTerabyte: 6.95,
  oldVersionFactor: 1.4,
  backupRetentionFactor: 1.3,
  personalPlatformOverheadHuf: 800,
  projectPlatformOverheadHuf: 3200,
  riskReserveFraction: 0.25,
} as const;

export type PricingAssumptions = {
  [K in keyof typeof DEFAULT_PRICING_ASSUMPTIONS]: number;
};
export type PricingProduct = "PERSONAL_DRIVE" | "PROJECT_DRIVE" | "PROJECT_GATE";

export type ProposedCommercialTier = {
  id: string;
  product: PricingProduct;
  storageGiB: number | null;
  name: string;
  netMonthlyPriceHuf: number;
  netAnnualPriceHuf: number;
  proposedActiveMembers: number | null;
  proposedReadOnlyGuests: number | null;
  status: "PROPOSAL_ONLY";
};

const PERSONAL_MONTHLY = [1990,2490,3490,4490,5990,9990,14990] as const;
const PROJECT_MONTHLY = [6990,7490,8490,9990,12990,19990,29990] as const;
const ANNUAL_BILLED_MONTHS = 10; // proposed two months' discount, NOT approved

const drafts = (
  product: "PERSONAL_DRIVE" | "PROJECT_DRIVE",
  prices: readonly number[],
): ProposedCommercialTier[] =>
  USER_SELECTED_DRIVE_SIZES_GIB.map((storageGiB,i)=>({
    id:product+"_"+storageGiB+"G",
    product,storageGiB,name:(product==="PERSONAL_DRIVE"?"Saját Drive":"Projekt Drive")+" "+storageGiB+" GiB",
    netMonthlyPriceHuf:prices[i],
    netAnnualPriceHuf:prices[i]*ANNUAL_BILLED_MONTHS,
    // Project Drive editor / guest limits are independent of selected capacity.
    proposedActiveMembers:product==="PERSONAL_DRIVE"?1:10,
    proposedReadOnlyGuests:product==="PERSONAL_DRIVE"?null:50,
    status:"PROPOSAL_ONLY" as const,
  }));

export const PROPOSED_COMMERCIAL_TIERS: readonly ProposedCommercialTier[] = [
  ...drafts("PERSONAL_DRIVE",PERSONAL_MONTHLY),
  ...drafts("PROJECT_DRIVE",PROJECT_MONTHLY),
  {id:"GATE_PROJECT_BASIC",product:"PROJECT_GATE",storageGiB:null,
    name:"Projektkapu Alap",netMonthlyPriceHuf:9990,netAnnualPriceHuf:99900,
    proposedActiveMembers:10,proposedReadOnlyGuests:null,status:"PROPOSAL_ONLY"},
  {id:"GATE_PROJECT_PRO",product:"PROJECT_GATE",storageGiB:null,
    name:"Projektkapu Pro",netMonthlyPriceHuf:24990,netAnnualPriceHuf:249900,
    proposedActiveMembers:25,proposedReadOnlyGuests:null,status:"PROPOSAL_ONLY"},
  {id:"GATE_PROJECT_ENTERPRISE",product:"PROJECT_GATE",storageGiB:null,
    name:"Projektkapu Enterprise",netMonthlyPriceHuf:59990,netAnnualPriceHuf:599900,
    proposedActiveMembers:100,proposedReadOnlyGuests:null,status:"PROPOSAL_ONLY"},
] as const;

export type DriveStorageCostProjection = {
  quotaGiB: number;
  primaryGiB: number;
  backupGiB: number;
  combinedPhysicalGiB: number;
  storageCostHuf: number;
  platformOverheadHuf: number;
  contingencyHuf: number;
  totalEstimatedCostHuf: number;
};

function nonnegative(value:number,name:string){
  if(!Number.isFinite(value)||value<0) throw new Error("INVALID_PRICE_ASSUMPTION_"+name);
  return value;
}

export function estimateDriveStorageCost(
  quotaGiB:number,
  product:"PERSONAL_DRIVE"|"PROJECT_DRIVE",
  assumptions:PricingAssumptions=DEFAULT_PRICING_ASSUMPTIONS,
):DriveStorageCostProjection{
  nonnegative(quotaGiB,"QUOTA");
  if(!(assumptions.oldVersionFactor>=1&&assumptions.backupRetentionFactor>=1))
    throw new Error("INVALID_STORAGE_MULTIPLIER");
  const primaryGiB=quotaGiB*assumptions.oldVersionFactor;
  const backupGiB=primaryGiB*assumptions.backupRetentionFactor;
  // Decimal TB = 1000 GB is used as a conservative simplified planning unit.
  // Provider billing rules/minimums, egress, tax, discounts and GiB-vs-GB
  // differences require a fresh quote and cannot be treated as exact invoices.
  const primaryHufPerGiB=nonnegative(assumptions.primaryEurPerTerabyte,"PRIMARY")*
    nonnegative(assumptions.eurHuf,"EURFX")/1000;
  const backupHufPerGiB=nonnegative(assumptions.independentBackupUsdPerTerabyte,"BACKUP")*
    nonnegative(assumptions.usdHuf,"USDFX")/1000;
  const storageCostHuf=primaryGiB*primaryHufPerGiB+backupGiB*backupHufPerGiB;
  const platformOverheadHuf=nonnegative(product==="PERSONAL_DRIVE"
    ? assumptions.personalPlatformOverheadHuf : assumptions.projectPlatformOverheadHuf,"OVERHEAD");
  const riskReserveFraction=nonnegative(assumptions.riskReserveFraction,"RESERVE");
  const contingencyHuf=(storageCostHuf+platformOverheadHuf)*riskReserveFraction;
  return {
    quotaGiB,primaryGiB,backupGiB,combinedPhysicalGiB:primaryGiB+backupGiB,
    storageCostHuf,platformOverheadHuf,contingencyHuf,
    totalEstimatedCostHuf:storageCostHuf+platformOverheadHuf+contingencyHuf,
  };
}

export function projectProposalMargin(tier:ProposedCommercialTier,assumptions:PricingAssumptions){
  if(tier.storageGiB===null) return null; // Projektkapu workload cost NOT established.
  const costs=estimateDriveStorageCost(tier.storageGiB,tier.product as "PERSONAL_DRIVE"|"PROJECT_DRIVE",assumptions);
  return { ...costs, proposedPriceHuf:tier.netMonthlyPriceHuf,
    estimatedContributionHuf:tier.netMonthlyPriceHuf-costs.totalEstimatedCostHuf,
    estimatedContributionPct:100*(tier.netMonthlyPriceHuf-costs.totalEstimatedCostHuf)/tier.netMonthlyPriceHuf };
}
