"use client";

import React from "react";
import { usePersistentCollapse } from "@/components/layout/usePersistentCollapse";
import { minuteTypeCards } from "@/components/minutes/data/minuteTypes";
import { typeCardClass, typeStripClass } from "@/components/minutes/utils/minuteStyles";
import {
  CalendarCheck2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  FolderKanban,
  Search,
  Sun,
  UsersRound,
} from "lucide-react";

const quickLinks = [
  { title: "E-napló", subtitle: "Építési napló", icon: "▦" },
  { title: "ÉTDR", subtitle: "Építési engedélyezés", icon: "⬡" },
  { title: "OÉNY", subtitle: "Építésügyi nyilvántartás", icon: "▥" },
  { title: "Lechner", subtitle: "e-Közmű és térképek", icon: "L" },
  { title: "E-közmű", subtitle: "Közműnyilatkozat", icon: "○" },
  { title: "Terc", subtitle: "Építőipari szoftver", icon: "T" },
  { title: "Google Drive", subtitle: "Felhőalapú tárhely", icon: "▲" },
  { title: "Outlook", subtitle: "E-mail", icon: "O" },
  { title: "Naptár", subtitle: "Google Naptár", icon: "31" },
  { title: "DIMPROVER", subtitle: "Projektkezelés", icon: "DP" },
  { title: "Jegyzőkönyvek", subtitle: "Jegyzőkönyv kezelés", icon: "□" },
  { title: "Ütemterv", subtitle: "Gantt és ütemezés", icon: "▣" },
  { title: "Iktató", subtitle: "Dokumentum kezelés", icon: "▰" },
  { title: "Pénzügy", subtitle: "Számlák, kifizetések", icon: "$" },
];

const planStats = [
  { label: "Aktív projektek", value: "12", change: "+2", icon: FolderKanban },
  { label: "Nyitott feladatok", value: "24", change: "-3", icon: CalendarCheck2 },
  { label: "Dokumentumok", value: "156", change: "+12", icon: FileText },
  { label: "Partnerek", value: "38", change: "+2", icon: UsersRound },
];

export function HeroProjectVisual() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[radial-gradient(circle_at_78%_8%,rgba(37,99,235,.22)_0%,rgba(96,165,250,.12)_28%,rgba(255,255,255,0)_58%),linear-gradient(180deg,rgba(235,247,255,.96)_0%,rgba(248,252,255,.90)_46%,rgba(255,255,255,1)_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.92)_0%,rgba(255,255,255,.66)_25%,rgba(255,255,255,.20)_62%,rgba(255,255,255,.34)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.05)_0%,rgba(255,255,255,.24)_42%,rgba(255,255,255,.88)_82%,rgba(255,255,255,1)_100%)]" />
      <div className="absolute -right-24 -top-24 h-[520px] w-[820px] rounded-full bg-sky-300/36 blur-2xl" />
      <div className="absolute left-0 top-0 h-full w-full opacity-[0.54] [background-image:linear-gradient(rgba(37,99,235,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.12)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-b from-transparent via-white/75 to-white" />
    </div>
  );
}

export function BuildingFrameOverlay() {
  return (
    <>
      <style>{`
        .hero-scan-line-removed { animation: heroScanLine 16s linear infinite; }
        .hero-scan-line-removed-horizontal { animation: heroScanLineHorizontal 18s linear infinite; }
        .hero-node-pulse { transform-origin:center; animation: heroNodePulse 17s ease-in-out infinite; }
        .hero-node-pulse-fast { transform-origin:center; animation: heroNodePulseFast 16s ease-in-out infinite; }
        .hero-data-drift-a { animation: heroDataDriftA 24s ease-in-out infinite; }
        .hero-data-drift-b { animation: heroDataDriftB 30s ease-in-out infinite; }
        .hero-data-drift-c { animation: heroDataDriftC 27s ease-in-out infinite; }
        .hero-person-solo { animation: heroPersonSolo 32s ease-in-out infinite; }
        .hero-person-meet-a { animation: heroPersonMeetA 28s ease-in-out infinite; }
        .hero-person-meet-b { animation: heroPersonMeetB 28s ease-in-out infinite; }
        .hero-person-meet-c { animation: heroPersonMeetC 28s ease-in-out infinite; }
        .hero-node-pulse-subtle { transform-origin:center; animation: heroNodePulseSubtle 10s ease-in-out infinite; }
        .hero-deliver-a { animation: heroDeliverA 16s ease-in-out infinite; }
        .hero-deliver-b { animation: heroDeliverB 18s ease-in-out infinite; }
        .hero-deliver-c { animation: heroDeliverC 20s ease-in-out infinite; }
        .hero-task-float-a { animation: heroTaskFloatA 28s ease-in-out infinite; }
        .hero-task-float-b { animation: heroTaskFloatB 31s ease-in-out infinite; }
        .hero-worker-roam-a { animation: heroWorkerRoamA 34s ease-in-out infinite; }
        .hero-worker-roam-b { animation: heroWorkerRoamB 38s ease-in-out infinite; }
        .hero-worker-group-a { animation: heroWorkerGroupA 30s ease-in-out infinite; }
        .hero-worker-group-b { animation: heroWorkerGroupB 30s ease-in-out infinite; }
        .hero-worker-group-c { animation: heroWorkerGroupC 30s ease-in-out infinite; }
        .hero-worker-group-d { animation: heroWorkerGroupD 30s ease-in-out infinite; }
        .hero-worker-tl-a { animation: heroWorkerTopLeftA 32s ease-in-out infinite; }
        .hero-worker-tl-b { animation: heroWorkerTopLeftB 32s ease-in-out infinite; }
        .hero-worker-tl-c { animation: heroWorkerTopLeftC 32s ease-in-out infinite; }
        .hero-worker-tl-d { animation: heroWorkerTopLeftD 32s ease-in-out infinite; }
        .hero-worker-tl-e { animation: heroWorkerTopLeftE 32s ease-in-out infinite; }
        .hero-worker-mid-a { animation: heroWorkerMidA 36s ease-in-out infinite; }
        .hero-worker-mid-b { animation: heroWorkerMidB 36s ease-in-out infinite; }
        .hero-worker-mid-c { animation: heroWorkerMidC 36s ease-in-out infinite; }
        .hero-worker-right-a { animation: heroWorkerRightA 42s ease-in-out infinite; }
        .hero-worker-right-b { animation: heroWorkerRightB 42s ease-in-out infinite; }
        .hero-worker-right-c { animation: heroWorkerRightC 42s ease-in-out infinite; }
        @keyframes heroScanLine { 0%{ transform:translateX(-180px); opacity:0 } 12%{ opacity:.32 } 58%{ opacity:.32 } 100%{ transform:translateX(1500px); opacity:0 } }
        @keyframes heroScanLineHorizontal { 0%{ transform:translateY(-90px); opacity:0 } 14%{ opacity:.24 } 64%{ opacity:.24 } 100%{ transform:translateY(390px); opacity:0 } }
        @keyframes heroNodePulse { 0%,100%{ opacity:.58; transform:scale(.92) } 18%,78%{ opacity:1; transform:scale(1.24) } }
        @keyframes heroNodePulseFast { 0%,100%{ opacity:.60; transform:scale(.90) } 18%,80%{ opacity:1; transform:scale(1.28) } }
        @keyframes heroNodePulseSubtle { 0%,100%{ opacity:.18; transform:scale(.82) } 50%{ opacity:.34; transform:scale(1.18) } }
        @keyframes heroDataDriftA { 0%,100%{ transform:translate3d(-34px,12px,0); opacity:.24 } 18%,76%{ opacity:.96 } 50%{ transform:translate3d(54px,-28px,0) } }
        @keyframes heroDataDriftB { 0%,100%{ transform:translate3d(42px,-20px,0); opacity:.20 } 22%,78%{ opacity:.94 } 52%{ transform:translate3d(-58px,34px,0) } }
        @keyframes heroDataDriftC { 0%,100%{ transform:translate3d(-18px,-28px,0); opacity:.22 } 16%,74%{ opacity:.94 } 48%{ transform:translate3d(66px,26px,0) } }
        @keyframes heroPersonSolo { 0%,100%{ transform:translate3d(-52px,24px,0); opacity:.18 } 20%,78%{ opacity:.98 } 52%{ transform:translate3d(82px,-42px,0) } }
        @keyframes heroPersonMeetA { 0%{ transform:translate3d(-120px,-34px,0); opacity:0 } 18%{ opacity:.98 } 42%,52%{ transform:translate3d(-22px,0,0); opacity:.98 } 100%{ transform:translate3d(88px,52px,0); opacity:0 } }
        @keyframes heroPersonMeetB { 0%{ transform:translate3d(0,76px,0); opacity:0 } 18%{ opacity:.98 } 42%,52%{ transform:translate3d(0,0,0); opacity:.98 } 100%{ transform:translate3d(-42px,-82px,0); opacity:0 } }
        @keyframes heroPersonMeetC { 0%{ transform:translate3d(126px,-34px,0); opacity:0 } 18%{ opacity:.98 } 42%,52%{ transform:translate3d(22px,0,0); opacity:.98 } 100%{ transform:translate3d(-92px,54px,0); opacity:0 } }
        @keyframes heroDeliverA { 0%{ transform:translate3d(84px,48px,0) scale(.86); opacity:0 } 10%{ opacity:.78 } 58%{ transform:translate3d(-88px,-58px,0) scale(.96); opacity:.78 } 70%,100%{ transform:translate3d(-118px,-76px,0) scale(.48); opacity:0 } }
        @keyframes heroDeliverB { 0%{ transform:translate3d(64px,38px,0) scale(.82); opacity:0 } 12%{ opacity:.74 } 58%{ transform:translate3d(-74px,-72px,0) scale(.94); opacity:.74 } 70%,100%{ transform:translate3d(-105px,-92px,0) scale(.46); opacity:0 } }
        @keyframes heroDeliverC { 0%{ transform:translate3d(102px,54px,0) scale(.84); opacity:0 } 12%{ opacity:.72 } 56%{ transform:translate3d(-62px,-62px,0) scale(.96); opacity:.72 } 68%,100%{ transform:translate3d(-92px,-84px,0) scale(.46); opacity:0 } }
        @keyframes heroTaskFloatA { 0%,100%{ transform:translate3d(-5px,-42px,0); opacity:.14 } 20%,78%{ opacity:.76 } 52%{ transform:translate3d(5px,76px,0) } }
        @keyframes heroTaskFloatB { 0%,100%{ transform:translate3d(6px,-48px,0); opacity:.13 } 22%,76%{ opacity:.74 } 52%{ transform:translate3d(-6px,82px,0) } }
        @keyframes heroWorkerRoamA { 0%,100%{ transform:translate3d(-42px,18px,0); opacity:.20 } 18%,80%{ opacity:.94 } 50%{ transform:translate3d(66px,-32px,0) } }
        @keyframes heroWorkerRoamB { 0%,100%{ transform:translate3d(48px,-14px,0); opacity:.20 } 20%,82%{ opacity:.94 } 54%{ transform:translate3d(-70px,38px,0) } }
        @keyframes heroWorkerGroupA { 0%{ transform:translate3d(-112px,-34px,0); opacity:0 } 18%{ opacity:.96 } 42%,52%{ transform:translate3d(-16px,0,0); opacity:.96 } 100%{ transform:translate3d(78px,46px,0); opacity:0 } }
        @keyframes heroWorkerGroupB { 0%{ transform:translate3d(96px,-28px,0); opacity:0 } 18%{ opacity:.96 } 42%,52%{ transform:translate3d(14px,0,0); opacity:.96 } 100%{ transform:translate3d(-84px,42px,0); opacity:0 } }
        @keyframes heroWorkerGroupC { 0%{ transform:translate3d(-52px,82px,0); opacity:0 } 18%{ opacity:.96 } 42%,52%{ transform:translate3d(-4px,12px,0); opacity:.96 } 100%{ transform:translate3d(32px,-76px,0); opacity:0 } }
        @keyframes heroWorkerGroupD { 0%{ transform:translate3d(54px,76px,0); opacity:0 } 18%{ opacity:.96 } 42%,52%{ transform:translate3d(6px,12px,0); opacity:.96 } 100%{ transform:translate3d(-44px,-72px,0); opacity:0 } }
        @keyframes heroWorkerTopLeftA { 0%{ transform:translate3d(-72px,118px,0); opacity:0 } 18%{ opacity:.96 } 42%,56%{ transform:translate3d(-10px,0,0); opacity:.96 } 100%{ transform:translate3d(52px,34px,0); opacity:0 } }
        @keyframes heroWorkerTopLeftB { 0%{ transform:translate3d(74px,124px,0); opacity:0 } 18%{ opacity:.96 } 42%,56%{ transform:translate3d(12px,0,0); opacity:.96 } 100%{ transform:translate3d(-58px,38px,0); opacity:0 } }
        @keyframes heroWorkerTopLeftC { 0%{ transform:translate3d(0,132px,0); opacity:0 } 18%{ opacity:.96 } 42%,56%{ transform:translate3d(0,10px,0); opacity:.96 } 100%{ transform:translate3d(38px,-58px,0); opacity:0 } }
        @keyframes heroWorkerTopLeftD { 0%{ transform:translate3d(46px,128px,0); opacity:0 } 18%{ opacity:.96 } 42%,54%{ transform:translate3d(4px,10px,0); opacity:.96 } 100%{ transform:translate3d(-42px,-58px,0); opacity:0 } }
        @keyframes heroWorkerTopLeftE { 0%{ transform:translate3d(0,112px,0); opacity:0 } 18%{ opacity:.96 } 42%,54%{ transform:translate3d(0,-6px,0); opacity:.96 } 100%{ transform:translate3d(72px,-26px,0); opacity:0 } }
        @keyframes heroWorkerMidA { 0%{ transform:translate3d(-104px,118px,0); opacity:0 } 20%{ opacity:.92 } 44%,58%{ transform:translate3d(-14px,0,0); opacity:.92 } 100%{ transform:translate3d(68px,52px,0); opacity:0 } }
        @keyframes heroWorkerMidB { 0%{ transform:translate3d(96px,118px,0); opacity:0 } 20%{ opacity:.92 } 44%,58%{ transform:translate3d(12px,0,0); opacity:.92 } 100%{ transform:translate3d(-76px,46px,0); opacity:0 } }
        @keyframes heroWorkerMidC { 0%{ transform:translate3d(0,132px,0); opacity:0 } 20%{ opacity:.92 } 44%,58%{ transform:translate3d(0,12px,0); opacity:.92 } 100%{ transform:translate3d(30px,-82px,0); opacity:0 } }
        @keyframes heroWorkerRightA { 0%{ transform:translate3d(-118px,126px,0); opacity:0 } 24%{ opacity:.92 } 48%,62%{ transform:translate3d(-16px,0,0); opacity:.92 } 100%{ transform:translate3d(82px,-48px,0); opacity:0 } }
        @keyframes heroWorkerRightB { 0%{ transform:translate3d(112px,122px,0); opacity:0 } 24%{ opacity:.92 } 48%,62%{ transform:translate3d(14px,0,0); opacity:.92 } 100%{ transform:translate3d(-86px,-42px,0); opacity:0 } }
        @keyframes heroWorkerRightC { 0%{ transform:translate3d(0,116px,0); opacity:0 } 24%{ opacity:.92 } 48%,62%{ transform:translate3d(0,-10px,0); opacity:.92 } 100%{ transform:translate3d(62px,70px,0); opacity:0 } }

        .hero-doc-rush-tl { animation: heroDocRushTopLeft 9s ease-in-out infinite; }
        .hero-task-drop { animation: heroTaskDrop 14s ease-in-out infinite; }
        .hero-note-rush-tr { animation: heroNoteRushTopRight 10s ease-in-out infinite; }
        .hero-node-drift-up { animation: heroNodeDriftUpRight 18s ease-in-out infinite; }
        @keyframes heroDocRushTopLeft { 0%{ transform:translate3d(120px,74px,0) scale(.72); opacity:0 } 12%{ opacity:.72 } 58%{ transform:translate3d(-105px,-82px,0) scale(.82); opacity:.72 } 72%,100%{ transform:translate3d(-140px,-104px,0) scale(.48); opacity:0 } }
        @keyframes heroNoteRushTopRight { 0%{ transform:translate3d(-72px,52px,0) scale(.74); opacity:0 } 12%{ opacity:.68 } 58%{ transform:translate3d(115px,-72px,0) scale(.86); opacity:.68 } 72%,100%{ transform:translate3d(148px,-96px,0) scale(.50); opacity:0 } }
        @keyframes heroTaskDrop { 0%,100%{ transform:translate3d(-4px,-52px,0); opacity:.12 } 20%,80%{ opacity:.72 } 52%{ transform:translate3d(5px,86px,0) } }
        @keyframes heroNodeDriftUpRight { 0%,100%{ transform:translate3d(-22px,18px,0); opacity:.34 } 22%,78%{ opacity:.82 } 54%{ transform:translate3d(88px,42px,0) } }

        .hero-work-down-a { animation: heroWorkDownA 15s ease-in-out infinite; }
        .hero-work-down-b { animation: heroWorkDownB 17s ease-in-out infinite; }
        .hero-work-down-c { animation: heroWorkDownC 19s ease-in-out infinite; }
        @keyframes heroWorkDownA { 0%{ transform:translate3d(-10px,-96px,0) scale(.74); opacity:0 } 14%{ opacity:.62 } 72%{ transform:translate3d(12px,255px,0) scale(.98); opacity:.62 } 100%{ transform:translate3d(18px,355px,0) scale(.82); opacity:0 } }
        @keyframes heroWorkDownB { 0%{ transform:translate3d(14px,-120px,0) scale(.70); opacity:0 } 16%{ opacity:.58 } 74%{ transform:translate3d(-16px,275px,0) scale(1.02); opacity:.58 } 100%{ transform:translate3d(-20px,375px,0) scale(.82); opacity:0 } }
        @keyframes heroWorkDownC { 0%{ transform:translate3d(0,-108px,0) scale(.78); opacity:0 } 12%{ opacity:.56 } 70%{ transform:translate3d(6px,265px,0) scale(.98); opacity:.56 } 100%{ transform:translate3d(8px,365px,0) scale(.82); opacity:0 } }
        @media (prefers-reduced-motion: reduce){ .hero-scan-line-removed,.hero-scan-line-removed-horizontal,.hero-node-pulse,.hero-node-pulse-fast,.hero-node-pulse-subtle,.hero-data-drift-a,.hero-data-drift-b,.hero-data-drift-c,.hero-person-solo,.hero-person-meet-a,.hero-person-meet-b,.hero-person-meet-c,.hero-deliver-a,.hero-deliver-b,.hero-deliver-c,.hero-task-float-a,.hero-task-float-b,.hero-worker-roam-a,.hero-worker-roam-b,.hero-worker-group-a,.hero-worker-group-b,.hero-worker-group-c,.hero-worker-group-d,.hero-worker-tl-a,.hero-worker-tl-b,.hero-worker-tl-c,.hero-worker-tl-d,.hero-worker-tl-e,.hero-worker-mid-a,.hero-worker-mid-b,.hero-worker-mid-c,.hero-worker-right-a,.hero-worker-right-b,.hero-worker-right-c,.hero-doc-rush-tl,.hero-task-drop,.hero-note-rush-tr,.hero-node-drift-up,.hero-work-down-a,.hero-work-down-b,.hero-work-down-c{animation:none} }
      `}</style>

    </>
  );
}

export function HeroPulseNodesOverlay({ compact = false }: { compact?: boolean }) {
  const tasks = [
    { x: 170, y: 94, size: 30, cls: "hero-task-drop", delay: 0.3 },
    { x: 338, y: 126, size: 24, cls: "hero-task-drop", delay: 1.0 },
    { x: 530, y: 82, size: 28, cls: "hero-task-drop", delay: 1.8 },
    { x: 690, y: 150, size: 26, cls: "hero-task-drop", delay: 2.6 },
    { x: 895, y: 105, size: 31, cls: "hero-task-drop", delay: 3.4 },
    { x: 1088, y: 132, size: 27, cls: "hero-task-drop", delay: 4.2 },
    { x: 1250, y: 86, size: 32, cls: "hero-task-drop", delay: 5.0 },
    { x: 1382, y: 165, size: 26, cls: "hero-task-drop", delay: 5.8 },
    { x: 275, y: 238, size: 34, cls: "hero-task-drop", delay: 6.6 },
    { x: 610, y: 252, size: 29, cls: "hero-task-drop", delay: 7.4 },
    { x: 985, y: 238, size: 33, cls: "hero-task-drop", delay: 8.2 },
    { x: 1215, y: 270, size: 30, cls: "hero-task-drop", delay: 9.0 },
  ];
  const docs = [
    { x: 230, y: 118, cls: "hero-doc-rush-tl", delay: 0.4, small: true },
    { x: 455, y: 132, cls: "hero-doc-rush-tl", delay: 1.2, small: true },
    { x: 610, y: 88, cls: "hero-doc-rush-tl", delay: 2.0, small: true },
    { x: 790, y: 118, cls: "hero-doc-rush-tl", delay: 2.8, small: true },
    { x: 1040, y: 104, cls: "hero-doc-rush-tl", delay: 3.6, small: true },
    { x: 1280, y: 124, cls: "hero-doc-rush-tl", delay: 4.4, small: true },
    { x: 350, y: 205, cls: "hero-doc-rush-tl", delay: 5.2 },
    { x: 960, y: 220, cls: "hero-doc-rush-tl", delay: 6.0 },
  ];
  const notes = [
    { x: 250, y: 196, cls: "hero-note-rush-tr", delay: 1.4, small: true },
    { x: 720, y: 205, cls: "hero-note-rush-tr", delay: 3.1, small: true },
    { x: 1035, y: 172, cls: "hero-note-rush-tr", delay: 4.8, small: true },
    { x: 1210, y: 242, cls: "hero-note-rush-tr", delay: 6.5, small: true },
  ];
  const workDownItems = [
    { kind: "task", x: 115, y: 95, size: 22, cls: "hero-work-down-a", delay: 0.2 },
    { kind: "doc", x: 185, y: 76, small: true, cls: "hero-work-down-c", delay: 0.7 },
    { kind: "doc", x: 225, y: 130, small: true, cls: "hero-work-down-b", delay: 1.1 },
    { kind: "note", x: 305, y: 58, small: false, cls: "hero-work-down-a", delay: 1.6 },
    { kind: "note", x: 345, y: 82, small: true, cls: "hero-work-down-c", delay: 2.0 },
    { kind: "doc", x: 410, y: 112, small: true, cls: "hero-work-down-b", delay: 2.4 },
    { kind: "task", x: 470, y: 150, size: 28, cls: "hero-work-down-b", delay: 2.9 },
    { kind: "doc", x: 590, y: 112, small: false, cls: "hero-work-down-a", delay: 3.8 },
    { kind: "note", x: 660, y: 70, small: true, cls: "hero-work-down-b", delay: 4.2 },
    { kind: "note", x: 715, y: 166, small: true, cls: "hero-work-down-c", delay: 4.7 },
    { kind: "doc", x: 785, y: 98, small: false, cls: "hero-work-down-a", delay: 5.1 },
    { kind: "task", x: 840, y: 92, size: 24, cls: "hero-work-down-a", delay: 5.6 },
    { kind: "doc", x: 925, y: 74, small: true, cls: "hero-work-down-c", delay: 6.1 },
    { kind: "doc", x: 965, y: 142, small: true, cls: "hero-work-down-b", delay: 6.5 },
    { kind: "note", x: 1090, y: 102, small: false, cls: "hero-work-down-c", delay: 7.4 },
    { kind: "doc", x: 1148, y: 70, small: true, cls: "hero-work-down-a", delay: 7.9 },
    { kind: "task", x: 1215, y: 158, size: 30, cls: "hero-work-down-b", delay: 8.3 },
    { kind: "note", x: 1275, y: 84, small: false, cls: "hero-work-down-c", delay: 8.8 },
    { kind: "doc", x: 1338, y: 118, small: true, cls: "hero-work-down-a", delay: 9.2 },
    { kind: "note", x: 1400, y: 180, small: true, cls: "hero-work-down-c", delay: 10.1 },
    { kind: "doc", x: 1485, y: 96, small: true, cls: "hero-work-down-b", delay: 10.5 },
    { kind: "task", x: 285, y: 210, size: 25, cls: "hero-work-down-a", delay: 11.0 },
    { kind: "note", x: 520, y: 228, small: true, cls: "hero-work-down-c", delay: 11.5 },
    { kind: "doc", x: 760, y: 218, small: true, cls: "hero-work-down-b", delay: 12.0 },
    { kind: "doc", x: 930, y: 214, small: false, cls: "hero-work-down-a", delay: 12.5 },
    { kind: "note", x: 1165, y: 226, small: true, cls: "hero-work-down-c", delay: 13.0 },
    { kind: "doc", x: 1350, y: 222, small: true, cls: "hero-work-down-b", delay: 13.6 },
  ];
  const people = [
    { x: 238, y: 142, cls: "hero-worker-tl-a", delay: 0.6 },
    { x: 328, y: 132, cls: "hero-worker-tl-b", delay: 0.6 },
    { x: 284, y: 164, cls: "hero-worker-tl-c", delay: 0.6 },
    { x: 690, y: 148, cls: "hero-worker-mid-a", delay: 4.4 },
    { x: 790, y: 160, cls: "hero-worker-mid-b", delay: 4.4 },
    { x: 740, y: 184, cls: "hero-worker-mid-c", delay: 4.4 },
    { x: 1195, y: 146, cls: "hero-worker-right-a", delay: 8.5 },
    { x: 1302, y: 162, cls: "hero-worker-right-b", delay: 8.5 },
    { x: 1248, y: 188, cls: "hero-worker-right-c", delay: 8.5 },
    { x: 515, y: 170, cls: "hero-person-solo", delay: 2.8 },
    { x: 1018, y: 178, cls: "hero-person-solo", delay: 6.8 },
  ];
  const targetNodes = [[210, 252], [250, 174], [390, 145], [560, 212], [740, 190], [930, 168], [1015, 126], [1160, 150], [1288, 132], [1390, 166], [1055, 238], [1245, 190], [525, 270], [875, 236], [1360, 276]];

  const TaskIcon = ({ x, y, size }: { x: number; y: number; size: number }) => {
    const h = size / 2;
    return (
      <g stroke="#67e8f9" strokeWidth="0.95" opacity="0.66" strokeLinecap="round" strokeLinejoin="round">
        <rect x={x - h} y={y - h} width={size} height={size} rx="4" />
        <path d={`M${x - h * 0.55} ${y} L${x - h * 0.15} ${y + h * 0.42} L${x + h * 0.62} ${y - h * 0.56}`} />
      </g>
    );
  };

  const DocIcon = ({ x, y, small = false }: { x: number; y: number; small?: boolean }) => {
    const w = small ? 13 : 18;
    const h = small ? 16 : 22;
    const fold = small ? 7 : 10;
    return (
    <g stroke="#67e8f9" strokeWidth={small ? "0.78" : "0.92"} opacity={small ? "0.50" : "0.62"} strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${x - w} ${y - h} H${x + w - fold} L${x + w} ${y - h + fold} V${y + h} H${x - w} Z`} />
      <path d={`M${x + w - fold} ${y - h} V${y - h + fold} H${x + w}`} />
      <path d={`M${x - w * 0.5} ${y - 2} H${x + w * 0.45} M${x - w * 0.5} ${y + 7} H${x + w * 0.25}`} />
    </g>
    );
  };

  const NoteIcon = ({ x, y, small = false }: { x: number; y: number; small?: boolean }) => {
    const w = small ? 13 : 17;
    const h = small ? 16 : 21;
    return (
      <g stroke="#60a5fa" strokeWidth={small ? "0.8" : "0.95"} opacity={small ? "0.52" : "0.64"} strokeLinecap="round" strokeLinejoin="round">
        <rect x={x - w} y={y - h} width={w * 2} height={h * 2} rx="2.5" />
        <path d={`M${x - w * 0.55} ${y - h * 0.35} H${x + w * 0.55} M${x - w * 0.55} ${y + 1} H${x + w * 0.35} M${x - w * 0.55} ${y + h * 0.35} H${x + w * 0.15}`} />
      </g>
    );
  };

  const WorkerIcon = ({ x, y }: { x: number; y: number }) => (
    <g stroke="#67e8f9" strokeWidth="1.15" opacity="0.90" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={x} cy={y - 10} r="10" />
      <path d={`M${x - 24} ${y + 28} C${x - 15} ${y + 8} ${x + 15} ${y + 8} ${x + 24} ${y + 28}`} />
      <path d={`M${x - 12} ${y + 4} C${x - 6} ${y + 12} ${x + 6} ${y + 12} ${x + 12} ${y + 4}`} opacity="0.55" />
    </g>
  );

  const displayTasks = compact ? tasks.filter((_, index) => index % 3 === 0) : tasks;
  const displayDocs = compact ? docs.filter((_, index) => index % 3 === 0) : docs;
  const displayNotes = compact ? notes.filter((_, index) => index % 2 === 0) : notes;
  const displayWorkDownItems = compact ? workDownItems.filter((_, index) => index % 5 === 0) : workDownItems;
  const displayPeople = compact ? people.filter((_, index) => index % 4 === 0) : people;
  const displayTargetNodes = compact ? targetNodes.filter((_, index) => index % 3 === 0) : targetNodes;

  return (
    <div className={compact ? "pointer-events-none absolute left-0 top-0 z-[70] h-[160px] w-full overflow-hidden" : "pointer-events-none absolute left-0 top-0 z-[70] h-[320px] w-full overflow-hidden"} aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 430" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <filter id="frontPulseGlow" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g opacity="0.36" filter="url(#frontPulseGlow)">
          <rect className="hero-scan-line-removed" x="0" y="10" width="4" height="410" fill="#67e8f9" opacity="0.42" />
          <rect className="hero-scan-line-removed" x="-130" y="44" width="2" height="320" fill="#1d4ed8" opacity="0.30" style={{ animationDelay: "5.5s" }} />
          <rect className="hero-scan-line-removed-horizontal" x="40" y="0" width="1340" height="3" fill="#67e8f9" opacity="0.32" />
          <rect className="hero-scan-line-removed-horizontal" x="180" y="-70" width="980" height="2" fill="#1d4ed8" opacity="0.22" style={{ animationDelay: "7s" }} />
          <rect className="hero-scan-line-removed-horizontal" x="120" y="-35" width="1160" height="2" fill="#67e8f9" opacity="0.20" style={{ animationDelay: "11.5s" }} />
        </g>

        <g filter="url(#frontPulseGlow)">
          {displayTargetNodes.map(([cx, cy], i) => (
            <g key={`target-${i}`} className="hero-node-drift-up" style={{ animationDelay: `${i * 0.8}s` }}>
              <circle cx={cx} cy={cy} r="11" fill="#22d3ee" opacity="0.18" />
              <circle cx={cx} cy={cy} r="4.2" fill="#1d4ed8" opacity="0.64" />
              <circle cx={cx} cy={cy} r="1.4" fill="#ffffff" opacity="0.82" />
            </g>
          ))}
        </g>

        <g filter="url(#frontPulseGlow)">
          {displayTasks.map((item, i) => (
            <g key={`task-${i}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}>
              <TaskIcon x={item.x} y={item.y} size={item.size} />
            </g>
          ))}
          {displayDocs.map((item, i) => (
            <g key={`doc-${i}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}>
              <DocIcon x={item.x} y={item.y} small={item.small} />
            </g>
          ))}
          {displayNotes.map((item, i) => (
            <g key={`note-${i}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}>
              <NoteIcon x={item.x} y={item.y} small={item.small} />
            </g>
          ))}
          {displayWorkDownItems.map((item, i) => (
            <g key={`work-down-${i}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}>
              {item.kind === "task" && <TaskIcon x={item.x} y={item.y} size={item.size ?? 24} />}
              {item.kind === "doc" && <DocIcon x={item.x} y={item.y} small={item.small} />}
              {item.kind === "note" && <NoteIcon x={item.x} y={item.y} small={item.small} />}
            </g>
          ))}
          {displayPeople.map((item, i) => (
            <g key={`worker-${i}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}>
              <WorkerIcon x={item.x} y={item.y} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}


type DashboardHeaderBlockProps = {
  className?: string;
  greetingName?: string;
  representedCompany?: string;
  variant?: "dashboard" | "moduleMinutes";
};

export default function DashboardHeaderBlock({
  className = "",
  greetingName = "Keserű Benjámin",
  representedCompany = "Nagisz Zrt.",
  variant = "dashboard",
}: DashboardHeaderBlockProps) {
  const isMinutesModule = variant === "moduleMinutes";
  const [topCardsCollapsed, , toggleTopCardsCollapsed] = usePersistentCollapse("shared:top-cards", false);
  const [now, setNow] = React.useState(() => new Date());
  const [weatherTemp, setWeatherTemp] = React.useState<number | null>(null);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [isMinutesModule]);

  React.useEffect(() => {
    if (isMinutesModule) return;
    let cancelled = false;
    const loadWeather = async (lat = 47.4979, lon = 19.0402) => {
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`, { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && typeof data?.current?.temperature_2m === "number") setWeatherTemp(Math.round(data.current.temperature_2m));
      } catch {
        if (!cancelled) setWeatherTemp(null);
      }
    };
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => loadWeather(position.coords.latitude, position.coords.longitude),
        () => loadWeather(),
        { maximumAge: 30 * 60 * 1000, timeout: 5000 }
      );
    } else {
      loadWeather();
    }
    return () => { cancelled = true; };
  }, [isMinutesModule]);

  const formattedDate = now.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).replace(/^./, (c) => c.toUpperCase());
  const formattedTime = now.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={isMinutesModule ? `relative overflow-hidden pb-2 min-h-[220px] pt-0 ${className}` : `relative -mx-8 overflow-hidden px-8 pb-2 min-h-[269px] pt-7 ${className}`}>
      {!isMinutesModule && (
        <>
          <HeroProjectVisual />
          <BuildingFrameOverlay />
          <HeroPulseNodesOverlay compact={false} />
        </>
      )}

      <div className={isMinutesModule ? "relative z-[86] space-y-0" : "relative z-[86] space-y-3"}>
        <div className={isMinutesModule ? "relative px-5 pb-3 pt-0" : "contents"}>
        <header className={isMinutesModule ? "relative z-[120] grid gap-6 xl:grid-cols-[1fr_610px] xl:items-start" : "relative z-[120] grid gap-6 xl:grid-cols-[1fr_760px] xl:items-start"}>
          <div className="relative z-[130] pt-0">
            <div className={isMinutesModule ? "mb-3 flex h-8 max-w-full items-center gap-3 overflow-hidden whitespace-nowrap text-[15px] font-black uppercase tracking-[0.13em] text-[#082f49]" : "mb-7 flex h-11 max-w-full items-center gap-3 overflow-hidden whitespace-nowrap text-[15px] font-black uppercase tracking-[0.13em] text-[#082f49]"}>
              <span className="hidden min-w-0 truncate group-data-[title-mode=long]/main:inline">Digitális Műszaki Projektvezérlő Rendszer</span>
              <span className="hidden min-w-0 truncate group-data-[title-mode=medium]/main:inline">Dig. Műszaki Projektvezérlő Rendszer</span>
              <span className="hidden shrink-0 group-data-[title-mode=short]/main:inline">DIMPROVER</span>
            </div>
            {isMinutesModule && (
              <div className="ml-8 text-3xl font-black tracking-tight text-[#008CFF]">Jegyzőkönyvek</div>
            )}
            {!isMinutesModule && (
              <div className="pl-8">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-slate-800">Üdvözlünk ismét,</p>
                <h1 className="mt-5 text-4xl font-black tracking-tight text-[#008CFF]">{greetingName}!</h1>
                <p className="mt-4 max-w-xl text-base font-semibold text-cyan-500">Képviselt cég: {representedCompany}</p>
              </div>
            )}
          </div>

          <div className="justify-self-end">
            <div className="flex items-start justify-end gap-4">
              <div className={isMinutesModule ? "ml-auto grid gap-3 md:grid-cols-[320px_275px]" : "grid gap-3 md:grid-cols-[320px_275px]"}>
                <button title="Projekt" className="flex h-11 items-center justify-between border border-blue-200/80 bg-white/78 px-4 text-left text-sm font-semibold text-slate-800 shadow-[0_8px_22px_rgba(15,23,42,0.04)] backdrop-blur hover:border-blue-500 hover:text-blue-700">
                  <span className="truncate">Duna Part Lakópark</span>
                  <ChevronDown size={16} className="shrink-0 text-blue-600" />
                </button>
                <button title="Képviselt cég" className="flex h-11 items-center justify-between border border-blue-200/80 bg-white/78 px-4 text-left text-sm font-semibold text-slate-800 shadow-[0_8px_22px_rgba(15,23,42,0.04)] backdrop-blur hover:border-blue-500 hover:text-blue-700">
                  <span className="truncate">{representedCompany}</span>
                  <ChevronDown size={16} className="shrink-0 text-blue-600" />
                </button>
              </div>
              {isMinutesModule ? (
                <div className="min-w-[185px] pt-0 text-right">
                  <div className="text-sm font-semibold text-slate-900">{formattedDate}</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{formattedTime}</div>
                </div>
              ) : (
                <div className="min-w-[245px] pt-0 text-right">
                  <details className="group relative inline-block text-left">
                    <summary title="Aktív csomag" className="flex min-w-[245px] cursor-pointer list-none items-center justify-end gap-2 border border-blue-300/80 bg-white/78 px-3 py-2 shadow-[0_8px_22px_rgba(37,99,235,0.08)] hover:border-blue-400 [&::-webkit-details-marker]:hidden">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-blue-300/80 bg-white/50 text-[10px] font-black text-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.26)]">DP</span>
                      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-500">DIMPROVER</span>
                      <ChevronDown size={14} className="text-blue-600 transition group-open:rotate-180" />
                    </summary>
                    <div className="absolute right-0 top-full z-[230] mt-2 w-[820px] border border-blue-300/80 bg-white/80 p-2 shadow-[0_18px_42px_rgba(15,23,42,0.14)] backdrop-blur-sm">
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { name: "DIMPRO", label: "Alapcsomag", state: "available", logo: "D", box: "border-emerald-300/80 bg-white/50 text-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.22)]", text: "text-emerald-600" },
                          { name: "DIMPRO+", label: "Plusz modulokkal", state: "available", logo: "D+", box: "border-emerald-300/70 bg-white/50 text-teal-500 shadow-[0_0_16px_rgba(16,185,129,0.18)]", text: "text-teal-500" },
                          { name: "DIMPROVER", label: "Aktív felület", state: "active", logo: "DP", box: "border-blue-300/90 bg-white/75 text-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.26)]", text: "text-blue-500" },
                          { name: "DIMPROVER AI", label: "Későbbi fejlesztés", state: "future", logo: "AI", box: "border-indigo-300/70 bg-white/50 text-indigo-400 shadow-[0_0_18px_rgba(99,102,241,0.18)]", text: "text-slate-400" },
                        ].map((pkg) => (
                          <div key={pkg.name} className={pkg.state === "active" ? "flex min-h-[74px] items-start gap-2 border border-blue-200/75 bg-blue-50/66 px-2 py-2" : "flex min-h-[74px] items-start gap-2 border border-blue-200/60 bg-blue-50/42 px-2 py-2 opacity-78"}>
                            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-black ${pkg.box}`}>{pkg.logo}</span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-[11px] font-black uppercase tracking-[0.12em] ${pkg.text}`}>{pkg.name}</span>
                              <span className="block text-[9px] font-semibold text-slate-500/85">{pkg.label}</span>
                              <button type="button" className={pkg.state === "active" ? "mt-2 rounded-full bg-blue-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-blue-600" : pkg.state === "future" ? "mt-2 rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-400" : "mt-2 rounded-full bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-blue-600 ring-1 ring-blue-100"}>
                                {pkg.state === "active" ? "aktív" : pkg.state === "future" ? "később" : "csomagváltás"}
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                  <div className="mt-3 text-sm font-semibold text-slate-900">{formattedDate}</div>
                  <div className="mt-1 flex items-center justify-end gap-3 text-3xl font-bold tabular-nums text-slate-950">
                    <span>{formattedTime}</span>
                    <Sun className="text-amber-400" />
                    <span className="text-base font-medium">{weatherTemp === null ? "--°C" : `${weatherTemp}°C`}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="relative z-[185] flex items-center justify-center gap-4 -mt-1 xl:mt-0">
          <div className="flex h-11 w-full max-w-[520px] items-center gap-3 border border-cyan-300/80 bg-white/86 px-4 shadow-[0_8px_24px_rgba(34,211,238,0.12)] backdrop-blur">
            <Search size={17} className="text-blue-600" />
            <input placeholder="Keresés a rendszerben..." className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          </div>
          <button type="button" onClick={toggleTopCardsCollapsed} className="absolute right-0 flex shrink-0 items-center gap-1 border border-blue-200 bg-white/75 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-600 shadow-sm hover:bg-blue-50">
            {topCardsCollapsed ? "Felső kártyák megnyitása" : "Felső kártyák összecsukása"}
            {topCardsCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
        </div>

        {!topCardsCollapsed && (
          <div className="relative z-[180] border-t-4 border-blue-300/80 bg-white/75 p-0 shadow-[0_10px_24px_rgba(37,99,235,0.12)] backdrop-blur-[2px]">
            {isMinutesModule ? (
              <section className="grid grid-cols-4 gap-2 p-2">
                {minuteTypeCards.map((type) => (
                  <button
                    key={type.title}
                    className={`group relative flex h-[126px] items-center gap-3 overflow-hidden border border-cyan-200/75 px-3 text-left backdrop-blur-[3px] transition hover:border-cyan-100 hover:shadow-md ${typeCardClass(type.title)}`}
                    title={type.description}
                  >
                    <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-white/80" />
                    <span className={`absolute left-3 top-3 h-1.5 w-14 rounded-full ${typeStripClass(type.title)}`} />
                    <span className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center border border-cyan-200/70 bg-cyan-900/70 text-lg font-black text-cyan-50 shadow-sm">{type.icon}</span>
                    <span className="mt-3 min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-950">{type.title}</span>
                      <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-slate-600">{type.description}</span>
                      <span className="mt-3 flex items-center gap-2">
                        <span className="text-xl font-black tabular-nums text-slate-950">{type.count}</span>
                        <span className="text-[11px] font-black text-slate-950">db</span>
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm">{type.open} nyitott</span>
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            ) : (
              <>
                <div className="grid grid-cols-4 bg-white/75 pt-1">
                  {planStats.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="relative flex items-center gap-4 border-r-2 border-blue-300/70 px-5 py-3.5 last:border-r-0">
                        <Icon size={31} className="text-blue-700" />
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-blue-950/80">{s.label}</div>
                          <div className="mt-1 flex items-center gap-3">
                            <span className="text-3xl font-black tabular-nums text-slate-950">{s.value}</span>
                            <span className="rounded-full bg-blue-100/75 px-2 py-1 text-xs font-bold text-blue-900">{s.change}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <section className="grid min-h-[214px] grid-cols-8 grid-rows-4 gap-1.5 p-1.5">
                  {quickLinks.map((l) => (
                    <button key={l.title} className="group relative flex h-[50px] items-center gap-2 border border-cyan-200/75 bg-white/75 px-2 text-left backdrop-blur-[3px] hover:border-cyan-100 hover:bg-cyan-100/75" title={l.subtitle}>
                      <span className="absolute -left-px -top-px h-2.5 w-2.5 border-l-2 border-t-2 border-white/70" />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-cyan-200/70 bg-cyan-900/70 text-[10px] font-black text-cyan-50 shadow-sm">{l.icon}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-bold text-slate-950">{l.title}</span><span className="block truncate text-[10px] text-blue-950/70 opacity-80 group-hover:text-blue-950 group-hover:opacity-100">{l.subtitle}</span></span>
                      <ExternalLink size={12} className="shrink-0 text-slate-500 group-hover:text-white" />
                    </button>
                  ))}
                  <button className="group relative flex h-[50px] items-center justify-center gap-2 border border-cyan-300/80 bg-white/75 px-2 text-left font-black uppercase tracking-[0.08em] text-blue-700 backdrop-blur-[3px] hover:bg-cyan-50" title="Új link hozzáadása">
                    <span className="text-lg leading-none">+</span><span className="text-[11px]">Új link hozzáadása</span>
                  </button>
                </section>
              </>
            )}
            <span className="absolute -right-px -bottom-px h-3 w-3 border-b-2 border-r-2 border-cyan-400/70" />
          </div>
        )}
      </div>
    </div>
  );
}
