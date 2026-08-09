import { calculateRenovation, createVersions, renovationSamples } from "./calculator";

let failed = false;

for (const sample of renovationSamples) {
  const result = calculateRenovation(sample);
  const versions = createVersions(result);
  const issues: string[] = [];

  if (result.enabledCount <= 0) issues.push("nincs aktív munkarész");
  if (result.estimatedTotal <= 0) issues.push("a becsült összeg nem pozitív");
  if (result.runningTotal <= 0) issues.push("az aktuális várható összeg nem pozitív");
  if (versions.length !== 3) issues.push("nem 3 verzió jött létre");
  if (result.completedCount < 1) issues.push("nincs legalább egy készre jelölt tényleges munkarész");

  const sumCheck = Math.round(result.materialTotal + result.laborTotal + result.otherTotal + result.reserveTotal);
  if (Math.abs(sumCheck - Math.round(result.estimatedTotal)) > 2) {
    issues.push("az összesítés nem egyezik a részösszegekkel");
  }

  if (issues.length > 0) {
    failed = true;
    console.error(`[FAIL] ${sample.id}: ${issues.join(", ")}`);
  } else {
    console.log(
      `[OK] ${sample.id} | ${sample.label} | becslés=${Math.round(result.estimatedTotal)} | aktuális=${Math.round(result.runningTotal)} | kész=${result.completedCount}/${result.enabledCount}`,
    );
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Összes minta sikeres: ${renovationSamples.length}`);
