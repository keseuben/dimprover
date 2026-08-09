"use client";

import React from "react";

type VisualMode = "login" | "focus" | "module";

type MotionItem = {
  kind: "task" | "doc" | "note" | "person" | "node";
  x: number;
  y: number;
  size?: number;
  small?: boolean;
  cls: string;
  delay: number;
};

const baseTasks: MotionItem[] = [
  { kind: "task", x: 170, y: 94, size: 30, cls: "dm-task-drop", delay: 0.3 },
  { kind: "task", x: 338, y: 126, size: 24, cls: "dm-task-drop", delay: 1.0 },
  { kind: "task", x: 530, y: 82, size: 28, cls: "dm-task-drop", delay: 1.8 },
  { kind: "task", x: 690, y: 150, size: 26, cls: "dm-task-drop", delay: 2.6 },
  { kind: "task", x: 895, y: 105, size: 31, cls: "dm-task-drop", delay: 3.4 },
  { kind: "task", x: 1088, y: 132, size: 27, cls: "dm-task-drop", delay: 4.2 },
  { kind: "task", x: 1250, y: 86, size: 32, cls: "dm-task-drop", delay: 5.0 },
  { kind: "task", x: 1382, y: 165, size: 26, cls: "dm-task-drop", delay: 5.8 },
  { kind: "task", x: 275, y: 238, size: 34, cls: "dm-task-drop", delay: 6.6 },
  { kind: "task", x: 610, y: 252, size: 29, cls: "dm-task-drop", delay: 7.4 },
  { kind: "task", x: 985, y: 238, size: 33, cls: "dm-task-drop", delay: 8.2 },
  { kind: "task", x: 1215, y: 270, size: 30, cls: "dm-task-drop", delay: 9.0 },
];

const baseDocs: MotionItem[] = [
  { kind: "doc", x: 185, y: 76, small: true, cls: "dm-work-down-c", delay: 0.7 },
  { kind: "doc", x: 225, y: 130, small: true, cls: "dm-work-down-b", delay: 1.1 },
  { kind: "doc", x: 410, y: 112, small: true, cls: "dm-work-down-b", delay: 2.4 },
  { kind: "doc", x: 590, y: 112, cls: "dm-work-down-a", delay: 3.8 },
  { kind: "doc", x: 785, y: 98, cls: "dm-work-down-a", delay: 5.1 },
  { kind: "doc", x: 925, y: 74, small: true, cls: "dm-work-down-c", delay: 6.1 },
  { kind: "doc", x: 965, y: 142, small: true, cls: "dm-work-down-b", delay: 6.5 },
  { kind: "doc", x: 1148, y: 70, small: true, cls: "dm-work-down-a", delay: 7.9 },
  { kind: "doc", x: 1338, y: 118, small: true, cls: "dm-work-down-a", delay: 9.2 },
  { kind: "doc", x: 1485, y: 96, small: true, cls: "dm-work-down-b", delay: 10.5 },
  { kind: "doc", x: 760, y: 218, small: true, cls: "dm-work-down-b", delay: 12.0 },
  { kind: "doc", x: 930, y: 214, cls: "dm-work-down-a", delay: 12.5 },
  { kind: "doc", x: 1350, y: 222, small: true, cls: "dm-work-down-b", delay: 13.6 },
];

const baseNotes: MotionItem[] = [
  { kind: "note", x: 305, y: 58, cls: "dm-work-down-a", delay: 1.6 },
  { kind: "note", x: 345, y: 82, small: true, cls: "dm-work-down-c", delay: 2.0 },
  { kind: "note", x: 660, y: 70, small: true, cls: "dm-work-down-b", delay: 4.2 },
  { kind: "note", x: 715, y: 166, small: true, cls: "dm-work-down-c", delay: 4.7 },
  { kind: "note", x: 1090, y: 102, cls: "dm-work-down-c", delay: 7.4 },
  { kind: "note", x: 1275, y: 84, cls: "dm-work-down-c", delay: 8.8 },
  { kind: "note", x: 1400, y: 180, small: true, cls: "dm-work-down-c", delay: 10.1 },
  { kind: "note", x: 520, y: 228, small: true, cls: "dm-work-down-c", delay: 11.5 },
  { kind: "note", x: 1165, y: 226, small: true, cls: "dm-work-down-c", delay: 13.0 },
];

const basePeople: MotionItem[] = [
  { kind: "person", x: 238, y: 142, cls: "dm-worker-tl-a", delay: 0.6 },
  { kind: "person", x: 328, y: 132, cls: "dm-worker-tl-b", delay: 0.6 },
  { kind: "person", x: 284, y: 164, cls: "dm-worker-tl-c", delay: 0.6 },
  { kind: "person", x: 690, y: 148, cls: "dm-worker-mid-a", delay: 4.4 },
  { kind: "person", x: 790, y: 160, cls: "dm-worker-mid-b", delay: 4.4 },
  { kind: "person", x: 740, y: 184, cls: "dm-worker-mid-c", delay: 4.4 },
  { kind: "person", x: 1195, y: 146, cls: "dm-worker-right-a", delay: 8.5 },
  { kind: "person", x: 1302, y: 162, cls: "dm-worker-right-b", delay: 8.5 },
  { kind: "person", x: 1248, y: 188, cls: "dm-worker-right-c", delay: 8.5 },
  { kind: "person", x: 515, y: 170, cls: "dm-person-solo", delay: 2.8 },
  { kind: "person", x: 1018, y: 178, cls: "dm-person-solo", delay: 6.8 },
];

const baseNodes = [[210, 252], [250, 174], [390, 145], [560, 212], [740, 190], [930, 168], [1015, 126], [1160, 150], [1288, 132], [1390, 166], [1055, 238], [1245, 190], [525, 270], [875, 236], [1360, 276]];

const focusExtra: MotionItem[] = [
  { kind: "task", x: 122, y: 620, size: 42, cls: "dm-task-drift-a", delay: 7.6 },
  { kind: "task", x: 365, y: 690, size: 36, cls: "dm-task-drift-b", delay: 4.7 },
  { kind: "task", x: 1015, y: 640, size: 50, cls: "dm-task-drift-c", delay: 5.8 },
  { kind: "task", x: 1340, y: 610, size: 40, cls: "dm-task-drift-a", delay: 8.2 },
  { kind: "doc", x: 230, y: 470, cls: "dm-doc-deliver-a", delay: 6.4 },
  { kind: "doc", x: 460, y: 555, cls: "dm-doc-deliver-b", delay: 7.0 },
  { kind: "doc", x: 640, y: 710, cls: "dm-doc-deliver-c", delay: 7.6 },
  { kind: "doc", x: 805, y: 520, cls: "dm-doc-deliver-a", delay: 8.2 },
  { kind: "doc", x: 965, y: 735, cls: "dm-doc-deliver-b", delay: 8.8 },
  { kind: "doc", x: 1165, y: 515, cls: "dm-doc-deliver-c", delay: 9.4 },
  { kind: "doc", x: 1315, y: 725, cls: "dm-doc-deliver-a", delay: 10.0 },
  { kind: "person", x: 330, y: 645, cls: "dm-worker-tl-a", delay: 7.4 },
  { kind: "person", x: 390, y: 645, cls: "dm-worker-tl-b", delay: 7.4 },
  { kind: "person", x: 360, y: 645, cls: "dm-worker-tl-c", delay: 7.4 },
  { kind: "person", x: 1150, y: 690, cls: "dm-person-solo", delay: 8.6 },
  { kind: "person", x: 1330, y: 510, cls: "dm-person-solo", delay: 9.8 },
];

function TaskIcon({ x, y, size = 28 }: { x: number; y: number; size?: number }) {
  const h = size / 2;
  return (
    <g stroke="#67e8f9" strokeWidth="0.95" opacity="0.66" strokeLinecap="round" strokeLinejoin="round">
      <rect x={x - h} y={y - h} width={size} height={size} rx="4" />
      <path d={`M${x - h * 0.55} ${y} L${x - h * 0.15} ${y + h * 0.42} L${x + h * 0.62} ${y - h * 0.56}`} />
    </g>
  );
}

function DocIcon({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
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
}

function NoteIcon({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  const w = small ? 13 : 17;
  const h = small ? 16 : 21;
  return (
    <g stroke="#60a5fa" strokeWidth={small ? "0.8" : "0.95"} opacity={small ? "0.52" : "0.64"} strokeLinecap="round" strokeLinejoin="round">
      <rect x={x - w} y={y - h} width={w * 2} height={h * 2} rx="2.5" />
      <path d={`M${x - w * 0.55} ${y - h * 0.35} H${x + w * 0.55} M${x - w * 0.55} ${y + 1} H${x + w * 0.35} M${x - w * 0.55} ${y + h * 0.35} H${x + w * 0.15}`} />
    </g>
  );
}

function WorkerIcon({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="#67e8f9" strokeWidth="1.15" opacity="0.90" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={x} cy={y - 10} r="10" />
      <path d={`M${x - 24} ${y + 28} C${x - 15} ${y + 8} ${x + 15} ${y + 8} ${x + 24} ${y + 28}`} />
      <path d={`M${x - 12} ${y + 4} C${x - 6} ${y + 12} ${x + 6} ${y + 12} ${x + 12} ${y + 4}`} opacity="0.55" />
    </g>
  );
}

export default function DimproMotionBackdrop({ mode, dark = false, className = "", density = "normal" }: { mode: VisualMode; dark?: boolean; className?: string; density?: "normal" | "compact" }) {
  const isFocus = mode === "focus";
  const isModule = mode === "module";
  const moduleItems = [...baseTasks.slice(0, 5), ...baseDocs.slice(0, 6), ...baseNotes.slice(0, 4), ...basePeople.slice(0, 5)];
  const items = isFocus ? [...baseTasks, ...baseDocs, ...baseNotes, ...basePeople, ...focusExtra] : isModule || density === "compact" ? moduleItems : [...baseTasks, ...baseDocs, ...baseNotes, ...basePeople];
  const moduleNodes = baseNodes.slice(0, 8);
  const nodes = isFocus ? [...baseNodes, [122, 620], [365, 690], [1015, 640], [1340, 610], [805, 520], [1165, 515], [360, 645], [1330, 510]] : isModule || density === "compact" ? moduleNodes : baseNodes;
  const viewBox = isFocus ? "0 0 1440 820" : "0 0 1440 430";

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <style>{`
        .dm-scan-x{animation:dmScanX 16s linear infinite}.dm-scan-y{animation:dmScanY 18s linear infinite}.dm-node{animation:dmNodeDrift 18s ease-in-out infinite;transform-origin:center}.dm-work-down-a{animation:dmWorkDownA 15s ease-in-out infinite}.dm-work-down-b{animation:dmWorkDownB 17s ease-in-out infinite}.dm-work-down-c{animation:dmWorkDownC 19s ease-in-out infinite}.dm-task-drop{animation:dmTaskDrop 14s ease-in-out infinite}.dm-task-drift-a{animation:dmTaskDriftA 24s ease-in-out infinite}.dm-task-drift-b{animation:dmTaskDriftB 27s ease-in-out infinite}.dm-task-drift-c{animation:dmTaskDriftC 29s ease-in-out infinite}.dm-doc-deliver-a{animation:dmDocDeliverA 15s ease-in-out infinite}.dm-doc-deliver-b{animation:dmDocDeliverB 17s ease-in-out infinite}.dm-doc-deliver-c{animation:dmDocDeliverC 19s ease-in-out infinite}.dm-person-solo{animation:dmPersonSolo 32s ease-in-out infinite}.dm-worker-tl-a{animation:dmWorkerA 32s ease-in-out infinite}.dm-worker-tl-b{animation:dmWorkerB 32s ease-in-out infinite}.dm-worker-tl-c{animation:dmWorkerC 32s ease-in-out infinite}.dm-worker-mid-a{animation:dmWorkerMidA 36s ease-in-out infinite}.dm-worker-mid-b{animation:dmWorkerMidB 36s ease-in-out infinite}.dm-worker-mid-c{animation:dmWorkerMidC 36s ease-in-out infinite}.dm-worker-right-a{animation:dmWorkerRightA 42s ease-in-out infinite}.dm-worker-right-b{animation:dmWorkerRightB 42s ease-in-out infinite}.dm-worker-right-c{animation:dmWorkerRightC 42s ease-in-out infinite}
        @keyframes dmScanX{0%{transform:translateX(-180px);opacity:0}12%{opacity:.25}58%{opacity:.25}100%{transform:translateX(1500px);opacity:0}}@keyframes dmScanY{0%{transform:translateY(-90px);opacity:0}14%{opacity:.18}64%{opacity:.18}100%{transform:translateY(860px);opacity:0}}@keyframes dmNodeDrift{0%,100%{transform:translate3d(-22px,18px,0) scale(.92);opacity:.34}22%,78%{opacity:.82}54%{transform:translate3d(88px,42px,0) scale(1.12)}}@keyframes dmTaskDrop{0%,100%{transform:translate3d(-4px,-52px,0);opacity:.12}20%,80%{opacity:.72}52%{transform:translate3d(5px,86px,0)}}@keyframes dmWorkDownA{0%{transform:translate3d(-10px,-96px,0) scale(.74);opacity:0}14%{opacity:.62}72%{transform:translate3d(12px,255px,0) scale(.98);opacity:.62}100%{transform:translate3d(18px,355px,0) scale(.82);opacity:0}}@keyframes dmWorkDownB{0%{transform:translate3d(14px,-120px,0) scale(.70);opacity:0}16%{opacity:.58}74%{transform:translate3d(-16px,275px,0) scale(1.02);opacity:.58}100%{transform:translate3d(-20px,375px,0) scale(.82);opacity:0}}@keyframes dmWorkDownC{0%{transform:translate3d(0,-108px,0) scale(.78);opacity:0}12%{opacity:.56}70%{transform:translate3d(6px,265px,0) scale(.98);opacity:.56}100%{transform:translate3d(8px,365px,0) scale(.82);opacity:0}}
        @keyframes dmTaskDriftA{0%{transform:translate3d(-72px,18px,0) scale(.96);opacity:0}14%,58%{opacity:.76}70%,100%{transform:translate3d(120px,-42px,0) scale(.58);opacity:0}}@keyframes dmTaskDriftB{0%{transform:translate3d(70px,-22px,0) scale(.96);opacity:0}14%,58%{opacity:.74}70%,100%{transform:translate3d(-125px,48px,0) scale(.58);opacity:0}}@keyframes dmTaskDriftC{0%{transform:translate3d(-36px,70px,0) scale(.96);opacity:0}14%,58%{opacity:.72}70%,100%{transform:translate3d(130px,-88px,0) scale(.58);opacity:0}}@keyframes dmDocDeliverA{0%{transform:translate3d(-105px,-24px,0) scale(.96);opacity:0}12%,54%{opacity:.68}68%,100%{transform:translate3d(138px,46px,0) scale(.45);opacity:0}}@keyframes dmDocDeliverB{0%{transform:translate3d(98px,-38px,0) scale(.96);opacity:0}12%,54%{opacity:.68}68%,100%{transform:translate3d(-142px,58px,0) scale(.45);opacity:0}}@keyframes dmDocDeliverC{0%{transform:translate3d(-42px,88px,0) scale(.96);opacity:0}12%,54%{opacity:.64}68%,100%{transform:translate3d(150px,-108px,0) scale(.45);opacity:0}}
        @keyframes dmPersonSolo{0%,100%{transform:translate3d(-52px,24px,0);opacity:.18}20%,78%{opacity:.82}52%{transform:translate3d(82px,-42px,0)}}@keyframes dmWorkerA{0%{transform:translate3d(-72px,118px,0);opacity:0}18%{opacity:.82}42%,56%{transform:translate3d(-10px,0,0);opacity:.82}100%{transform:translate3d(52px,34px,0);opacity:0}}@keyframes dmWorkerB{0%{transform:translate3d(74px,124px,0);opacity:0}18%{opacity:.82}42%,56%{transform:translate3d(12px,0,0);opacity:.82}100%{transform:translate3d(-58px,38px,0);opacity:0}}@keyframes dmWorkerC{0%{transform:translate3d(0,132px,0);opacity:0}18%{opacity:.82}42%,56%{transform:translate3d(0,10px,0);opacity:.82}100%{transform:translate3d(38px,-58px,0);opacity:0}}@keyframes dmWorkerMidA{0%{transform:translate3d(-104px,118px,0);opacity:0}20%{opacity:.78}44%,58%{transform:translate3d(-14px,0,0);opacity:.78}100%{transform:translate3d(68px,52px,0);opacity:0}}@keyframes dmWorkerMidB{0%{transform:translate3d(96px,118px,0);opacity:0}20%{opacity:.78}44%,58%{transform:translate3d(12px,0,0);opacity:.78}100%{transform:translate3d(-76px,46px,0);opacity:0}}@keyframes dmWorkerMidC{0%{transform:translate3d(0,132px,0);opacity:0}20%{opacity:.78}44%,58%{transform:translate3d(0,12px,0);opacity:.78}100%{transform:translate3d(30px,-82px,0);opacity:0}}@keyframes dmWorkerRightA{0%{transform:translate3d(-118px,126px,0);opacity:0}24%{opacity:.76}48%,62%{transform:translate3d(-16px,0,0);opacity:.76}100%{transform:translate3d(82px,-48px,0);opacity:0}}@keyframes dmWorkerRightB{0%{transform:translate3d(112px,122px,0);opacity:0}24%{opacity:.76}48%,62%{transform:translate3d(14px,0,0);opacity:.76}100%{transform:translate3d(-86px,-42px,0);opacity:0}}@keyframes dmWorkerRightC{0%{transform:translate3d(0,116px,0);opacity:0}24%{opacity:.76}48%,62%{transform:translate3d(0,-10px,0);opacity:.76}100%{transform:translate3d(62px,70px,0);opacity:0}}
        @media (prefers-reduced-motion: reduce){.dm-scan-x,.dm-scan-y,.dm-node,.dm-work-down-a,.dm-work-down-b,.dm-work-down-c,.dm-task-drop,.dm-task-drift-a,.dm-task-drift-b,.dm-task-drift-c,.dm-doc-deliver-a,.dm-doc-deliver-b,.dm-doc-deliver-c,.dm-person-solo,.dm-worker-tl-a,.dm-worker-tl-b,.dm-worker-tl-c,.dm-worker-mid-a,.dm-worker-mid-b,.dm-worker-mid-c,.dm-worker-right-a,.dm-worker-right-b,.dm-worker-right-c{animation:none}}
      `}</style>
      <div className={dark ? "absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(37,99,235,.24)_0%,rgba(96,165,250,.13)_28%,rgba(2,6,23,0)_58%),linear-gradient(180deg,rgba(3,17,38,.98)_0%,rgba(6,27,52,.94)_48%,rgba(3,17,38,.98)_100%)]" : "absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(37,99,235,.22)_0%,rgba(96,165,250,.12)_28%,rgba(255,255,255,0)_58%),linear-gradient(180deg,rgba(235,247,255,.96)_0%,rgba(248,252,255,.90)_46%,rgba(255,255,255,1)_100%)]"} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.92)_0%,rgba(255,255,255,.66)_25%,rgba(255,255,255,.20)_62%,rgba(255,255,255,.34)_100%)] dark:bg-[linear-gradient(90deg,rgba(3,17,38,.44)_0%,rgba(3,17,38,.18)_45%,rgba(3,17,38,.38)_100%)]" />
      <div className="absolute -right-24 -top-24 h-[520px] w-[820px] rounded-full bg-sky-300/30 blur-2xl dark:bg-blue-700/28" />
      <div className="absolute inset-0 opacity-[0.72] [background-image:linear-gradient(rgba(37,99,235,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.12)_1px,transparent_1px)] [background-size:64px_64px] dark:opacity-[0.34]" />
      <svg className="absolute inset-0 h-full w-full" viewBox={viewBox} preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <filter id={`dmGlow-${mode}`} x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g opacity="0.36" filter={`url(#dmGlow-${mode})`}>
          <rect className="dm-scan-x" x="0" y="10" width="4" height={isFocus ? "790" : "410"} fill="#67e8f9" opacity="0.42" />
          <rect className="dm-scan-x" x="-130" y="44" width="2" height={isFocus ? "720" : "320"} fill="#1d4ed8" opacity="0.30" style={{ animationDelay: "5.5s" }} />
          <rect className="dm-scan-y" x="40" y="0" width="1340" height="3" fill="#67e8f9" opacity="0.32" />
          <rect className="dm-scan-y" x="180" y="-70" width="980" height="2" fill="#1d4ed8" opacity="0.22" style={{ animationDelay: "7s" }} />
        </g>
        <g filter={`url(#dmGlow-${mode})`}>
          {nodes.map(([cx, cy], i) => (
            <g key={`${mode}-node-${i}`} className="dm-node" style={{ animationDelay: `${i * 0.8}s` }}>
              <circle cx={cx} cy={cy} r="11" fill="#22d3ee" opacity="0.18" />
              <circle cx={cx} cy={cy} r="4.2" fill="#1d4ed8" opacity="0.64" />
              <circle cx={cx} cy={cy} r="1.4" fill="#ffffff" opacity="0.82" />
            </g>
          ))}
        </g>
        <g filter={`url(#dmGlow-${mode})`}>
          {items.map((item, i) => (
            <g key={`${mode}-item-${i}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}>
              {item.kind === "task" && <TaskIcon x={item.x} y={item.y} size={item.size} />}
              {item.kind === "doc" && <DocIcon x={item.x} y={item.y} small={item.small} />}
              {item.kind === "note" && <NoteIcon x={item.x} y={item.y} small={item.small} />}
              {item.kind === "person" && <WorkerIcon x={item.x} y={item.y} />}
            </g>
          ))}
        </g>
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-b from-transparent via-white/65 to-white dark:via-slate-950/18 dark:to-slate-950/22" />
    </div>
  );
}
