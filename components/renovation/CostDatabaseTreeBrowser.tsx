"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Database, Eye, EyeOff, FileText, Folder, Layers3, Search, WalletCards } from "lucide-react";
import { costMajorItems, disciplineLabels } from "@/app/lib/renovation/costDatabase";
import { calculateLaborUnitPriceFromHourlyRate, hourlyRateProfiles } from "@/app/lib/renovation/laborRates";
import { buildCostDatabaseTree, findCostTreeNode, flattenCostTree, getFirstMajorItemNode, type CostTreeNode } from "@/app/lib/renovation/costDatabaseTree";

const nf = new Intl.NumberFormat("hu-HU");

function ft(value: number) {
  return `${nf.format(Math.round(value))} Ft`;
}

export function CostDatabaseTreeBrowser() {
  const tree = useMemo(() => buildCostDatabaseTree(), []);
  const flatTree = useMemo(() => flattenCostTree(tree), [tree]);
  const firstNode = useMemo(() => getFirstMajorItemNode(tree), [tree]);
  const [selectedNodeId, setSelectedNodeId] = useState(firstNode?.id ?? tree[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.flatMap((moduleNode) => [moduleNode.id, ...moduleNode.children.slice(0, 2).map((child) => child.id)])));

  const selectedNode = findCostTreeNode(tree, selectedNodeId) ?? firstNode ?? tree[0];
  const selectedMajorItem = selectedNode?.majorItemId ? costMajorItems.find((item) => item.id === selectedNode.majorItemId) : undefined;
  const detailItem = selectedMajorItem && selectedNode?.detailLineId ? selectedMajorItem.detailLines.find((line) => line.id === selectedNode.detailLineId) : undefined;
  const filteredTree = useMemo(() => filterTree(tree, query), [tree, query]);
  const stats = {
    nodes: flatTree.length,
    majorItems: flatTree.filter((node) => node.type === "majorItem").length,
    detailItems: flatTree.filter((node) => node.type === "detailItem").length,
    disciplines: Object.keys(disciplineLabels).length,
  };

  function toggle(nodeId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function selectNode(node: CostTreeNode) {
    setSelectedNodeId(node.id);
    if (node.children.length > 0 && !expanded.has(node.id)) toggle(node.id);
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur md:px-7">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-lime-100 text-lime-700"><Database size={26} /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-600">DIMPRO ár- és tételrendszer</p>
              <h1 className="text-2xl font-black tracking-[-0.04em] md:text-3xl">Költségadatbázis modul</h1>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Fa elem" value={stats.nodes} />
              <Metric label="Főtétel" value={stats.majorItems} />
              <Metric label="Altétel" value={stats.detailItems} />
              <Metric label="Szakág" value={stats.disciplines} />
            </div>
            <a href="/koltsegadatbazis/import" className="inline-flex items-center justify-center rounded-xl bg-lime-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-lime-700">TERC .xls import</a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1800px] gap-5 p-4 md:p-7 xl:grid-cols-[420px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-[108px] xl:h-[calc(100vh-136px)] xl:overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés munkanemre, tételre, altételre..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm font-bold outline-none focus:border-lime-500" />
            </div>
            <div className="mt-3 rounded-xl bg-lime-50 p-3 text-xs font-semibold leading-5 text-lime-900 ring-1 ring-lime-100">
              TERC-szerű fa: munka jellege → szakág → főcsoport → főtétel → részletező tétel.
            </div>
          </div>
          <div className="h-[calc(100%-130px)] overflow-auto p-3">
            {filteredTree.map((node) => <TreeNode key={node.id} node={node} level={0} selectedNodeId={selectedNodeId} expanded={expanded} toggle={toggle} selectNode={selectNode} />)}
          </div>
        </aside>

        <section className="space-y-5">
          <IntroCards />
          {selectedNode ? <DetailPanel node={selectedNode} majorItem={selectedMajorItem} detailItem={detailItem} /> : null}
          <AllDisciplinesOverview />
        </section>
      </div>
    </main>
  );
}

function TreeNode({ node, level, selectedNodeId, expanded, toggle, selectNode }: { node: CostTreeNode; level: number; selectedNodeId: string; expanded: Set<string>; toggle: (id: string) => void; selectNode: (node: CostTreeNode) => void }) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const Icon = node.type === "module" ? Database : node.type === "discipline" || node.type === "group" ? Folder : node.type === "majorItem" ? WalletCards : FileText;

  return (
    <div>
      <div className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold ${isSelected ? "bg-lime-100 text-lime-800" : "text-slate-700 hover:bg-slate-50"}`} style={{ paddingLeft: `${8 + level * 18}px` }} onClick={() => selectNode(node)}>
        <button type="button" onClick={(event) => { event.stopPropagation(); if (hasChildren) toggle(node.id); }} className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-white">
          {hasChildren ? isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
        </button>
        <Icon size={15} className={isSelected ? "text-lime-700" : "text-slate-400"} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.unit ? <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-400 ring-1 ring-slate-100">{node.unit}</span> : null}
      </div>
      {hasChildren && isExpanded ? <div>{node.children.map((child) => <TreeNode key={child.id} node={child} level={level + 1} selectedNodeId={selectedNodeId} expanded={expanded} toggle={toggle} selectNode={selectNode} />)}</div> : null}
    </div>
  );
}

function DetailPanel({ node, majorItem, detailItem }: { node: CostTreeNode; majorItem?: (typeof costMajorItems)[number]; detailItem?: NonNullable<(typeof costMajorItems)[number]["detailLines"]>[number] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-600">{node.type}</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">{node.name}</h2>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-500">{node.description ?? majorItem?.description ?? "Fa-struktúra elem a DIMPRO költségadatbázisban."}</p>
        </div>
        <span className="w-fit rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">{node.type}</span>
      </div>

      {majorItem ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <PriceCard label="Anyag demo ár" value={majorItem.materialUnitPrice} unit={majorItem.unit} />
            <PriceCard label="Munkadíj demo ár" value={majorItem.laborUnitPrice} unit={majorItem.unit} />
            <PriceCard label="Munkadíj norma alapján" value={calculateLaborUnitPriceFromHourlyRate({ itemId: majorItem.id, discipline: majorItem.discipline, fallbackLaborUnitPrice: majorItem.laborUnitPrice }).calculatedLaborUnitPrice} unit={majorItem.unit} />
            <PriceCard label="Egyéb demo költség" value={majorItem.otherCost} unit="csomag" />
          </div>
          <HourlyRateBox itemId={majorItem.id} discipline={majorItem.discipline} fallbackLaborUnitPrice={majorItem.laborUnitPrice} />

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.1em] text-slate-500">Kapcsolódó munkák, amelyek alapból csak tájékoztatók</h3>
              <div className="mt-3 flex flex-wrap gap-2">{majorItem.relatedWorks.map((work) => <span key={work} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-100">{work}</span>)}</div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.1em] text-slate-500">Mennyiségképzés</h3>
              <div className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
                <div>Alap: <span className="font-black text-slate-950">{majorItem.quantityBase}</span></div>
                <div>Szorzó: <span className="font-black text-slate-950">{majorItem.quantityMultiplier}</span></div>
                <div>Minimum: <span className="font-black text-slate-950">{majorItem.minQuantity} {majorItem.unit}</span></div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-slate-500">Részletező tételek</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {majorItem.detailLines.map((detail) => (
                <div key={detail.id} className={`rounded-xl border p-3 text-sm font-bold ${detailItem?.id === detail.id ? "border-lime-300 bg-lime-50 text-lime-800" : "border-slate-100 bg-slate-50 text-slate-700"}`}>
                  <div className="flex items-center justify-between gap-2"><span>{detail.name}</span><span className="rounded bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-400 ring-1 ring-slate-100">{detail.unit}</span></div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{detail.defaultEnabled ? "alapból bekapcsolva" : "opcionális"} · {detail.adminDetailedOnly ? "admin részletező" : "felhasználói részletező"}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}

function IntroCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <InfoCard icon={<Eye size={22} />} title="Gyorskalkulátor nézet" text="A felhasználó főtételeket lát, a kapcsolódó munkák csak tájékoztató szövegként jelennek meg." />
      <InfoCard icon={<Layers3 size={22} />} title="Részletező nézet" text="A főtételből altételek nyithatók, amelyek később mennyiséggel és árral ajánlatkészítő sorokká válhatnak." />
      <InfoCard icon={<EyeOff size={22} />} title="Admin árnézet" text="Később itt kezelhető a rejtett BENKES ár, régiós szorzó, ÉNGY referencia és fedezet." />
    </div>
  );
}

function AllDisciplinesOverview() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black tracking-[-0.03em]">Szakág áttekintő</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(disciplineLabels).map(([id, label]) => {
          const count = costMajorItems.filter((item) => item.discipline === id).length;
          return <div key={id} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="font-black text-slate-900">{label}</div><div className="mt-1 text-sm font-bold text-slate-500">{count} főtétel</div></div>;
        })}
      </div>
    </section>
  );
}

function filterTree(nodes: CostTreeNode[], query: string): CostTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return nodes;
  return nodes
    .map((node) => {
      const children = filterTree(node.children, query);
      const matches = node.name.toLowerCase().includes(normalizedQuery) || node.code?.toLowerCase().includes(normalizedQuery) || node.description?.toLowerCase().includes(normalizedQuery);
      if (matches || children.length > 0) return { ...node, children };
      return null;
    })
    .filter((node): node is CostTreeNode => Boolean(node));
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center"><div className="text-2xl font-black text-lime-700">{value}</div><div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div></div>;
}

function HourlyRateBox({ itemId, discipline, fallbackLaborUnitPrice }: { itemId: string; discipline: (typeof costMajorItems)[number]["discipline"]; fallbackLaborUnitPrice: number }) {
  const dimpro = calculateLaborUnitPriceFromHourlyRate({ itemId, discipline, fallbackLaborUnitPrice, mode: "dimpro" });
  const official = calculateLaborUnitPriceFromHourlyRate({ itemId, discipline, fallbackLaborUnitPrice, mode: "official" });
  const internal = calculateLaborUnitPriceFromHourlyRate({ itemId, discipline, fallbackLaborUnitPrice, mode: "internal" });
  return (
    <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.1em] text-blue-800">Óradíj / normaóra alapú munkadíj</div>
          <p className="mt-1 text-xs font-semibold text-blue-900">ÉVOSZ ajánlott minimális építőipari rezsióradíj 2026: 7 830 Ft/óra. Forrás: ÉVOSZ rezsióradíj-javaslat 2026. Rendeleti megjelenést külön ellenőrizni kell.</p>
        </div>
        <div className="text-xs font-black text-blue-900">{hourlyRateProfiles.length} óradíj profil</div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SmallRate label="ÉVOSZ minimum 2026" value={official.calculatedLaborUnitPrice} sub={official.baseHourlyRate > 0 ? `${official.baseHourlyRate} Ft/óra` : "7 830 Ft/óra"} />
        <SmallRate label="DIMPRO becslési" value={dimpro.calculatedLaborUnitPrice} sub={`${dimpro.laborHoursPerUnit} óra/egység`} />
        <SmallRate label="Belső saját" value={internal.calculatedLaborUnitPrice} sub={`${internal.baseHourlyRate} Ft/óra`} />
      </div>
    </div>
  );
}

function SmallRate({ label, value, sub }: { label: string; value: number; sub: string }) {
  return <div className="rounded-xl bg-white p-3 ring-1 ring-blue-100"><div className="text-[10px] font-black uppercase tracking-[0.08em] text-blue-500">{label}</div><div className="mt-1 text-sm font-black text-slate-900">{ft(value)}</div><div className="text-[10px] font-bold text-slate-400">{sub}</div></div>;
}

function PriceCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">{label}</div><div className="mt-2 text-lg font-black text-slate-900">{ft(value)}</div><div className="text-xs font-bold text-slate-400">/{unit}</div></div>;
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 inline-grid h-11 w-11 place-items-center rounded-xl bg-lime-100 text-lime-700">{icon}</div><h3 className="font-black text-slate-950">{title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{text}</p></div>;
}
