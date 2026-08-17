#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; const root=process.cwd(); const c=fs.readFileSync(path.join(root,"components/admin/developer-console/DeveloperConversation.tsx"),"utf8"); let p=0; const ck=(n,o)=>{console.log(`${o?"PASS":"FAIL"} ${String(++p).padStart(2,"0")} ${n}`); if(!o)process.exitCode=1};
ck("Default archive is seven days",c.includes("ageDays <= 7")&&c.includes("recent.push(message)"));
ck("Earlier archive hidden by default",c.includes("showEarlierArchive")&&c.includes("archive.earlierCount"));
ck("Single reveal label exists",c.includes("Korábbi archívum megjelenítése")&&c.includes('data-testid="benjadmin-archive-show-earlier"'));
ck("Earlier rows become weekly groups only after reveal",c.includes('makeGroups(earlier, "week")')&&c.includes("showEarlierArchive ? [...earlierGroups, ...recentGroups] : recentGroups"));
ck("Visible messages are explicitly chronological",c.includes('const chronological = [...visible].sort((a, b) => a.createdAt.localeCompare(b.createdAt))'));
ck("Archive groups sort oldest to newest",c.includes('(a.messages[0]?.createdAt || "").localeCompare(b.messages[0]?.createdAt || "")'));
ck("Latest jump remains bottom based",c.includes("scrollTo({ top: element.scrollHeight"));
ck("Header communicates latest-at-bottom",c.includes("a legfrissebb esemény legalul"));
console.log(JSON.stringify({ok:!process.exitCode,passed:p-(process.exitCode?1:0),contract:"BENJADMIN Conversation Archive V1.5"},null,2));
