import fs from "node:fs";
const css=fs.readFileSync("components/admin/developer-console/DeveloperConsole.module.css","utf8");
let passed=0,failed=0;
function check(label,ok){if(ok){passed++;console.log(`PASS ${String(passed+failed).padStart(2,"0")} ${label}`)}else{failed++;console.error(`FAIL ${String(passed+failed).padStart(2,"0")} ${label}`)}}
check("readable typography tokens exist",["--type-micro: 11px","--type-small: 12px","--type-body: 13px","--type-strong: 14px","--type-heading: 15px"].every(x=>css.includes(x)));
check("legacy 6-10px explicit font sizes removed",!/(?:font-size\s*:\s*)(?:6|7|8|9|10)px\b/.test(css));
check("weekly summary uses typography tokens",/\.weeklySummaryToggle strong[^}]*font-size:\s*var\(--type-small\)/s.test(css) && /\.weeklyPortfolioMetrics span[^}]*font-size:\s*var\(--type-micro\)/s.test(css));
check("weekly chart labels are at least micro token",/\.weeklyTrendChart text[^}]*font-size:\s*var\(--type-micro\)/s.test(css));
check("nested weekly small labels stay at micro token",/\.weeklyFlowTransitions > b small[^}]*font-size:\s*var\(--type-micro\)/s.test(css) && /\.weeklyHandoffTimingDetails > b small[^}]*font-size:\s*var\(--type-micro\)/s.test(css));
check("worker panel uses readable tokens",/\.workerHead strong[^}]*font-size:\s*var\(--type-body\)/s.test(css) && /\.workerCard p[^}]*font-size:\s*var\(--type-small\)/s.test(css));
check("composer input uses strong token",/\.composerInputRow textarea[^}]*font-size:\s*var\(--type-strong\)/s.test(css));
check("topbar controls use body token",/\.topbarActions > button[^}]*font-size:\s*var\(--type-body\)/s.test(css));
check("message body uses strong token",/\.messageBody[^}]*font-size:\s*var\(--type-strong\)/s.test(css));
console.log(JSON.stringify({ok:failed===0,passed,failed},null,2));
if(failed) process.exit(1);
