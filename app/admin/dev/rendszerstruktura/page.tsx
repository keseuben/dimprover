"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Boxes,
  Building2,
  Code2,
  Columns2,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  FileStack,
  GitBranch,
  HardDrive,
  KeyRound,
  Laptop2,
  Mail,
  Menu,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import {
  developmentFlow,
  infrastructureRules,
  mailProfileKnowledge,
  structureComparisonGroups,
  productGroups,
  serverNodes,
  statusMeta,
  targetPlanStatusMeta,
  structureUpdatedAt,
  type ProductGroup,
  type StructureStatus,
} from "./data";

type AuthState = "checking" | "authorized" | "blocked";

type SafeMailProfile = {
  id: string;
  label: string;
  address: string;
  purpose: string;
  enabled: boolean;
  smtpConfigured: boolean;
  hasPassword: boolean;
};

type MailSettingsPayload = {
  ok?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  licenseReplyTo?: string;
  profiles?: SafeMailProfile[];
  error?: string;
};

const fallbackMailProfiles: SafeMailProfile[] = [
  { id: "system", label: "DIMPRO System", address: "system@dimpro.hu", purpose: "Szerverőr, rendszerhiba, technikai állapotriasztás és licencértesítések.", enabled: true, smtpConfigured: true, hasPassword: true },
  { id: "notifications", label: "DIMPRO Értesítések", address: "ertesites@dimpro.hu", purpose: "Általános alkalmazásértesítések, projektértesítések, határidők.", enabled: true, smtpConfigured: true, hasPassword: true },
  { id: "drive", label: "DIMPRO Drive Értesítések", address: "ertesites.drive@dimpro.hu", purpose: "Fájlfeltöltés, megosztás, Drive Desktop és Projektkapu események.", enabled: true, smtpConfigured: true, hasPassword: true },
  { id: "noreply", label: "DIMPRO No Reply", address: "noreply@dimpro.hu", purpose: "Nem válaszolható automatikus rendszerlevelek.", enabled: true, smtpConfigured: true, hasPassword: true },
  { id: "billing", label: "DIMPRO Számlázás", address: "szamlazas@dimpro.hu", purpose: "Előfizetés, számlázási és pénzügyi értesítések.", enabled: true, smtpConfigured: true, hasPassword: true },
  { id: "admin", label: "DIMPRO Admin", address: "admin@dimpro.hu", purpose: "Licencadmin, belső adminisztrációs üzenetek.", enabled: true, smtpConfigured: true, hasPassword: true },
  { id: "info", label: "DIMPRO Info", address: "info@dimpro.hu", purpose: "Általános kapcsolati cím, kézi ügyfélkommunikációhoz is használható.", enabled: false, smtpConfigured: false, hasPassword: true },
];

const productIcons: Record<string, typeof Boxes> = {
  "dimpro-core": Building2,
  drive: HardDrive,
  drop: Cloud,
  dimprover: Network,
  desktop: Laptop2,
  fajlmuhely: FileStack,
  license: KeyRound,
  "dev-center": Code2,
};

const structureNavigation = [
  { id: "mukodes", label: "Működési modell", shortLabel: "Áttekintés", icon: Workflow },
  { id: "atalakitasi-terv", label: "Jelenlegi → tervezett", shortLabel: "Átalakítás", icon: Columns2 },
  { id: "szerverek", label: "Szerverek", shortLabel: "Szerverek", icon: Server },
  { id: "termekcsalad", label: "Termékcsalád", shortLabel: "Termékek", icon: Boxes },
  { id: "emailek", label: "E-mail rendszer", shortLabel: "E-mail", icon: Mail },
  { id: "szabalyok", label: "Szabályok", shortLabel: "Szabályok", icon: ShieldCheck },
  { id: "folyamat", label: "Fejlesztési folyamat", shortLabel: "Folyamat", icon: GitBranch },
] as const;

type StructureSectionId = (typeof structureNavigation)[number]["id"];

export default function DimproSystemStructurePage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [mailProfiles, setMailProfiles] = useState<SafeMailProfile[]>(fallbackMailProfiles);
  const [mailMeta, setMailMeta] = useState({
    smtpHost: "vuhzuqtm.loginssl.com",
    smtpPort: 465,
    smtpSecure: true,
    licenseReplyTo: "info@dimpro.hu",
  });
  const [mailStatus, setMailStatus] = useState("A szerveren rögzített e-mail profilok betöltése…");
  const [activeSection, setActiveSection] = useState<StructureSectionId>("mukodes");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    async function verifyAdmin() {
      const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
      if (!key) {
        setAuthState("blocked");
        return;
      }
      try {
        const response = await fetch("/api/license/admin", {
          headers: { "x-dimpro-license-admin-key": key },
          cache: "no-store",
        });
        setAuthState(response.ok ? "authorized" : "blocked");
      } catch {
        setAuthState("blocked");
      }
    }
    void verifyAdmin();
  }, []);

  useEffect(() => {
    if (authState !== "authorized") return;
    void loadMailProfiles();
  }, [authState]);

  useEffect(() => {
    if (authState !== "authorized") return;
    const sections = structureNavigation
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));

    const initialHash = window.location.hash.replace("#", "") as StructureSectionId;
    if (structureNavigation.some((item) => item.id === initialHash)) setActiveSection(initialHash);

    let frameId = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const activationLine = window.innerWidth <= 760 ? 100 : 154;
        const lastReachedSection = sections
          .filter((section) => section.getBoundingClientRect().top <= activationLine)
          .at(-1);
        const nextSection = (lastReachedSection?.id || sections[0]?.id || "mukodes") as StructureSectionId;
        setActiveSection((current) => current === nextSection ? current : nextSection);
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    window.addEventListener("hashchange", updateActiveSection);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
      window.removeEventListener("hashchange", updateActiveSection);
    };
  }, [authState]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen]);

  function jumpToSection(sectionId: StructureSectionId) {
    setMobileNavOpen(false);
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${sectionId}`);
    });
  }

  async function loadMailProfiles() {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) return;
    setMailStatus("A szerveren rögzített e-mail profilok frissítése…");
    try {
      const response = await fetch("/api/license/mail-settings", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as MailSettingsPayload | null;
      if (!response.ok || !payload?.ok || !payload.profiles) {
        throw new Error(payload?.error || "Az e-mail profilok nem tölthetők be.");
      }
      setMailProfiles(payload.profiles);
      setMailMeta({
        smtpHost: payload.smtpHost || "nincs beállítva",
        smtpPort: payload.smtpPort || 0,
        smtpSecure: Boolean(payload.smtpSecure),
        licenseReplyTo: payload.licenseReplyTo || "info@dimpro.hu",
      });
      setMailStatus("Élő szerveradatok betöltve.");
    } catch (error) {
      setMailStatus(`${error instanceof Error ? error.message : "Betöltési hiba"} A dokumentált tartaléklista látható.`);
    }
  }

  const moduleCount = useMemo(
    () => productGroups.reduce((total, group) => total + group.sections.reduce((sum, section) => sum + section.items.length, 0), 0),
    [],
  );

  const activeMailCount = mailProfiles.filter((profile) => profile.enabled && profile.smtpConfigured).length;

  if (authState !== "authorized") {
    return (
      <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-950">
        <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <ShieldCheck className="text-cyan-700" size={36} aria-hidden="true" />
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Védett fejlesztői dokumentáció</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">DIMPRO rendszerstruktúra</h1>
          <p className="mt-4 leading-7 text-slate-600">A működési térkép csak licencadmin-belépés után érhető el.</p>
          {authState === "checking" ? (
            <span className="mt-6 inline-flex rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-500">Jogosultság ellenőrzése…</span>
          ) : (
            <Link href="/admin" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-sm font-black text-white hover:bg-cyan-800">
              Licencadmin megnyitása <ChevronRight size={17} />
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="dimpro-structure-page min-h-screen bg-[#eef3f7] text-slate-950">
      <div className="mx-auto max-w-[1500px] px-4 py-5 pb-28 sm:px-6 md:pb-8 lg:px-8">
        <header className="structure-hero overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-[0_26px_90px_rgba(15,23,42,0.18)]">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.3fr_0.7fr] lg:px-10 lg:py-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                  <Network size={15} /> Élő működési térkép
                </span>
                <span className="text-xs font-bold text-slate-400">Frissítve: {structureUpdatedAt}</span>
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-[-0.05em] sm:text-5xl lg:text-6xl">DIMPRO rendszerstruktúra</h1>
              <p className="mt-5 max-w-4xl text-base leading-8 text-slate-300 sm:text-lg">
                A szerverek, domainek, központi mag, termékcsalád, modulok, asztali programok és e-mail címek közös, folyamatosan karbantartott működési leírása.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/admin/dev" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black hover:bg-white/15">
                  <ArrowLeft size={17} /> Fejlesztési Központ
                </Link>
                <Link href="/admin/fejlesztesi-naplo" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-400">
                  <GitBranch size={17} /> Fejlesztési napló
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 self-end">
              <HeroMetric label="Infrastruktúra-elemek" value={String(serverNodes.length)} note="PROD, DEV, DB, storage, átmenet" />
              <HeroMetric label="Termékcsoportok" value={String(productGroups.length)} note="közös DIMPRO család" />
              <HeroMetric label="Rögzített modulok" value={String(moduleCount)} note="aktív, fejlesztett és tervezett" />
              <HeroMetric label="Működő e-mail profil" value={String(activeMailCount)} note={`${mailProfiles.length} nyilvántartott cím`} />
            </div>
          </div>
        </header>

        <nav className="structure-desktop-nav" aria-label="Rendszerstruktúra szakaszai">
          <div className="structure-desktop-nav__track">
            {structureNavigation.map((item) => (
              <AnchorLink
                key={item.id}
                href={`#${item.id}`}
                label={item.label}
                icon={item.icon}
                active={activeSection === item.id}
                onClick={(event) => {
                  event.preventDefault();
                  jumpToSection(item.id);
                }}
              />
            ))}
          </div>
        </nav>

        <section id="mukodes" className="structure-section-anchor mt-6 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <SectionHeading icon={Workflow} eyebrow="Gyors áttekintés" title="Hogyan kapcsolódik össze a rendszer?" />
          <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
            <FlowCard title="DIMPRO központi mag" note="Fiók · előfizetés · licenc · projektmag · értesítés · e-mail" href="#dimpro-core" />
            <FlowArrow />
            <FlowCard title="Termékek és munkafelületek" note="DIMPRO appok · DIMPROVER · Drive · Drop · Desktop · Fájlműhely" href="#termekcsalad" />
            <FlowArrow />
            <FlowCard title="Közös infrastruktúra" note="PROD · DEV · PostgreSQL · Object Storage · backup · audit" href="#szerverek" />
          </div>
          <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
            <strong className="text-sm font-black text-cyan-950">Alapelv</strong>
            <p className="mt-2 text-sm leading-7 text-cyan-900">
              A DIMPRO a központi keret és előfizetési mag. A DIMPROVER a teljes építőipari enterprise platform. A Drive a tartós projektfájltár, a Drop az ideiglenes fájlátadás, a Desktop a helyi kliensréteg, a Fájlműhely pedig a helyi mérnöki munkaállomás.
            </p>
          </div>
        </section>

        <section id="atalakitasi-terv" className="structure-section-anchor mt-6 scroll-mt-24">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <SectionHeading icon={Columns2} eyebrow="Mai döntések és folyamatos átrendezési terv" title="Jelenlegi állapot → tervezett célállapot" />
              <div className="flex flex-wrap gap-2 text-xs font-black">
                <span className="structure-legend-chip structure-legend-chip--current">Bal oldal: jelenlegi</span>
                <span className="structure-legend-chip structure-legend-chip--planned">Sötétszürke: tervezett</span>
                <span className="structure-legend-chip structure-legend-chip--progress">Türkiz: folyamatban</span>
                <span className="structure-legend-chip structure-legend-chip--waiting">Borostyán: külső lépésre vár</span>
                <span className="structure-legend-chip structure-legend-chip--completed">Zöld: teljesítve</span>
              </div>
            </div>
            <p className="mt-4 max-w-5xl leading-7 text-slate-600">
              Az azonos témájú kártyák párban mutatják, hogyan működik a rendszer most, és milyen célállapotot építünk ki. A jobb oldali feladatok státusza menet közben módosítható; a teljesített elemek automatikusan zöldre válthatók.
            </p>
          </div>
          <div className="mt-5 space-y-5">
            {structureComparisonGroups.map((group, index) => (
              <StructureComparisonCard key={group.id} group={group} defaultOpen={index === 0} />
            ))}
          </div>
        </section>

        <section id="szerverek" className="structure-section-anchor mt-6 scroll-mt-24">
          <SectionHeading icon={Server} eyebrow="PROD · DEV · DATABASE · STORAGE" title="Szerver- és tárhelyarchitektúra" />
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {serverNodes.map((node) => (
              <article key={node.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-slate-950 p-3 text-cyan-300">
                      {node.id === "database" ? <Database size={23} /> : node.id === "storage" ? <Cloud size={23} /> : <Server size={23} />}
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">{node.environment}</p>
                      <h3 className="mt-1 text-xl font-black">{node.title}</h3>
                    </div>
                  </div>
                  <StatusBadge status={node.status} />
                </div>
                <p className="mt-5 leading-7 text-slate-600">{node.purpose}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <InfoBox label="Cím / hostname" value={node.hostname} />
                  <InfoBox label="Operációs rendszer" value={node.operatingSystem} />
                  <InfoBox label="Méret" value={node.size} />
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <CompactList title="Feladatai" items={node.responsibilities} tone="normal" />
                  <CompactList title="Korlátok és védelem" items={node.restrictions} tone="warning" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="termekcsalad" className="structure-section-anchor mt-8 scroll-mt-24">
          <SectionHeading icon={Boxes} eyebrow="Hierarchikus moduljegyzék" title="DIMPRO termékcsalád és modulok" />
          <p className="mt-3 max-w-5xl leading-7 text-slate-600">
            Minden csoport alatt a hozzá tartozó modulok és közös szolgáltatások szerepelnek. Az állapotok menet közben frissíthetők; ez az oldal a rendszer mindenkori működési térképe.
          </p>
          <div className="mt-5 space-y-5">
            {productGroups.map((group) => <ProductGroupCard key={group.id} group={group} />)}
          </div>
        </section>

        <section id="emailek" className="structure-section-anchor mt-8 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionHeading icon={Mail} eyebrow="Központi levelezési profilok" title="DIMPRO e-mail rendszer" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadMailProfiles()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
                <RefreshCw size={16} /> Élő állapot frissítése
              </button>
              <Link href="/admin/email" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800">
                E-mail beállítások <ChevronRight size={16} />
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <InfoBox label="SMTP host" value={mailMeta.smtpHost} />
            <InfoBox label="SMTP port" value={String(mailMeta.smtpPort || "—")} />
            <InfoBox label="Kapcsolat" value={mailMeta.smtpSecure ? "SSL/TLS" : "Titkosítás ellenőrzendő"} />
            <InfoBox label="Alap Reply-To" value={mailMeta.licenseReplyTo} />
          </div>
          <p className="mt-3 text-xs font-bold text-slate-500">{mailStatus}</p>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {mailProfiles.map((profile) => {
              const knowledge = mailProfileKnowledge[profile.id];
              return (
                <article key={profile.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700">{profile.label}</p>
                      <h3 className="mt-1 break-all text-lg font-black text-slate-950">{profile.address}</h3>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${profile.enabled && profile.smtpConfigured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : profile.enabled ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-500"}`}>
                      {profile.enabled && profile.smtpConfigured ? "Működő SMTP profil" : profile.enabled ? "Engedélyezett, de hiányos" : "Kikapcsolt profil"}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-600">{profile.purpose}</p>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <MailFact label="Jelleg" value={knowledge?.kind || "DIMPRO levelezési profil"} />
                    <MailFact label="Használja" value={knowledge?.users || "Központi DIMPRO szolgáltatások"} />
                    <div className="sm:col-span-2"><MailFact label="Válaszkezelés" value={knowledge?.reply || "Az adott munkafolyamat szabályai szerint."} /></div>
                  </dl>
                </article>
              );
            })}
          </div>
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-950">
            <strong>Fontos:</strong> az `info@dimpro.hu` az emberi kapcsolati és alapértelmezett válaszcím. A `noreply@dimpro.hu` címről küldött levélben mindig külön kapcsolati címet kell megadni. Az e-mail jelszavak és SMTP-titkok ezen az oldalon nem jelennek meg.
          </div>
        </section>

        <section id="szabalyok" className="structure-section-anchor mt-8 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <SectionHeading icon={ShieldCheck} eyebrow="Rögzített döntések" title="Kötelező infrastruktúra- és adatkezelési szabályok" />
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {infrastructureRules.map((rule, index) => (
              <div key={rule} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-cyan-300">{index + 1}</span>
                <p className="text-sm font-semibold leading-6 text-slate-700">{rule}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="folyamat" className="structure-section-anchor mt-8 scroll-mt-24 rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-7">
          <SectionHeading icon={Workflow} eyebrow="DEV → TEST → PROD" title="Egységes fejlesztési és élesítési folyamat" inverse />
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {developmentFlow.map((step, index) => (
              <article key={step} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <span className="text-xs font-black tracking-[0.18em] text-cyan-300">LÉPÉS {String(index + 1).padStart(2, "0")}</span>
                <p className="mt-3 text-sm font-bold leading-6 text-slate-200">{step}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 text-sm text-slate-400">
            <span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-cyan-300" /> Ezt az oldalt minden jelentős szerver-, termék- vagy modulváltozásnál frissíteni kell.</span>
            <Link href="/admin/dev" className="font-black text-cyan-300 hover:text-cyan-200">Vissza a Fejlesztési Központba</Link>
          </div>
        </section>
      </div>

      <nav className="structure-mobile-dock" aria-label="Mobil rendszerstruktúra menü">
        {structureNavigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={activeSection === item.id ? "is-active" : ""}
              onClick={() => jumpToSection(item.id)}
              aria-current={activeSection === item.id ? "location" : undefined}
            >
              <Icon size={19} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
        <button type="button" className={mobileNavOpen || structureNavigation.slice(4).some((item) => item.id === activeSection) ? "is-active" : ""} onClick={() => setMobileNavOpen(true)} aria-expanded={mobileNavOpen}>
          <Menu size={20} />
          <span>További</span>
        </button>
      </nav>

      {mobileNavOpen ? (
        <div className="structure-mobile-sheet-backdrop" role="presentation" onClick={() => setMobileNavOpen(false)}>
          <aside className="structure-mobile-sheet" role="dialog" aria-modal="true" aria-label="Rendszerstruktúra navigáció" onClick={(event) => event.stopPropagation()}>
            <div className="structure-mobile-sheet__header">
              <div>
                <p>Gyors navigáció</p>
                <strong>Ugrás a kívánt szakaszhoz</strong>
              </div>
              <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Menü bezárása"><X size={21} /></button>
            </div>
            <div className="structure-mobile-sheet__grid">
              {structureNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} type="button" className={activeSection === item.id ? "is-active" : ""} onClick={() => jumpToSection(item.id)}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                    <ChevronRight size={17} />
                  </button>
                );
              })}
            </div>
            <button type="button" className="structure-mobile-sheet__top" onClick={() => { setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <ArrowUp size={18} /> Vissza az oldal tetejére
            </button>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function ProductGroupCard({ group }: { group: ProductGroup }) {
  const Icon = productIcons[group.id] || Boxes;
  return (
    <article id={group.id} className="structure-section-anchor scroll-mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="structure-product-header grid gap-5 border-b border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 sm:p-7 lg:grid-cols-[1fr_auto]">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-slate-950 p-3 text-cyan-300"><Icon size={25} /></div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">{group.shortName}</p>
              <StatusBadge status={group.status} />
            </div>
            <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{group.title}</h3>
            <p className="mt-1 text-sm font-black text-slate-700">{group.role}</p>
            <p className="mt-4 max-w-5xl leading-7 text-slate-600">{group.description}</p>
          </div>
        </div>
        <div className="structure-domain-panel min-w-64 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Kapcsolódó címek</span>
          <div className="mt-3 space-y-2">
            {group.domains.map((domain) => <div key={domain} className="break-all rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{domain}</div>)}
          </div>
        </div>
      </div>
      <div className="grid gap-5 p-5 sm:p-7 xl:grid-cols-2">
        {group.sections.map((section) => (
          <details key={section.title} className="structure-product-section group rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-black">{section.title}</h4>
                  {section.note ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{section.note}</p> : null}
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 shadow-sm">{section.items.length} elem <ChevronRight className="structure-details-chevron" size={15} /></span>
              </div>
            </summary>
            <div className="mt-4 space-y-3">
              {section.items.map((item) => (
                <div key={item.name} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <strong className="text-sm font-black text-slate-950">{item.name}</strong>
                    <StatusBadge status={item.status} compact />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </article>
  );
}

function SectionHeading({ icon: Icon, eyebrow, title, inverse = false }: { icon: typeof Server; eyebrow: string; title: string; inverse?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`rounded-xl p-2.5 ${inverse ? "bg-cyan-400/10 text-cyan-300" : "bg-slate-950 text-cyan-300"}`}><Icon size={20} /></div>
      <div>
        <p className={`text-xs font-black uppercase tracking-[0.16em] ${inverse ? "text-cyan-300" : "text-cyan-700"}`}>{eyebrow}</p>
        <h2 className={`mt-1 text-2xl font-black tracking-tight sm:text-3xl ${inverse ? "text-white" : "text-slate-950"}`}>{title}</h2>
      </div>
    </div>
  );
}

function HeroMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="structure-hero-metric rounded-2xl border border-white/10 bg-white/5 p-4">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      <strong className="mt-2 block text-3xl font-black text-white">{value}</strong>
      <small className="mt-1 block text-xs leading-5 text-slate-400">{note}</small>
    </div>
  );
}

function AnchorLink({ href, label, icon: Icon, active, onClick }: { href: string; label: string; icon: typeof Workflow; active: boolean; onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <a href={href} onClick={onClick} aria-current={active ? "location" : undefined} className={`structure-anchor-link ${active ? "is-active" : ""}`}>
      <Icon size={16} />
      <span>{label}</span>
    </a>
  );
}

function FlowCard({ title, note, href }: { title: string; note: string; href: string }) {
  return (
    <a href={href} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50">
      <strong className="text-base font-black">{title}</strong>
      <p className="mt-2 text-sm leading-6 text-slate-600">{note}</p>
    </a>
  );
}

function FlowArrow() {
  return <div className="hidden items-center justify-center text-cyan-600 lg:flex"><ChevronRight size={25} /></div>;
}

function StatusBadge({ status, compact = false }: { status: StructureStatus; compact?: boolean }) {
  const meta = statusMeta[status];
  return <span className={`inline-flex rounded-full border font-black ${compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs"} ${meta.className}`}>{meta.label}</span>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <strong className="mt-1 block break-words text-sm leading-6 text-slate-800">{value}</strong>
    </div>
  );
}

function CompactList({ title, items, tone }: { title: string; items: string[]; tone: "normal" | "warning" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <strong className={`text-sm font-black ${tone === "warning" ? "text-amber-950" : "text-slate-900"}`}>{title}</strong>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className={`flex gap-2 text-sm leading-6 ${tone === "warning" ? "text-amber-900" : "text-slate-600"}`}>
            <CheckCircle2 className="mt-1 shrink-0" size={15} /> <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold leading-6 text-slate-700">{value}</dd>
    </div>
  );
}

function StructureComparisonCard({ group, defaultOpen = false }: { group: (typeof structureComparisonGroups)[number]; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <details open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)} className="structure-comparison-card group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none border-b border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-5xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">{group.category}</p>
            <h3 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">{group.title}</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{group.summary}</p>
          </div>
          <span className="structure-comparison-count rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 group-open:bg-cyan-50 group-open:text-cyan-800">
            {group.currentItems.length} jelenlegi · {group.targetItems.length} célpont <ChevronRight className="structure-details-chevron" size={15} />
          </span>
        </div>
      </summary>
      <div className="grid lg:grid-cols-2">
        <section className="border-b border-slate-200 bg-slate-50 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">A</span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Jelenlegi állapot</p>
              <h4 className="font-black text-slate-900">Ahogyan most működik</h4>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {group.currentItems.map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
                <p className="text-sm font-semibold leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="structure-target-panel bg-slate-950 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-cyan-300">B</span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Tervezett célállapot</p>
              <h4 className="font-black text-white">Amit átalakítunk vagy létrehozunk</h4>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {group.targetItems.map((item) => {
              const meta = targetPlanStatusMeta[item.status];
              return (
                <article key={`${group.id}-${item.title}`} className={`structure-plan-card rounded-2xl border p-4 ${meta.cardClassName}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <strong className="structure-plan-card__title text-sm font-black">{item.title}</strong>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.className}`}>{meta.label}</span>
                  </div>
                  <p className="structure-plan-card__detail mt-2 text-sm leading-6">{item.detail}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </details>
  );
}
