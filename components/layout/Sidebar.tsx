"use client";

import React, { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import SessionCountdown from "@/components/auth/SessionCountdown";
import LogoutButton from "@/components/auth/LogoutButton";
import DimproBrandMark from "@/components/layout/DimproBrandMark";
import {
  Archive,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  HardHat,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { getDimproverModuleByPathname, type DimproverModuleTone } from "./dimproverModuleRegistry";

type SidebarProps = {
  collapsed?: boolean;
  onOpen?: () => void;
};

type SubmenuItem = {
  label: string;
  href: string;
};

type MenuItem = {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
  modules: string[];
  children?: SubmenuItem[];
};

const menuItems: MenuItem[] = [
  {
    Icon: BarChart3,
    label: "Vezérlőpult",
    href: "/dashboard",
    modules: ["workspace"],
    children: [
      { label: "Vezérlőpult áttekintés", href: "/dashboard" },
      { label: "Heti szervező", href: "/naptar" },
      { label: "Mai teendők", href: "/dashboard/mai-teendok" },
      { label: "Határidős figyelmeztetések", href: "/dashboard/hataridos-figyelmeztetesek" },
      { label: "Friss események", href: "/dashboard/friss-esemenyek" },
    ],
  },
  {
    Icon: FileText,
    label: "Munkatér dokumentumok",
    href: "/dokumentumok",
    modules: ["workspace"],
    children: [
      { label: "Projekt dokumentumok", href: "/dokumentumok/projekt" },
      { label: "Gyorsjegyzetek", href: "/dokumentumok/gyorsjegyzetek" },
      { label: "Mini táblázatok", href: "/dokumentumok/mini-tablazatok" },
      { label: "Exportált PDF-ek", href: "/dokumentumok/pdf-ek" },
      { label: "Feltöltött fájlok", href: "/dokumentumok/feltoltesek" },
    ],
  },
  {
    Icon: Building2,
    label: "DIMPRO Projektkapu",
    href: "/projektkapu",
    modules: ["projektkapu"],
    children: [
      { label: "Projektkörnyezetek", href: "/projektkapu/projects" },
      { label: "DOCK – ProjektTér", href: "/projektkapu/project/d6-irodaepulet/dock" },
      { label: "DRIVE – Dokumentumtár", href: "/projektkapu/project/d6-irodaepulet/drive" },
      { label: "DROP – Fájlkapu", href: "/projektkapu/project/d6-irodaepulet/drop" },
      { label: "DIALOG – Egyeztetések", href: "/projektkapu/project/d6-irodaepulet/dialog" },
      { label: "DECIDE – Jóváhagyások", href: "/projektkapu/project/d6-irodaepulet/decide" },
      { label: "DIARY – Projektnapló", href: "/projektkapu/project/d6-irodaepulet/diary" },
    ],
  },
  {
    Icon: Building2,
    label: "Projektek",
    href: "/projektek",
    modules: ["projektkapu"],
    children: [
      { label: "Projektlista", href: "/projektek" },
      { label: "Saját / cégen belüli projektek", href: "/projektek/sajat" },
      { label: "Külsős / meghívásos projektek", href: "/projektek/kulsos" },
      { label: "Projekt adatlap", href: "/projektek/adatlap" },
      { label: "Projekt jogosultságok", href: "/projektek/jogosultsagok" },
    ],
  },
  {
    Icon: CalendarDays,
    label: "Ütemterv",
    href: "/utemezes",
    modules: ["projektkapu", "epiteshely"],
    children: [
      { label: "Projekt ütemterv", href: "/utemezes" },
      { label: "Próba V2 ideiglenes nézet", href: "/utemezes/proba-v2" },
      { label: "Pénzügyi ütemterv", href: "/utemezes/penzugyi" },
      { label: "Mérföldkövek", href: "/utemezes/merfoldkovek" },
      { label: "Határidők", href: "/utemezes/hataridok" },
    ],
  },
  {
    Icon: Archive,
    label: "Projektiktató",
    href: "/projektiktato",
    modules: ["projektkapu"],
    children: [
      { label: "Bejövő projektiratok", href: "/projektiktato/bejovo" },
      { label: "Kimenő projektiratok", href: "/projektiktato/kimeno" },
      { label: "Szerződések", href: "/projektiktato/szerzodesek" },
      { label: "Teljesítésigazolások", href: "/projektiktato/teljesitesigazolasok" },
      { label: "Határozatok / engedélyek", href: "/projektiktato/engedelyek" },
    ],
  },
  {
    Icon: ReceiptText,
    label: "Pénzügyi iktató",
    href: "/penzugyi-iktato",
    modules: ["projektkapu", "vallalkozoi-muhely"],
    children: [
      { label: "Bejövő számlák", href: "/penzugyi-iktato/bejovo-szamlak" },
      { label: "Kimenő számlák", href: "/penzugyi-iktato/kimeno-szamlak" },
      { label: "Díjbekérők", href: "/penzugyi-iktato/dijbekerok" },
      { label: "Kifizetések", href: "/penzugyi-iktato/kifizetesek" },
      { label: "Pénzügyi státuszok", href: "/penzugyi-iktato/statuszok" },
    ],
  },
  {
    Icon: FileSignature,
    label: "Ajánlatkészítés",
    href: "/ajanlatkeszites",
    modules: ["projektkapu", "vallalkozoi-muhely"],
    children: [
      { label: "Új ajánlat készítése", href: "/ajanlatkeszites/uj" },
      { label: "Ajánlat sablonok", href: "/ajanlatkeszites/sablonok" },
      { label: "Költségvetési tételek", href: "/ajanlatkeszites/koltsegvetesi-tetelek" },
      { label: "Anyag / díj bontás", href: "/ajanlatkeszites/anyag-dij-bontas" },
      { label: "Ajánlat verziók", href: "/ajanlatkeszites/verziok" },
      { label: "Ajánlat export PDF-be", href: "/ajanlatkeszites/pdf-export" },
    ],
  },
  {
    Icon: HardHat,
    label: "Építéshely",
    href: "/epiteshely",
    modules: ["epiteshely"],
    children: [
      { label: "Építéshely áttekintés", href: "/epiteshely" },
      { label: "Terepi hibafelvétel", href: "/jegyzokonyvek/uj/terepi-hibafelvetel" },
      { label: "Terepi állapotrögzítés", href: "/jegyzokonyvek/uj/terepi-allapotrogzites" },
      { label: "Hibajegyzék", href: "/jegyzokonyvek/hibajegyzek" },
      { label: "Fotódokumentáció", href: "/dokumentumok/feltoltesek" },
    ],
  },
  {
    Icon: ClipboardList,
    label: "Jegyzőkönyvek",
    href: "/jegyzokonyvek",
    modules: ["epiteshely", "projektkapu"],
    children: [
      { label: "Áttekintés", href: "/jegyzokonyvek" },
      { label: "Új jegyzőkönyv", href: "/jegyzokonyvek/uj" },
      { label: "Kooperációk", href: "/jegyzokonyvek/kooperaciok" },
      { label: "Terepi rögzítések", href: "/jegyzokonyvek/terepi-rogzitesek" },
      { label: "Hibajegyzék", href: "/jegyzokonyvek/hibajegyzek" },
      { label: "Archívum", href: "/jegyzokonyvek/archivum" },
    ],
  },
  {
    Icon: HardHat,
    label: "E-napló rögzítő",
    href: "/enaplo",
    modules: ["epiteshely", "vallalkozoi-muhely"],
    children: [
      { label: "E-napló áttekintés", href: "/enaplo" },
      { label: "Napi jelentés", href: "/enaplo/napi-jelentes" },
      { label: "Munkaerő", href: "/enaplo/munkaero" },
      { label: "Gépek", href: "/enaplo/gepek" },
      { label: "Anyagok", href: "/enaplo/anyagok" },
      { label: "Fotódokumentáció", href: "/enaplo/fotok" },
    ],
  },
  {
    Icon: Wrench,
    label: "Vállalkozói Műhely",
    href: "/vallalkozoi-muhely",
    modules: ["vallalkozoi-muhely"],
    children: [
      { label: "Műhely áttekintés", href: "/vallalkozoi-muhely" },
      { label: "Brigádok és munkacsapatok", href: "/vallalkozoi-muhely/brigadok" },
      { label: "Munkalapok", href: "/vallalkozoi-muhely/munkalapok" },
      { label: "Anyagigények", href: "/vallalkozoi-muhely/anyagigenyek" },
      { label: "Eszközök és járművek", href: "/vallalkozoi-muhely/eszkozok" },
      { label: "Teljesítés és elszámolás", href: "/vallalkozoi-muhely/teljesites" },
    ],
  },
  {
    Icon: Users,
    label: "Munkaerő",
    href: "/munkaero",
    modules: ["vallalkozoi-muhely"],
    children: [
      { label: "Dolgozók", href: "/munkaero/dolgozok" },
      { label: "Munkaszerződések", href: "/munkaero/munkaszerzodesek" },
      { label: "Jelenléti ív", href: "/munkaero/jelenleti-iv" },
      { label: "Munkaidő nyilvántartás", href: "/munkaero/munkaido-nyilvantartas" },
      { label: "Szabadságok", href: "/munkaero/szabadsagok" },
      { label: "Munkabér adatok", href: "/munkaero/munkaber-adatok" },
    ],
  },
  {
    Icon: ShieldCheck,
    label: "Üzemeltetés",
    href: "/uzemeltetes",
    modules: ["uzemeltetes"],
    children: [
      { label: "Üzemeltetés áttekintés", href: "/uzemeltetes" },
      { label: "Létesítmények", href: "/uzemeltetes/letesitmenyek" },
      { label: "Garanciális hibák", href: "/uzemeltetes/garancialis-hibak" },
      { label: "Karbantartási feladatok", href: "/uzemeltetes/karbantartas" },
      { label: "Üzemeltetési dokumentumok", href: "/uzemeltetes/dokumentumok" },
      { label: "Időszakos felülvizsgálatok", href: "/uzemeltetes/felulvizsgalatok" },
    ],
  },
  {
    Icon: Users,
    label: "Partnerek",
    href: "/partnerek",
    modules: ["projektkapu", "uzemeltetes"],
    children: [
      { label: "Megrendelők", href: "/partnerek/megrendelok" },
      { label: "Vállalkozók", href: "/partnerek/vallalkozok" },
      { label: "Tervezők", href: "/partnerek/tervezok" },
      { label: "Műszaki ellenőrök", href: "/partnerek/muszaki-ellenorok" },
      { label: "Kapcsolattartók", href: "/partnerek/kapcsolattartok" },
    ],
  },
  {
    Icon: Settings,
    label: "Admin központ",
    href: "/admin",
    modules: ["admin"],
    children: [
      { label: "Admin áttekintés", href: "/admin" },
      { label: "Belépések", href: "/admin/belepesek" },
      { label: "Drive admin", href: "/admin/drive" },
      { label: "Szerver", href: "/admin/szerver" },
      { label: "Release-ek", href: "/admin/releases" },
      { label: "Admin napló", href: "/adminlog" },
    ],
  },
  {
    Icon: Settings,
    label: "Beállítások",
    href: "/beallitasok",
    modules: ["admin"],
    children: [
      { label: "Cégadatok", href: "/beallitasok/cegadatok" },
      { label: "Felhasználók", href: "/beallitasok/felhasznalok" },
      { label: "Jogosultságok", href: "/beallitasok/jogosultsagok" },
      { label: "Sablonok", href: "/beallitasok/sablonok" },
      { label: "Modulbeállítások", href: "/beallitasok/modulok" },
      { label: "Csomagok", href: "/account/modules" },
    ],
  },
];

const moduleToneMap: Record<DimproverModuleTone, { chip: string; panel: string; header: string; itemActive: string; itemHover: string; active: string; hover: string; badge: string }> = {
  green: { chip: "bg-emerald-400", panel: "border-emerald-200 bg-emerald-50 ring-emerald-100", header: "text-emerald-900", itemActive: "bg-white text-emerald-950", itemHover: "hover:bg-white", active: "bg-emerald-300 text-emerald-950 shadow-[0_12px_28px_rgba(16,185,129,0.22)]", hover: "hover:bg-emerald-300/12 hover:text-white", badge: "border-emerald-300/40 bg-emerald-300/12 text-emerald-100" },
  blue: { chip: "bg-sky-400", panel: "border-sky-200 bg-sky-50 ring-sky-100", header: "text-sky-900", itemActive: "bg-white text-sky-950", itemHover: "hover:bg-white", active: "bg-sky-300 text-sky-950 shadow-[0_12px_28px_rgba(14,165,233,0.22)]", hover: "hover:bg-sky-300/12 hover:text-white", badge: "border-sky-300/40 bg-sky-300/12 text-sky-100" },
  orange: { chip: "bg-orange-400", panel: "border-orange-200 bg-orange-50 ring-orange-100", header: "text-orange-900", itemActive: "bg-white text-orange-950", itemHover: "hover:bg-white", active: "bg-orange-300 text-orange-950 shadow-[0_12px_28px_rgba(251,146,60,0.24)]", hover: "hover:bg-orange-300/12 hover:text-white", badge: "border-orange-300/40 bg-orange-300/12 text-orange-100" },
  teal: { chip: "bg-cyan-400", panel: "border-cyan-200 bg-cyan-50 ring-cyan-100", header: "text-cyan-900", itemActive: "bg-white text-cyan-950", itemHover: "hover:bg-white", active: "bg-cyan-300 text-cyan-950 shadow-[0_12px_28px_rgba(34,211,238,0.20)]", hover: "hover:bg-cyan-300/12 hover:text-white", badge: "border-cyan-300/40 bg-cyan-300/12 text-cyan-100" },
  violet: { chip: "bg-violet-400", panel: "border-violet-200 bg-violet-50 ring-violet-100", header: "text-violet-900", itemActive: "bg-white text-violet-950", itemHover: "hover:bg-white", active: "bg-violet-300 text-violet-950 shadow-[0_12px_28px_rgba(167,139,250,0.22)]", hover: "hover:bg-violet-300/12 hover:text-white", badge: "border-violet-300/40 bg-violet-300/12 text-violet-100" },
  slate: { chip: "bg-slate-300", panel: "border-slate-200 bg-slate-50 ring-slate-100", header: "text-slate-900", itemActive: "bg-white text-slate-950", itemHover: "hover:bg-white", active: "bg-slate-300 text-slate-950 shadow-[0_12px_28px_rgba(148,163,184,0.20)]", hover: "hover:bg-slate-300/12 hover:text-white", badge: "border-slate-300/40 bg-slate-300/12 text-slate-100" },
};

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/" || pathname.startsWith("/dashboard");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ collapsed = false, onOpen }: SidebarProps) {
  const pathname = usePathname();
  const activeModule = getDimproverModuleByPathname(pathname);
  const tone = moduleToneMap[activeModule.tone];
  const visibleMenuItems = useMemo(() => menuItems.filter((item) => item.modules.includes(activeModule.id)), [activeModule.id]);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const [floatingTop, setFloatingTop] = useState(112);
  const activeFloatingMenu = visibleMenuItems.find((item) => item.label === hoveredMenu && item.children?.length);

  function openFloatingMenu(event: React.MouseEvent<HTMLAnchorElement> | React.FocusEvent<HTMLAnchorElement>, item: MenuItem) {
    if (!item.children?.length) {
      setHoveredMenu(null);
      return;
    }

    const anchorRect = event.currentTarget.getBoundingClientRect();
    const sidebarRect = event.currentTarget.closest("aside")?.getBoundingClientRect();
    const rawTop = sidebarRect ? anchorRect.top - sidebarRect.top - 10 : 112;
    const panelHeightEstimate = 330;
    const maxTop = Math.max(84, window.innerHeight - panelHeightEstimate - 24);

    setFloatingTop(Math.max(84, Math.min(rawTop, maxTop)));
    setHoveredMenu(item.label);
  }

  return (
    <aside
      onMouseLeave={() => setHoveredMenu(null)}
      className={`relative flex h-full flex-col overflow-visible dimpro-sidebar-shell py-7 text-white transition-all duration-300 ${collapsed ? "w-[72px] px-3" : "w-[260px] px-6"}`}
    >
      <div className={`mb-6 flex ${collapsed ? "justify-center" : "justify-center"}`}>
        <DimproBrandMark
          size={collapsed ? 38 : 224}
          withText={false}
          className="text-[#008CFF] [&_img]:drop-shadow-[0_0_34px_rgba(0,140,255,0.72)]"
        />
      </div>

      <div className={`mb-4 border px-3 py-2 ${tone.badge} ${collapsed ? "flex justify-center" : ""}`}>
        {collapsed ? (
          <span className={`h-2.5 w-2.5 ${tone.chip}`} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 ${tone.chip}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] opacity-75">Aktív főmodul</span>
            </div>
            <div className="mt-1 truncate text-sm font-black text-white">{activeModule.title}</div>
            <div className="mt-1 truncate text-[11px] font-semibold text-slate-300">{activeModule.label}</div>
          </>
        )}
      </div>

      <nav className="relative min-h-0 flex-1 space-y-1.5 overflow-visible pr-1">
        {visibleMenuItems.map((item) => {
          const Icon = item.Icon;
          const active = isActivePath(pathname, item.href);
          const hasChildren = Boolean(item.children?.length);
          return (
            <a
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onMouseEnter={(event) => openFloatingMenu(event, item)}
              onFocus={(event) => openFloatingMenu(event, item)}
              onClick={() => {
                if (collapsed) onOpen?.();
              }}
              className={`group relative flex items-center rounded-xl text-sm transition-all duration-200 ${collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-2.5"} ${active ? tone.active : `text-slate-300 ${tone.hover}`}`}
            >
              <Icon size={18} className="shrink-0 transition-transform duration-200 group-hover:scale-105" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {hasChildren && !collapsed && <span className={`ml-auto h-1.5 w-1.5 rounded-full ${tone.chip}`} />}
            </a>
          );
        })}

        <div className="mt-6 space-y-3 border-t border-sky-300/10 pt-5">
          <LogoutButton collapsed={collapsed} />
          {!collapsed && <SessionCountdown />}
        </div>
      </nav>

      {activeFloatingMenu?.children && (() => {
        return (
          <div
            onMouseEnter={() => setHoveredMenu(activeFloatingMenu.label)}
            style={{ top: floatingTop }}
            className={`absolute z-[10020] w-[315px] rounded-r-lg border p-3 text-slate-950 shadow-[10px_12px_24px_rgba(15,23,42,0.18)] ring-1 ${tone.panel} ${collapsed ? "left-[72px]" : "left-[260px]"}`}
          >
            <div className="mb-3 border-b border-slate-950/15 px-2 pb-3">
              <div className={`text-[11px] font-bold uppercase tracking-[0.22em] ${tone.header}`}>Főmodul könyvjelzők</div>
              <div className="mt-1 text-base font-extrabold text-slate-950">{activeFloatingMenu.label}</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{activeModule.title}</div>
            </div>

            <div className="space-y-1">
              {activeFloatingMenu.children.map((child) => {
                const childActive = isActivePath(pathname, child.href);
                return (
                  <a
                    key={child.label}
                    href={child.href}
                    className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${childActive ? `${tone.itemActive} shadow-none` : `text-slate-950 ${tone.itemHover}`}`}
                  >
                    <span className={`h-6 w-1 rounded-sm transition ${childActive ? "bg-slate-950/50" : "bg-slate-950/25 group-hover:bg-slate-950/50"}`} />
                    <span className="min-w-0 flex-1 truncate">{child.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })()}
    </aside>
  );
}
