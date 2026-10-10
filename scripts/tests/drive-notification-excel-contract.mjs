import assert from "node:assert/strict";
import XLSX from "xlsx";
import { buildDigestWorkbook } from "../../app/lib/drive-notifications/digestAttachment.ts";
const items=[{eventId:"e1",sequence:1,projectId:"p1",documentId:"d1",occurredAt:"2026-10-10T14:00:00Z",
actorUserId:"actor",kind:"NEW_VERSION",category:"DOCUMENT_CHANGES"}];
const raw=buildDigestWorkbook({projectTitle:"Szekszárd",period:"Október",recipientLabel:"Műszaki ellenőr",approvedItems:items,
  accessibleNames:new Map([["d1","=Veszélyes Excel formula"]])});
assert.ok(raw?.length>500,"nonempty workbook");
const wb=XLSX.read(raw,{type:"buffer"});
assert.deepEqual(wb.SheetNames,["Összesítő","Dokumentumváltozások","Tervjóváhagyások","Jelmagyarázat"]);
const ws=wb.Sheets["Dokumentumváltozások"];
assert.equal(ws["B2"].t,"s","document name must be string");
assert.ok(ws["B2"].v.startsWith("'="),"prevent spreadsheet formulas");
assert.equal(wb.Sheets["Tervjóváhagyások"]["A2"],undefined);
assert.equal(buildDigestWorkbook({projectTitle:"P",period:"now",recipientLabel:"Self",approvedItems:[],accessibleNames:new Map()}),null);
console.log("DRIVE NOTIFICATION EXCEL CONTRACT 5/5 PASS");
