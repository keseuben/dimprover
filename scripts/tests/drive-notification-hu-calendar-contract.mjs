import assert from "node:assert/strict";
import {
  enumerateCalendarDates, calendarWindowMonths, createApprovedHuCalendar,
} from "../../app/lib/drive-notifications/huCalendarCore.ts";
import { latestDueDigestSlot } from "../../app/lib/drive-notifications/scheduling.ts";

const month={start:"2026-10-01",end:"2026-10-31"};
const dates=enumerateCalendarDates(month.start,month.end);
const record=(day,working=true)=>({
  calendarDate:day,isWorkingDay:working,
  sourceReference:"fixture-only-not-authoritative",approvedBy:"TEST_APPROVER",
  approvedAt:"2026-09-01T12:00:00Z",
});
const records=dates.map((date)=>record(date));
records[0]=record("2026-10-01",false); // explicit holiday-like fixture, not real-world assertion
records[1]=record("2026-10-02",true); // verified first working day in test fixture
records[9]=record("2026-10-10",true); // swapped Saturday fixture: no guessed weekend rule
const isWorking=createApprovedHuCalendar([month],records);

assert.equal(dates.length,31);
assert.equal(isWorking("2026-10-01"),false);
assert.equal(isWorking("2026-10-02"),true);
assert.equal(isWorking("2026-10-10"),true,"working Saturday is honored");
assert.equal(latestDueDigestSlot("MONTHLY",new Date("2026-10-02T05:03:00Z"),isWorking)?.slot,
  "2026-10-02T07:00-Europe/Budapest");
assert.equal(latestDueDigestSlot("MONTHLY",new Date("2026-10-03T05:03:00Z"),isWorking)?.slot,
  "2026-10-02T07:00-Europe/Budapest");
assert.throws(()=>createApprovedHuCalendar([month],records.slice(1)),/MONTH_INCOMPLETE/);
assert.throws(()=>createApprovedHuCalendar([month],[...records,records[0]]),/DUPLICATE_DATE/);
assert.throws(()=>createApprovedHuCalendar([month],[...records.slice(0,10),{...records[10],approvedBy:""},...records.slice(11)]),/UNAPPROVED/);
assert.throws(()=>isWorking("2026-11-01"),/OUTSIDE_APPROVED/);
assert.throws(()=>enumerateCalendarDates("2026-02-29","2026-03-01"),/INVALID_CIVIL_DATE/);
const span=calendarWindowMonths(new Date("2026-03-01T05:12:00Z"));
assert.ok(span.some((m)=>m.start==="2026-01-01"));
assert.ok(span.some((m)=>m.start==="2026-02-01"));
assert.ok(span.some((m)=>m.start==="2026-03-01"));
assert.equal(latestDueDigestSlot("MONTHLY",new Date("2026-10-02T05:03:00Z")),null,"missing calendar must not send");
console.log("DRIVE HU CALENDAR CONTRACT 14/14 PASS (synthetic fixtures)");
