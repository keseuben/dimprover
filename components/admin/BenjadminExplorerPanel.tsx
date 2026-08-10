"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Boxes,
  Code2,
  FileCode2,
  Files,
  Folder,
  FolderTree,
  GitBranch,
  History,
  KeyRound,
  LayoutDashboard,
  ListTree,
  Network,
  Pin,
  PinOff,
  ServerCog,
  X,
} from "lucide-react";

type ExplorerView = "tree" | "modules" | "files";

type Props = {
  pinned: boolean;
  onPinnedChange: (value: boolean) => void;
  onClose: () => void;
  onNavigate: () => void;
};

const VIEW_STORAGE_KEY = "dimpro-benjadmin-explorer-view";

const modules = [
  { label: "Áttekintés", href: "/admin", icon: LayoutDashboard, group: "Vezérlés" },
  { label: "Fejlesztés", href: "/admin/dev", icon: Code2, group: "Vezérlés" },
  { label: "Környezetek", href: "/admin/release-kozpont", icon: GitBranch, group: "Kiadás" },
  { label: "Infrastruktúra", href: "/admin/szerver", icon: ServerCog, group: "Rendszer" },
  { label: "Licencek", href: "/admin/licenckozpont", icon: KeyRound, group: "Rendszer" },
  { label: "Audit", href: "/admin/dimpro-belepesek", icon: History, group: "Rendszer" },
] as const;

const fileGroups = [
  {
    label: "DEV munkatér",
    items: [
      { label: "Fejlesztési Központ", href: "/admin/dev", kind: "workspace" },
      { label: "Rendszerstruktúra", href: "/admin/dev/rendszerstruktura", kind: "tree" },
      { label: "Szerverállapot", href: "/admin/szerver", kind: "infra" },
    ],
  },
  {
    label: "Release / csomagok",
    items: [
      { label: "Release Központ", href: "/admin/release-kozpont", kind: "release" },
      { label: "Release feltöltő", href: "/admin/releases", kind: "package" },
      { label: "Fájlműhely verziók", href: "/admin/fajlmuhely-verziok", kind: "package" },
      { label: "HAGE verziók", href: "/admin/hage-verziok", kind: "package" },
    ],
  },
  {
    label: "Rendszer",
    items: [
      { label: "Licencközpont", href: "/admin/licenckozpont", kind: "admin" },
      { label: "Rendszerstruktúra", href: "/admin/dev/rendszerstruktura", kind: "structure" },
      { label: "Belépési audit", href: "/admin/dimpro-belepesek", kind: "audit" },
    ],
  },
] as const;

function matchesPath(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BenjadminExplorerPanel({ pinned, onPinnedChange, onClose, onNavigate }: Props) {
  const pathname = usePathname();
  const [view, setView] = useState<ExplorerView>("tree");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "tree" || stored === "modules" || stored === "files") setView(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  return (
    <div className="benjadmin-explorer-panel">
      <div className="benjadmin-floating-board__header benjadmin-explorer-header">
        <div>
          <p>DIMPRO</p>
          <h2>Explorer</h2>
          <span>Fa- és fájlkezelő nézet</span>
        </div>
        <div className="benjadmin-board-header-actions">
          <button
            type="button"
            className={`benjadmin-board-pin ${pinned ? "is-active" : ""}`}
            onClick={() => onPinnedChange(!pinned)}
            aria-pressed={pinned}
            title={pinned ? "Rögzítés feloldása" : "Explorer rögzítése"}
          >
            {pinned ? <PinOff size={17} /> : <Pin size={17} />}
          </button>
          <button type="button" className="benjadmin-board-close" onClick={onClose} aria-label="Explorer elrejtése" title="Explorer elrejtése">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="benjadmin-explorer-switcher" role="tablist" aria-label="Explorer nézet">
        <button type="button" className={view === "tree" ? "is-active" : ""} onClick={() => setView("tree")}><FolderTree size={15} /> Fa</button>
        <button type="button" className={view === "modules" ? "is-active" : ""} onClick={() => setView("modules")}><ListTree size={15} /> Modulok</button>
        <button type="button" className={view === "files" ? "is-active" : ""} onClick={() => setView("files")}><Files size={15} /> Fájlok</button>
      </div>

      <div className="benjadmin-explorer-content">
        {view === "tree" ? (
          <div className="benjadmin-tree-view">
            <div className="benjadmin-tree-root"><span>⌄</span><FolderTree size={16} /><strong>BENJADMIN</strong></div>
            {["Vezérlés", "Kiadás", "Rendszer"].map((group) => (
              <div key={group} className="benjadmin-tree-group">
                <div className="benjadmin-tree-folder"><span>⌄</span><Folder size={15} /><strong>{group}</strong></div>
                <div className="benjadmin-tree-subchildren">
                  {modules.filter((item) => item.group === group).map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href} className={`benjadmin-tree-row ${matchesPath(pathname, item.href) ? "is-active" : ""}`} onClick={onNavigate}>
                        <Icon size={14} /><span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            <Link href="/admin/dev/rendszerstruktura" className="benjadmin-tree-row benjadmin-tree-structure-link" onClick={onNavigate}><Network size={14} /><span>Teljes rendszerstruktúra</span></Link>
          </div>
        ) : null}

        {view === "modules" ? (
          <div className="benjadmin-explorer-module-list">
            {modules.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={`benjadmin-explorer-module-row ${matchesPath(pathname, item.href) ? "is-active" : ""}`} onClick={onNavigate}>
                  <span className="benjadmin-explorer-module-icon"><Icon size={17} /></span>
                  <span><strong>{item.label}</strong><small>{item.group}</small></span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {view === "files" ? (
          <div className="benjadmin-file-view">
            <div className="benjadmin-file-breadcrumb"><FileCode2 size={14} /><span>DEV / DIMPROVER</span></div>
            {fileGroups.map((group) => (
              <section key={group.label} className="benjadmin-file-group">
                <h3><Folder size={14} /> {group.label}</h3>
                {group.items.map((item) => (
                  <Link key={`${group.label}-${item.href}`} href={item.href} className={`benjadmin-file-row ${matchesPath(pathname, item.href) ? "is-active" : ""}`} onClick={onNavigate}>
                    {item.kind === "package" ? <Boxes size={14} /> : <FileCode2 size={14} />}
                    <span><strong>{item.label}</strong><small>{item.kind}</small></span>
                  </Link>
                ))}
              </section>
            ))}
          </div>
        ) : null}
      </div>

      <div className="benjadmin-explorer-footer">
        <span className="benjadmin-explorer-live-dot" />
        <span>DEV · CANONICAL</span>
      </div>
    </div>
  );
}
