import * as XLSX from "xlsx";
import type { DigestItem } from "./digestCore";

type AccessApprovedRecipient = { name: string; role: string; email: string };

const labels: Record<DigestItem["kind"],string> = {
  NEW_DOCUMENT:"Új dokumentum",NEW_VERSION:"Új verzió",NEW_REVISION:"Új hivatalos revízió",
  REVIEW_DECISION:"Tervellenőrzési döntés",FORMAL_ISSUE:"Hivatalos kiadás",
};

function safeExcelText(value: string): string {
  const text = value.slice(0, 300);
  // Prevent accidental formula interpretation in downstream spreadsheet editors.
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

export function buildDigestWorkbook(input: {
  projectTitle: string;
  period: string;
  recipientLabel: string;
  approvedItems: readonly DigestItem[];
  /** Must already be filtered by effective project/folder/document ACL. */
  accessibleNames: ReadonlyMap<string,string>;
  /** Optional: only the recipient's currently visible files, never all project files. */
  optionalFullVisibleFileList?: readonly string[];
  /** Only recipients confirmed delivered the same ACL-homogeneous message may be listed. */
  deliveredSameMessageRecipients?: readonly AccessApprovedRecipient[];
}): Buffer | null {
  const items=input.approvedItems.filter((event)=>input.accessibleNames.has(event.documentId));
  if(!items.length)return null;

  const wb=XLSX.utils.book_new();
  const sheet=(name:string,rows:(string|number)[][])=>{
    const ws=XLSX.utils.aoa_to_sheet(rows.map((row)=>row.map((v)=>typeof v==="string"?safeExcelText(v):v)));
    ws["!cols"]=Array.from({length:Math.max(...rows.map((r)=>r.length),1)},(_,i)=>({
      wch:Math.min(70,Math.max(17,...rows.map((r)=>String(r[i]??"").length+2))),
    }));
    XLSX.utils.book_append_sheet(wb,ws,name);
  };
  const docItems=items.filter((event)=>event.category==="DOCUMENT_CHANGES");
  const approvalItems=items.filter((event)=>event.category==="APPROVAL_DECISIONS");
  sheet("Összesítő",[
    ["DIMPRO DRIVE – Dokumentumváltozási összesítő"],
    ["Projekt",input.projectTitle],["Időszak",input.period],
    ["Címzett",input.recipientLabel],
    ["Dokumentumváltozások",docItems.length],["Tervellenőrzési döntések",approvalItems.length],
  ]);
  const records=(events:DigestItem[])=>[
    ["Esemény","Dokumentum","Időpont","Eseményazonosító"],
    ...events.map((event)=>[
      labels[event.kind],input.accessibleNames.get(event.documentId)||"",
      event.occurredAt,event.eventId,
    ]),
  ];
  sheet("Dokumentumváltozások",records(docItems));
  sheet("Tervjóváhagyások",records(approvalItems));
  if(input.optionalFullVisibleFileList)sheet("Teljes fájllista",[
    ["Hozzáférhető dokumentum"],...input.optionalFullVisibleFileList.map((name)=>[name]),
  ]);
  sheet("Jelmagyarázat",[
    ["Jelölés","Jelentés"],
    ...Object.entries(labels),
    ["Láthatóság","Csak a címzett számára elérhető dokumentumok"],
    ["Olvasottság","Fájlmegnyitásból nem következik jóváhagyás"],
  ]);
  if(input.deliveredSameMessageRecipients)sheet("Kiküldési adatok",[
    ["Ténylegesen kézbesített címzett","Projektbeli szerep","E-mail"],
    ...input.deliveredSameMessageRecipients.map((person)=>[person.name,person.role,person.email]),
  ]);
  return XLSX.write(wb,{bookType:"xlsx",type:"buffer",compression:true}) as Buffer;
}
