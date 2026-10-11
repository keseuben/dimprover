import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 DEFAULT_PRICING_ASSUMPTIONS, PROPOSED_COMMERCIAL_TIERS,
 estimateDriveStorageCost,projectProposalMargin,
} from "../../app/lib/license/pricingProposalV1.ts";
import {INITIAL_LICENSE_PLAN_DRAFTS,USER_SELECTED_DRIVE_SIZES_GIB} from "../../app/lib/license/planCatalogDrafts.ts";

assert.equal(PROPOSED_COMMERCIAL_TIERS.length,17);
assert.ok(PROPOSED_COMMERCIAL_TIERS.every(t=>t.status==="PROPOSAL_ONLY"));
assert.equal(new Set(PROPOSED_COMMERCIAL_TIERS.map(t=>t.id)).size,17);
assert.ok(PROPOSED_COMMERCIAL_TIERS.every(t=>t.netAnnualPriceHuf===t.netMonthlyPriceHuf*10));
const mine=PROPOSED_COMMERCIAL_TIERS.filter(t=>t.product==="PERSONAL_DRIVE");
const project=PROPOSED_COMMERCIAL_TIERS.filter(t=>t.product==="PROJECT_DRIVE");
const gate=PROPOSED_COMMERCIAL_TIERS.filter(t=>t.product==="PROJECT_GATE");
assert.deepEqual(mine.map(t=>t.storageGiB),[5,10,25,50,100,250,500]);
assert.deepEqual(mine.map(t=>t.storageGiB),[...USER_SELECTED_DRIVE_SIZES_GIB],"commercial scenario follows user-approved tier sizes");
assert.deepEqual(project.map(t=>t.storageGiB),[5,10,25,50,100,250,500]);
assert.deepEqual(gate.map(t=>t.name),["Projektkapu Alap","Projektkapu Pro","Projektkapu Enterprise"]);
assert.ok(mine.every(t=>t.proposedActiveMembers===1&&t.proposedReadOnlyGuests===null));
assert.ok(project.every(t=>t.proposedActiveMembers===10&&t.proposedReadOnlyGuests===50),"seats not based on size");
assert.deepEqual(gate.map(t=>t.proposedActiveMembers),[10,25,100]);
assert.ok(gate.every(t=>t.storageGiB===null));
assert.ok(PROPOSED_COMMERCIAL_TIERS.every(t=>t.netMonthlyPriceHuf>0));
assert.ok(INITIAL_LICENSE_PLAN_DRAFTS.every(t=>t.proposedMonthlyPriceHuf===null&&t.proposedAnnualPriceHuf===null),"pricing is NOT in actual draft catalog");
const fiveHundred=estimateDriveStorageCost(500,"PROJECT_DRIVE");
assert.equal(fiveHundred.primaryGiB,700);
assert.equal(fiveHundred.backupGiB,910);
assert.equal(fiveHundred.combinedPhysicalGiB,1610);
assert.ok(fiveHundred.storageCostHuf>3500&&fiveHundred.storageCostHuf<4500);
assert.ok(fiveHundred.totalEstimatedCostHuf>fiveHundred.storageCostHuf);
assert.ok(PROPOSED_COMMERCIAL_TIERS.filter(t=>t.storageGiB!==null).every(t=>{
 const margin=projectProposalMargin(t,DEFAULT_PRICING_ASSUMPTIONS);
 return margin&&margin.estimatedContributionPct>30;
}),"planning tariff must clear baseline total cost by 30%");
assert.ok(PROPOSED_COMMERCIAL_TIERS.filter(t=>t.storageGiB!==null).every(t=>{
  const estimate=projectProposalMargin(t,DEFAULT_PRICING_ASSUMPTIONS);
  return estimate && (t.netAnnualPriceHuf/12-estimate.totalEstimatedCostHuf)/(t.netAnnualPriceHuf/12)>0.30;
}),"effective annual monthly revenue still covers baseline assumed costs");
assert.equal(projectProposalMargin(gate[0],DEFAULT_PRICING_ASSUMPTIONS),null,"cannot invent a Projektkapu workload cost");
const stress=estimateDriveStorageCost(500,"PROJECT_DRIVE",{
  ...DEFAULT_PRICING_ASSUMPTIONS,oldVersionFactor:2,backupRetentionFactor:1.6,
  eurHuf:450,usdHuf:420,primaryEurPerTerabyte:6.5,
  independentBackupUsdPerTerabyte:9,
});
assert.equal(stress.primaryGiB,1000);
assert.equal(stress.backupGiB,1600);
assert.equal(stress.combinedPhysicalGiB,2600);
assert.ok(stress.totalEstimatedCostHuf>fiveHundred.totalEstimatedCostHuf);
assert.equal(projectProposalMargin(gate[0],DEFAULT_PRICING_ASSUMPTIONS),null,"cannot invent a Projektkapu workload cost");
assert.throws(()=>estimateDriveStorageCost(100,"PROJECT_DRIVE",{...DEFAULT_PRICING_ASSUMPTIONS,oldVersionFactor:0.7}),/INVALID_STORAGE_MULTIPLIER/);
const page=readFileSync("app/admin/licenckozpont/page.tsx","utf8");
assert.ok(page.includes("<PricingProposalWorkshop"),"internal admin-only proposal view");
const permissions=readFileSync("app/api/dimpro-identity/admin/project-product-licenses/route.ts","utf8");
assert.ok(permissions.includes("PROJECT_LICENSE_ADMIN_WRITES_RELEASED:boolean=false"),"release gate intact");
console.log("DIMPRO PRICING PROPOSAL ISOLATED CONTRACT 28/28 PASS");
