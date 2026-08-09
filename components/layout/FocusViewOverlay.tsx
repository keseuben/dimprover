"use client";

import { CalendarCheck2, CloudSun, FileCheck2, FolderKanban, Monitor, MousePointer2, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import DimproBrandMark from "./DimproBrandMark";
import DimproMotionBackdrop from "./DimproMotionBackdrop";

const quickStats = [
  { label: "Aktív projektek", value: "12", suffix: "db", icon: FolderKanban, color: "text-sky-500" },
  { label: "Mai teendők", value: "6", suffix: "db", icon: CalendarCheck2, color: "text-emerald-500" },
  { label: "Mai kooperációk", value: "3", suffix: "db", icon: UsersRound, color: "text-amber-500" },
  { label: "Jóváhagyásra vár", value: "4", suffix: "db", icon: FileCheck2, color: "text-violet-500" },
];


function FocusSystemVisual({ dark = false }: { dark?: boolean }) {
  const tasks = [
    { x: 85, y: 120, size: 34, cls: "focus-task-a", delay: 0.0 }, { x: 210, y: 245, size: 48, cls: "focus-task-b", delay: 1.3 },
    { x: 390, y: 140, size: 38, cls: "focus-task-c", delay: 2.4 }, { x: 560, y: 335, size: 44, cls: "focus-task-a", delay: 3.2 },
    { x: 720, y: 95, size: 36, cls: "focus-task-b", delay: 4.1 }, { x: 890, y: 255, size: 52, cls: "focus-task-c", delay: 2.0 },
    { x: 1080, y: 150, size: 42, cls: "focus-task-a", delay: 5.1 }, { x: 1265, y: 310, size: 46, cls: "focus-task-b", delay: 6.0 },
    { x: 1380, y: 185, size: 34, cls: "focus-task-c", delay: 6.9 }, { x: 122, y: 620, size: 42, cls: "focus-task-a", delay: 7.6 },
    { x: 365, y: 690, size: 36, cls: "focus-task-b", delay: 4.7 }, { x: 1015, y: 640, size: 50, cls: "focus-task-c", delay: 5.8 },
    { x: 1340, y: 610, size: 40, cls: "focus-task-a", delay: 8.2 },
  ];
  const docs = [
    { x: 155, y: 85, cls: "focus-doc-a", delay: 0.4 }, { x: 320, y: 210, cls: "focus-doc-b", delay: 1.1 },
    { x: 505, y: 105, cls: "focus-doc-c", delay: 2.7 }, { x: 690, y: 275, cls: "focus-doc-a", delay: 3.6 },
    { x: 835, y: 145, cls: "focus-doc-b", delay: 4.8 }, { x: 1015, y: 330, cls: "focus-doc-c", delay: 5.2 },
    { x: 1190, y: 92, cls: "focus-doc-b", delay: 2.2 }, { x: 1360, y: 390, cls: "focus-doc-c", delay: 6.0 },
    { x: 230, y: 470, cls: "focus-doc-a", delay: 6.4 }, { x: 460, y: 555, cls: "focus-doc-b", delay: 7.0 },
    { x: 640, y: 710, cls: "focus-doc-c", delay: 7.6 }, { x: 805, y: 520, cls: "focus-doc-a", delay: 8.2 },
    { x: 965, y: 735, cls: "focus-doc-b", delay: 8.8 }, { x: 1165, y: 515, cls: "focus-doc-c", delay: 9.4 },
    { x: 1315, y: 725, cls: "focus-doc-a", delay: 10.0 }, { x: 90, y: 360, cls: "focus-doc-b", delay: 10.6 },
    { x: 1420, y: 95, cls: "focus-doc-c", delay: 11.2 }, { x: 760, y: 410, cls: "focus-doc-a", delay: 11.8 },
  ];
  const people = [
    { x: 175, y: 305, cls: "focus-person-solo-a", delay: 0.2 },
    { x: 330, y: 405, cls: "focus-person-solo-b", delay: 2.4 },
    { x: 555, y: 205, cls: "focus-person-pair-a", delay: 1.2 }, { x: 615, y: 205, cls: "focus-person-pair-b", delay: 1.2 },
    { x: 870, y: 455, cls: "focus-person-trio-a", delay: 3.2 }, { x: 930, y: 455, cls: "focus-person-trio-b", delay: 3.2 }, { x: 900, y: 455, cls: "focus-person-trio-c", delay: 3.2 },
    { x: 1180, y: 260, cls: "focus-person-pair-a", delay: 5.8 }, { x: 1240, y: 260, cls: "focus-person-pair-b", delay: 5.8 },
    { x: 330, y: 645, cls: "focus-person-trio-a", delay: 7.4 }, { x: 390, y: 645, cls: "focus-person-trio-b", delay: 7.4 }, { x: 360, y: 645, cls: "focus-person-trio-c", delay: 7.4 },
    { x: 1150, y: 690, cls: "focus-person-solo-a", delay: 8.6 },
    { x: 1330, y: 510, cls: "focus-person-solo-b", delay: 9.8 },
  ];
  const nodes = [[85,120],[210,245],[390,140],[560,335],[720,95],[890,255],[1080,150],[1265,310],[1380,185],[122,620],[365,690],[1015,640],[1340,610],[175,305],[585,205],[900,455],[1210,260],[360,645],[1150,690],[1330,510]];

  const TaskIcon = ({ x, y, size }: { x: number; y: number; size: number }) => {
    const h = size / 2;
    return <g stroke="#67e8f9" strokeWidth="1.15" opacity="0.88" strokeLinecap="round" strokeLinejoin="round"><rect x={x - h} y={y - h} width={size} height={size} rx="6" /><path d={`M${x - h * 0.52} ${y} L${x - h * 0.12} ${y + h * 0.40} L${x + h * 0.58} ${y - h * 0.52}`} /></g>;
  };
  const DocIcon = ({ x, y }: { x: number; y: number }) => <g stroke="#67e8f9" strokeWidth="0.9" opacity="0.72" strokeLinecap="round" strokeLinejoin="round"><path d={`M${x - 13} ${y - 17} H${x + 7} L${x + 15} ${y - 9} V${y + 17} H${x - 13} Z`} /><path d={`M${x + 7} ${y - 17} V${y - 9} H${x + 15}`} /><path d={`M${x - 6} ${y - 2} H${x + 6} M${x - 6} ${y + 7} H${x + 4}`} /></g>;
  const PersonIcon = ({ x, y }: { x: number; y: number }) => <g stroke="#67e8f9" strokeWidth="1.05" opacity="0.78" strokeLinecap="round" strokeLinejoin="round"><circle cx={x} cy={y - 7} r="7" /><path d={`M${x - 17} ${y + 20} C${x - 10} ${y + 5} ${x + 10} ${y + 5} ${x + 17} ${y + 20}`} /></g>;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        .focus-line-a{stroke-dasharray:210 240;animation:focusDataFlow 26s linear infinite}.focus-line-b{stroke-dasharray:170 230;animation:focusDataFlow 31s linear infinite reverse}.focus-scan-x{animation:focusScanX 18s linear infinite}.focus-scan-y{animation:focusScanY 22s linear infinite}.focus-node{transform-origin:center;animation:focusPulse 13s ease-in-out infinite}.focus-task-a{animation:focusTaskA 24s ease-in-out infinite}.focus-task-b{animation:focusTaskB 27s ease-in-out infinite}.focus-task-c{animation:focusTaskC 29s ease-in-out infinite}.focus-doc-a{animation:focusDocA 15s ease-in-out infinite}.focus-doc-b{animation:focusDocB 17s ease-in-out infinite}.focus-doc-c{animation:focusDocC 19s ease-in-out infinite}.focus-person-solo-a{animation:focusPersonSoloA 32s ease-in-out infinite}.focus-person-solo-b{animation:focusPersonSoloB 36s ease-in-out infinite}.focus-person-pair-a{animation:focusPersonPairA 34s ease-in-out infinite}.focus-person-pair-b{animation:focusPersonPairB 34s ease-in-out infinite}.focus-person-trio-a{animation:focusPersonTrioA 38s ease-in-out infinite}.focus-person-trio-b{animation:focusPersonTrioB 38s ease-in-out infinite}.focus-person-trio-c{animation:focusPersonTrioC 38s ease-in-out infinite}
        @keyframes focusDataFlow{0%{stroke-dashoffset:420;opacity:0}12%{opacity:.62}66%{opacity:.62}100%{stroke-dashoffset:-520;opacity:0}}@keyframes focusScanX{0%{transform:translateX(-220px);opacity:0}15%,65%{opacity:.30}100%{transform:translateX(1580px);opacity:0}}@keyframes focusScanY{0%{transform:translateY(-120px);opacity:0}15%,65%{opacity:.24}100%{transform:translateY(920px);opacity:0}}@keyframes focusPulse{0%,100%{opacity:.24;transform:scale(.86)}50%{opacity:.60;transform:scale(1.24)}}
        @keyframes focusTaskA{0%{transform:translate3d(-72px,18px,0) scale(.96);opacity:0}14%,58%{opacity:.86}70%,100%{transform:translate3d(120px,-42px,0) scale(.58);opacity:0}}@keyframes focusTaskB{0%{transform:translate3d(70px,-22px,0) scale(.96);opacity:0}14%,58%{opacity:.84}70%,100%{transform:translate3d(-125px,48px,0) scale(.58);opacity:0}}@keyframes focusTaskC{0%{transform:translate3d(-36px,70px,0) scale(.96);opacity:0}14%,58%{opacity:.82}70%,100%{transform:translate3d(130px,-88px,0) scale(.58);opacity:0}}
        @keyframes focusDocA{0%{transform:translate3d(-105px,-24px,0) scale(.96);opacity:0}12%,54%{opacity:.78}68%,100%{transform:translate3d(138px,46px,0) scale(.45);opacity:0}}@keyframes focusDocB{0%{transform:translate3d(98px,-38px,0) scale(.96);opacity:0}12%,54%{opacity:.78}68%,100%{transform:translate3d(-142px,58px,0) scale(.45);opacity:0}}@keyframes focusDocC{0%{transform:translate3d(-42px,88px,0) scale(.96);opacity:0}12%,54%{opacity:.74}68%,100%{transform:translate3d(150px,-108px,0) scale(.45);opacity:0}}
        @keyframes focusPersonSoloA{0%,100%{transform:translate3d(-54px,22px,0);opacity:.14}22%,76%{opacity:.78}52%{transform:translate3d(72px,-36px,0)}}@keyframes focusPersonSoloB{0%,100%{transform:translate3d(56px,-20px,0);opacity:.14}22%,76%{opacity:.78}52%{transform:translate3d(-78px,44px,0)}}@keyframes focusPersonPairA{0%{transform:translate3d(-98px,-28px,0);opacity:0}20%{opacity:.78}44%,58%{transform:translate3d(-12px,0,0);opacity:.78}100%{transform:translate3d(74px,54px,0);opacity:0}}@keyframes focusPersonPairB{0%{transform:translate3d(98px,-28px,0);opacity:0}20%{opacity:.78}44%,58%{transform:translate3d(12px,0,0);opacity:.78}100%{transform:translate3d(-76px,52px,0);opacity:0}}@keyframes focusPersonTrioA{0%{transform:translate3d(-118px,-36px,0);opacity:0}22%{opacity:.78}46%,62%{transform:translate3d(-14px,0,0);opacity:.78}100%{transform:translate3d(82px,54px,0);opacity:0}}@keyframes focusPersonTrioB{0%{transform:translate3d(118px,-34px,0);opacity:0}22%{opacity:.78}46%,62%{transform:translate3d(14px,0,0);opacity:.78}100%{transform:translate3d(-86px,50px,0);opacity:0}}@keyframes focusPersonTrioC{0%{transform:translate3d(0,92px,0);opacity:0}22%{opacity:.78}46%,62%{transform:translate3d(0,12px,0);opacity:.78}100%{transform:translate3d(40px,-88px,0);opacity:0}}
      `}</style>
      <div className={`absolute inset-0 ${dark ? "bg-[radial-gradient(circle_at_72%_12%,rgba(37,99,235,.30),transparent_44%),linear-gradient(180deg,#031126_0%,#061b34_52%,#031126_100%)]" : "bg-[radial-gradient(circle_at_72%_12%,rgba(37,99,235,.26),transparent_52%),linear-gradient(180deg,rgba(226,246,255,.98)_0%,rgba(239,250,255,.94)_48%,rgba(255,255,255,.92)_100%)]"}`} />
      <div className="absolute inset-0 opacity-[0.58] [background-image:linear-gradient(rgba(37,99,235,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.18)_1px,transparent_1px)] [background-size:72px_72px]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 820" preserveAspectRatio="none" fill="none">
        <defs><filter id="focusGlow" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="focusTrace" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fff" stopOpacity="0"/><stop offset="45%" stopColor="#67e8f9" stopOpacity=".78"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
        <g stroke="url(#focusTrace)" strokeLinecap="round" filter="url(#focusGlow)"><path className="focus-line-a" d="M0 360 L210 260 L420 330 L640 220 L880 300 L1140 210 L1440 285" strokeWidth="2"/><path className="focus-line-b" d="M0 520 L240 430 L520 500 L740 395 L1030 470 L1240 365 L1440 410" strokeWidth="1.6"/></g>
        <g className="focus-scan-x" stroke="#67e8f9" strokeWidth="2" opacity=".22" filter="url(#focusGlow)"><path d="M0 95 V760"/><path d="M34 140 V735" opacity=".35"/></g>
        <g className="focus-scan-y" stroke="#67e8f9" strokeWidth="1.6" opacity=".18" filter="url(#focusGlow)"><path d="M110 0 H1320"/><path d="M210 28 H1210" opacity=".35"/></g>
        <g filter="url(#focusGlow)">{nodes.map(([cx, cy], i) => <g key={`focus-node-${i}`} className="focus-node" style={{ animationDelay: `${i * .42}s` }}><circle cx={cx} cy={cy} r="14" fill="#38bdf8" opacity=".18"/><circle cx={cx} cy={cy} r="4.5" fill="#2563eb" opacity=".50"/><circle cx={cx} cy={cy} r="1.7" fill="#fff" opacity=".8"/></g>)}</g>
        <g filter="url(#focusGlow)">{tasks.map((item) => <g key={`focus-task-${item.x}-${item.y}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}><TaskIcon x={item.x} y={item.y} size={item.size}/></g>)}{docs.map((item) => <g key={`focus-doc-${item.x}-${item.y}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}><DocIcon x={item.x} y={item.y}/></g>)}{people.map((item) => <g key={`focus-person-${item.x}-${item.y}`} className={item.cls} style={{ animationDelay: `${item.delay}s` }}><PersonIcon x={item.x} y={item.y}/></g>)}</g>
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,.42)_0%,rgba(255,255,255,.08)_42%,rgba(255,255,255,.26)_100%)] dark:bg-[linear-gradient(90deg,rgba(3,17,38,.48)_0%,rgba(3,17,38,.08)_45%,rgba(3,17,38,.42)_100%)]" />
    </div>
  );
}

function getTimeParts() {
  const now = new Date();
  return {
    time: now.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" }),
    seconds: now.toLocaleTimeString("hu-HU", { second: "2-digit" }),
    date: now.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "long" }),
  };
}

export default function FocusViewOverlay() {
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState(getTimeParts);

  const isDark = useMemo(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  }, [open]);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setClock(getTimeParts()), 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isFocusShortcut =
        (event.ctrlKey || event.metaKey) &&
        event.altKey &&
        (event.code === "Space" || key === "8");

      if (isFocusShortcut) {
        event.preventDefault();
        setOpen((current) => !current);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const idleTimer = window.setTimeout(() => setOpen(true), 1000 * 60 * 8);
    window.addEventListener("keydown", handleKey);

    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-7 z-[9999] hidden h-14 w-14 items-center justify-center rounded-2xl border border-sky-400/40 bg-slate-950 text-sky-200 shadow-xl shadow-slate-900/25 hover:bg-slate-900 lg:flex"
        title="Fókuszkép megnyitása (Ctrl+Alt+Szóköz vagy Ctrl+Alt+8)"
      >
        <Monitor size={23} />
      </button>
    );
  }

  return (
    <div className={`fixed inset-0 z-[11000] overflow-hidden ${isDark ? "bg-[#031126]" : "bg-slate-50"}`}>
      <DimproMotionBackdrop mode="focus" dark={isDark} />

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="absolute right-8 top-8 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300/40 bg-white/20 text-slate-700 shadow-lg backdrop-blur hover:bg-white/40 dark:text-white"
        title="Fókuszkép bezárása"
      >
        <X size={20} />
      </button>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <DimproBrandMark size={86} className="mb-14 justify-center" textClassName="text-center" />

        <div className="tabular-nums text-[118px] font-light leading-none tracking-[-0.06em] text-slate-950 drop-shadow-sm dark:text-white">
          {clock.time}<span className="ml-3 text-4xl font-normal text-sky-500">:{clock.seconds}</span>
        </div>
        <div className="mt-8 text-2xl font-medium text-slate-700 dark:text-slate-200">{clock.date}</div>

        <div className="mt-12 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-300">
          <MousePointer2 size={18} />
          <span>A folytatáshoz mozgassa az egeret, nyomjon le egy billentyűt vagy kattintson.</span>
        </div>

        <div className="mt-16 grid w-full max-w-5xl grid-cols-4 divide-x divide-slate-300/70 rounded-3xl border border-slate-200/50 bg-white/18 px-6 py-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:divide-sky-500/25 dark:border-sky-400/20 dark:bg-slate-950/25">
          {quickStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="flex items-center justify-center gap-4 px-6">
                <Icon size={36} className={stat.color} />
                <div className="text-left">
                  <div className="text-sm text-slate-500 dark:text-slate-300">{stat.label}</div>
                  <div className={`text-4xl font-semibold tabular-nums ${stat.color}`}>{stat.value}<span className="ml-1 text-base font-normal text-slate-500">{stat.suffix}</span></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex items-center gap-4 rounded-2xl border border-slate-200/60 bg-white/28 px-8 py-4 text-xl text-slate-800 shadow-lg backdrop-blur dark:border-sky-400/20 dark:bg-slate-950/25 dark:text-white">
          <CloudSun size={32} className="text-amber-400" />
          <span className="font-semibold">18°C</span>
          <span className="text-slate-400">|</span>
          <span>Derült</span>
          <span className="text-slate-400">|</span>
          <span>Nyugat szél 12 km/h</span>
        </div>
      </div>
    </div>
  );
}
