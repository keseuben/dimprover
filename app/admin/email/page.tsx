"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, RefreshCw, Search, Send, ShieldCheck, X } from "lucide-react";
import {
  BenjadminDataWorkspace,
  BenjadminMetric,
  BenjadminPagination,
  BenjadminStatusPill,
} from "@/components/admin/BenjadminDataWorkspace";

type MailProfileId = "system" | "notifications" | "drive" | "drop" | "noreply" | "billing" | "admin" | "info";

type SafeMailProfile = {
  id: MailProfileId;
  label: string;
  address: string;
  displayName?: string;
  purpose: string;
  enabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  hasPassword: boolean;
  smtpConfigured: boolean;
};

type MailProfileTestResult = {
  id: string;
  profileId: MailProfileId;
  profileAddress: string | null;
  createdAt: string;
  attempted: boolean;
  sent: boolean;
  reason: string;
  to: string[];
  smtpConfigured: boolean;
  error?: string;
  friendlyError?: string;
};

type MailSettingsResponse = {
  ok: boolean;
  error?: string;
  configFile?: string;
  testLogFile?: string;
  storageExists?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  testRecipients?: string[];
  licenseActivationRecipients?: string[];
  licenseReplyTo?: string;
  profileCount?: number;
  enabledProfileCount?: number;
  profiles?: SafeMailProfile[];
  tests?: MailProfileTestResult[];
  testResult?: MailProfileTestResult;
  testResults?: MailProfileTestResult[];
  saved?: boolean;
};

type ProfileDraft = {
  id: MailProfileId;
  label: string;
  address: string;
  displayName: string;
  purpose: string;
  enabled: boolean;
};

type SettingsDraft = {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  sharedPassword: string;
  testRecipients: string;
  licenseActivationRecipients: string;
  licenseReplyTo: string;
  profiles: ProfileDraft[];
};

type WorkspaceView = "profiles" | "tests";
type ProfileFilter = "all" | "enabled" | "disabled" | "ready" | "incomplete";
type TestFilter = "all" | "sent" | "failed";

const profileOrder: MailProfileId[] = ["system", "notifications", "drive", "drop", "noreply", "billing", "admin", "info"];

const profileShortLabels: Record<MailProfileId, string> = {
  system: "Rendszer",
  notifications: "Értesítések",
  drive: "Drive",
  drop: "Drop",
  noreply: "No-reply",
  billing: "Számlázás",
  admin: "Admin",
  info: "Info",
};

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function toDraft(data: MailSettingsResponse | null): SettingsDraft {
  const profiles = [...(data?.profiles ?? [])]
    .sort((left, right) => profileOrder.indexOf(left.id) - profileOrder.indexOf(right.id))
    .map((profile) => ({
      id: profile.id,
      label: profile.label,
      address: profile.address,
      displayName: profile.displayName ?? "",
      purpose: profile.purpose,
      enabled: profile.enabled,
    }));

  return {
    smtpHost: data?.smtpHost ?? "vuhzuqtm.loginssl.com",
    smtpPort: String(data?.smtpPort ?? 465),
    smtpSecure: data?.smtpSecure ?? true,
    sharedPassword: "",
    testRecipients: (data?.testRecipients ?? ["keseruben90@gmail.com"]).join(", "),
    licenseActivationRecipients: (data?.licenseActivationRecipients ?? ["admin@dimpro.hu", "info@dimpro.hu"]).join(", "),
    licenseReplyTo: data?.licenseReplyTo ?? "info@dimpro.hu",
    profiles,
  };
}

function InfoGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return <div className="benjadmin-infra-detail-grid">{items.map((item) => <span key={item.label}>{item.label}<b>{item.value || "—"}</b></span>)}</div>;
}

export default function MailSettingsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [data, setData] = useState<MailSettingsResponse | null>(null);
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(null));
  const [message, setMessage] = useState("E-mail beállítások ellenőrzése…");
  const [loading, setLoading] = useState(false);
  const [testingProfileId, setTestingProfileId] = useState<MailProfileId | "all" | null>(null);
  const [view, setView] = useState<WorkspaceView>("profiles");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
  const [testFilter, setTestFilter] = useState<TestFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<MailProfileId | null>(null);

  const latestTestsByProfile = useMemo(() => {
    const map = new Map<MailProfileId, MailProfileTestResult>();
    for (const test of data?.tests ?? []) {
      if (!map.has(test.profileId)) map.set(test.profileId, test);
    }
    return map;
  }, [data?.tests]);

  const loadSettings = useCallback(async (key = adminKey) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setMessage("Licencadmin belépés szükséges.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/mail-settings", {
        headers: { "x-dimpro-license-admin-key": trimmedKey, accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json() as MailSettingsResponse;
      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "Nem sikerült betölteni az e-mail beállításokat.");
        return;
      }
      setData(payload);
      setDraft(toDraft(payload));
      localStorage.setItem("dimproLicenseAdminKey", trimmedKey);
      setMessage("E-mail profilok és tesztnapló betöltve.");
      setPage(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen e-mail beállítás lekérési hiba.");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
    if (storedAdminKey) {
      setAdminKey(storedAdminKey);
      void loadSettings(storedAdminKey);
    } else {
      setMessage("Licencadmin belépés szükséges.");
    }
  }, [loadSettings]);

  async function saveSettings() {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setMessage("Licencadmin belépés szükséges.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/mail-settings", {
        method: "POST",
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": trimmedKey, accept: "application/json" },
        body: JSON.stringify({
          action: "saveSettings",
          settings: {
            smtpHost: draft.smtpHost,
            smtpPort: Number(draft.smtpPort),
            smtpSecure: draft.smtpSecure,
            sharedPassword: draft.sharedPassword,
            testRecipients: draft.testRecipients,
            licenseActivationRecipients: draft.licenseActivationRecipients,
            licenseReplyTo: draft.licenseReplyTo,
            profiles: draft.profiles,
          },
        }),
        cache: "no-store",
      });
      const payload = await response.json() as MailSettingsResponse;
      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "Nem sikerült menteni az e-mail beállításokat.");
        return;
      }
      setData(payload);
      setDraft(toDraft(payload));
      localStorage.setItem("dimproLicenseAdminKey", trimmedKey);
      setMessage("E-mail beállítások mentve. A jelszó nem jelenik meg a felületen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen e-mail beállítás mentési hiba.");
    } finally {
      setLoading(false);
    }
  }

  async function testProfile(profileId: MailProfileId | "all") {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setMessage("Licencadmin belépés szükséges.");
      return;
    }
    setTestingProfileId(profileId);
    setMessage("");
    try {
      const response = await fetch("/api/license/mail-settings", {
        method: "POST",
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": trimmedKey, accept: "application/json" },
        body: JSON.stringify(profileId === "all" ? { action: "testAll" } : { action: "testProfile", profileId }),
        cache: "no-store",
      });
      const payload = await response.json() as MailSettingsResponse;
      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? "Nem sikerült elküldeni a teszt e-mailt.");
        return;
      }
      setData(payload);
      setDraft((current) => ({ ...toDraft(payload), sharedPassword: current.sharedPassword }));
      if (profileId === "all") {
        const sentCount = payload.testResults?.filter((item) => item.sent).length ?? 0;
        setMessage(`Összes profil teszt lefutott. Sikeres: ${sentCount}/${payload.testResults?.length ?? 0}.`);
      } else {
        setMessage(payload.testResult?.sent ? "Teszt e-mail elküldve." : payload.testResult?.friendlyError ?? payload.testResult?.reason ?? "Teszt lefutott.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen e-mail teszt hiba.");
    } finally {
      setTestingProfileId(null);
    }
  }

  function updateProfile(profileId: MailProfileId, patch: Partial<ProfileDraft>) {
    setDraft((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => profile.id === profileId ? { ...profile, ...patch } : profile),
    }));
  }

  const visibleProfiles = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return draft.profiles.filter((profile) => {
      const saved = data?.profiles?.find((item) => item.id === profile.id);
      if (profileFilter === "enabled" && !profile.enabled) return false;
      if (profileFilter === "disabled" && profile.enabled) return false;
      if (profileFilter === "ready" && !saved?.smtpConfigured) return false;
      if (profileFilter === "incomplete" && saved?.smtpConfigured) return false;
      if (!clean) return true;
      return [profileShortLabels[profile.id], profile.label, profile.address, profile.displayName, profile.purpose]
        .some((value) => String(value || "").toLowerCase().includes(clean));
    });
  }, [data?.profiles, draft.profiles, profileFilter, query]);

  const visibleTests = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return (data?.tests ?? []).filter((test) => {
      if (testFilter === "sent" && !test.sent) return false;
      if (testFilter === "failed" && test.sent) return false;
      if (!clean) return true;
      return [profileShortLabels[test.profileId], test.profileAddress, test.reason, test.friendlyError, test.error, ...test.to]
        .some((value) => String(value || "").toLowerCase().includes(clean));
    });
  }, [data?.tests, query, testFilter]);

  const activeRows = view === "profiles" ? visibleProfiles : visibleTests;
  const pageCount = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedProfiles = visibleProfiles.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedTests = visibleTests.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedProfile = selectedProfileId ? draft.profiles.find((profile) => profile.id === selectedProfileId) || null : null;
  const selectedSavedProfile = selectedProfileId ? data?.profiles?.find((profile) => profile.id === selectedProfileId) || null : null;
  const selectedLatestTest = selectedProfileId ? latestTestsByProfile.get(selectedProfileId) || null : null;
  const smtpReadyCount = data?.profiles?.filter((profile) => profile.smtpConfigured).length ?? 0;
  const sentTestCount = data?.tests?.filter((test) => test.sent).length ?? 0;
  const failedTestCount = data?.tests?.filter((test) => !test.sent).length ?? 0;
  const canTestAny = Boolean(data?.profiles?.some((profile) => profile.enabled && profile.smtpConfigured));

  if (!adminKey && !loading) {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>Licencadmin belépés szükséges</h1>
          <p>Az e-mail konfiguráció és tesztnapló csak aktív BENJADMIN admin munkamenettel érhető el.</p>
          <a href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása</a>
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · E-MAIL KÖZPONT"
        title="E-mail profilok és tesztnapló"
        description="Központi SMTP, automatikus DIMPRO feladóprofilok és tesztküldések egy hibrid, táblázat-első admin munkatérben."
        actions={(
          <>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => setSettingsOpen(true)}><Mail size={16} /> SMTP beállítások</button>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => void testProfile("all")} disabled={testingProfileId !== null || !canTestAny}>{testingProfileId === "all" ? <Loader2 className="is-spinning" size={16} /> : <Send size={16} />} Összes profil tesztelése</button>
            <button type="button" className="benjadmin-data-primary-action" onClick={() => void loadSettings()} disabled={loading}>{loading ? <Loader2 className="is-spinning" size={16} /> : <RefreshCw size={16} />} Frissítés</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Feladóprofil" value={data?.profileCount ?? draft.profiles.length} />
            <BenjadminMetric label="Engedélyezett" value={data?.enabledProfileCount ?? draft.profiles.filter((profile) => profile.enabled).length} tone="ok" />
            <BenjadminMetric label="SMTP kész" value={smtpReadyCount} tone={smtpReadyCount ? "ok" : "warning"} />
            <BenjadminMetric label="Sikeres teszt" value={sentTestCount} tone="ok" />
            <BenjadminMetric label="Sikertelen teszt" value={failedTestCount} tone={failedTestCount ? "danger" : "default"} />
          </>
        )}
        toolbar={(
          <>
            <div className="benjadmin-data-filter-group" aria-label="E-mail munkatér nézet">
              <button type="button" className={view === "profiles" ? "is-active" : ""} onClick={() => { setView("profiles"); setPage(1); }}>Feladóprofilok</button>
              <button type="button" className={view === "tests" ? "is-active" : ""} onClick={() => { setView("tests"); setPage(1); }}>Teszt napló</button>
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={view === "profiles" ? "Keresés profil, e-mail cím vagy cél alapján" : "Keresés profil, feladó, címzett vagy hiba alapján"} /></label>
            {view === "profiles" ? <div className="benjadmin-data-filter-group" aria-label="E-mail profil státusz szűrő">{(["all", "enabled", "disabled", "ready", "incomplete"] as ProfileFilter[]).map((value) => <button key={value} type="button" className={profileFilter === value ? "is-active" : ""} onClick={() => { setProfileFilter(value); setPage(1); }}>{value === "all" ? "Mind" : value === "enabled" ? "Aktív" : value === "disabled" ? "Kikapcsolt" : value === "ready" ? "SMTP kész" : "Hiányos"}</button>)}</div> : <div className="benjadmin-data-filter-group" aria-label="Teszt eredmény szűrő">{(["all", "sent", "failed"] as TestFilter[]).map((value) => <button key={value} type="button" className={testFilter === value ? "is-active" : ""} onClick={() => { setTestFilter(value); setPage(1); }}>{value === "all" ? "Mind" : value === "sent" ? "Sikeres" : "Sikertelen"}</button>)}</div>}
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message}</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={activeRows.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          {view === "profiles" ? (
            <table className="benjadmin-data-table benjadmin-email-profile-table" data-testid="benjadmin-email-profile-table">
              <thead><tr><th>Profil</th><th>E-mail cím</th><th>Feladat / cél</th><th>Engedélyezve</th><th>SMTP</th><th>Jelszó</th><th>Utolsó teszt</th><th>Teszt eredmény</th><th>Művelet</th></tr></thead>
              <tbody>
                {pagedProfiles.length ? pagedProfiles.map((profile) => {
                  const saved = data?.profiles?.find((item) => item.id === profile.id);
                  const latestTest = latestTestsByProfile.get(profile.id);
                  return <tr key={profile.id}><td><strong>{profileShortLabels[profile.id]}</strong><br /><small>{profile.label}</small></td><td className="is-mono">{profile.address}</td><td className="is-wide">{profile.purpose}</td><td><BenjadminStatusPill tone={profile.enabled ? "ok" : "default"}>{profile.enabled ? "Aktív" : "Kikapcsolva"}</BenjadminStatusPill></td><td><BenjadminStatusPill tone={saved?.smtpConfigured ? "ok" : "warning"}>{saved?.smtpConfigured ? "SMTP kész" : "Hiányos"}</BenjadminStatusPill></td><td><BenjadminStatusPill tone={saved?.hasPassword ? "ok" : "warning"}>{saved?.hasPassword ? "Mentve" : "Nincs"}</BenjadminStatusPill></td><td className="is-nowrap">{formatDateTime(latestTest?.createdAt)}</td><td>{latestTest ? <BenjadminStatusPill tone={latestTest.sent ? "ok" : "danger"}>{latestTest.sent ? "Sikeres" : "Sikertelen"}</BenjadminStatusPill> : "—"}</td><td><button type="button" className="benjadmin-data-row-action" onClick={() => setSelectedProfileId(profile.id)}>Részletek</button></td></tr>;
                }) : <tr><td colSpan={9} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő e-mail profil.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="benjadmin-data-table benjadmin-email-test-table" data-testid="benjadmin-email-test-table">
              <thead><tr><th>Időpont</th><th>Profil</th><th>Feladó</th><th>Eredmény</th><th>Címzett</th><th>SMTP</th><th>Kísérlet</th><th>Részlet</th></tr></thead>
              <tbody>
                {pagedTests.length ? pagedTests.map((test) => <tr key={test.id}><td className="is-nowrap">{formatDateTime(test.createdAt)}</td><td><strong>{profileShortLabels[test.profileId]}</strong></td><td className="is-mono">{test.profileAddress ?? "—"}</td><td><BenjadminStatusPill tone={test.sent ? "ok" : "danger"}>{test.sent ? "Sikeres" : "Sikertelen"}</BenjadminStatusPill></td><td className="is-wide">{test.to.join(", ") || "—"}</td><td><BenjadminStatusPill tone={test.smtpConfigured ? "ok" : "warning"}>{test.smtpConfigured ? "Kész" : "Hiányos"}</BenjadminStatusPill></td><td>{test.attempted ? "Igen" : "Nem"}</td><td className="is-wide">{test.friendlyError || test.error || test.reason || "—"}</td></tr>) : <tr><td colSpan={8} className="benjadmin-data-empty">Még nincs a szűrésnek megfelelő e-mail tesztnapló.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </BenjadminDataWorkspace>

      {settingsOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="SMTP beállítások bezárása" onClick={() => setSettingsOpen(false)} /> : null}
      {settingsOpen ? (
        <aside className="benjadmin-data-drawer benjadmin-email-settings-drawer" data-testid="benjadmin-email-settings-drawer">
          <header><div><span>KÖZÖS SMTP BEÁLLÍTÁSOK</span><strong>DIMPRO e-mail infrastruktúra</strong></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-email-settings-form">
            <div className="benjadmin-data-security-note"><ShieldCheck size={17} /><div><strong>Jelszóvédelem</strong><span>A mentett SMTP jelszó nem jelenik meg újra a felületen. Üres mezővel a meglévő jelszó marad érvényben.</span></div></div>
            <div className="benjadmin-data-form-grid">
              <label className="benjadmin-data-field"><span>SMTP host</span><input value={draft.smtpHost} onChange={(event) => setDraft((current) => ({ ...current, smtpHost: event.target.value }))} /></label>
              <label className="benjadmin-data-field"><span>SMTP port</span><input value={draft.smtpPort} onChange={(event) => setDraft((current) => ({ ...current, smtpPort: event.target.value.replace(/\D/g, "") }))} /></label>
              <label className="benjadmin-data-field"><span>Közös SMTP jelszó</span><input type="password" value={draft.sharedPassword} onChange={(event) => setDraft((current) => ({ ...current, sharedPassword: event.target.value }))} placeholder={data?.profiles?.some((profile) => profile.hasPassword) ? "Mentett jelszó van – üresen hagyva megtartja" : "Add meg a postafiók jelszavát"} /></label>
              <label className="benjadmin-email-check-field"><input type="checkbox" checked={draft.smtpSecure} onChange={(event) => setDraft((current) => ({ ...current, smtpSecure: event.target.checked }))} /> SSL/TLS használata</label>
            </div>
            <label className="benjadmin-data-field"><span>Teszt címzettek</span><input value={draft.testRecipients} onChange={(event) => setDraft((current) => ({ ...current, testRecipients: event.target.value }))} /></label>
            <label className="benjadmin-data-field"><span>Licencaktiválási rendszerüzenet címzettjei</span><input value={draft.licenseActivationRecipients} onChange={(event) => setDraft((current) => ({ ...current, licenseActivationRecipients: event.target.value }))} placeholder="admin@dimpro.hu, info@dimpro.hu" /></label>
            <label className="benjadmin-data-field"><span>Licenclevelek válaszcíme</span><input value={draft.licenseReplyTo} onChange={(event) => setDraft((current) => ({ ...current, licenseReplyTo: event.target.value }))} placeholder="info@dimpro.hu" /></label>
            <InfoGrid items={[
              { label: "Konfigurációs fájl", value: data?.storageExists ? "Létezik" : "Még nincs" },
              { label: "SMTP kész profil", value: `${smtpReadyCount}/${data?.profileCount ?? draft.profiles.length}` },
              { label: "SMTP secure", value: draft.smtpSecure ? "Igen" : "Nem" },
              { label: "Teszt napló", value: `${data?.tests?.length ?? 0} bejegyzés` },
            ]} />
            <button type="button" className="benjadmin-data-primary-action is-full" onClick={() => void saveSettings()} disabled={loading || draft.profiles.length === 0}>{loading ? <Loader2 className="is-spinning" size={15} /> : <Mail size={15} />} SMTP beállítások mentése</button>
          </div>
        </aside>
      ) : null}

      {selectedProfile ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="E-mail profil bezárása" onClick={() => setSelectedProfileId(null)} /> : null}
      {selectedProfile ? (
        <aside className="benjadmin-data-drawer benjadmin-email-profile-drawer" data-testid="benjadmin-email-profile-drawer">
          <header><div><span>FELADÓPROFIL</span><strong>{selectedProfile.label}</strong></div><button type="button" onClick={() => setSelectedProfileId(null)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-email-profile-form">
            <section className="benjadmin-data-form-section"><header><strong>{profileShortLabels[selectedProfile.id]}</strong><BenjadminStatusPill tone={selectedSavedProfile?.smtpConfigured ? "ok" : "warning"}>{selectedSavedProfile?.smtpConfigured ? "SMTP kész" : "Beállítás hiányos"}</BenjadminStatusPill></header><p>{selectedProfile.purpose}</p></section>
            <label className="benjadmin-data-field"><span>E-mail cím</span><input value={selectedProfile.address} onChange={(event) => updateProfile(selectedProfile.id, { address: event.target.value })} /></label>
            <label className="benjadmin-data-field"><span>Megjelenő név</span><input value={selectedProfile.displayName} onChange={(event) => updateProfile(selectedProfile.id, { displayName: event.target.value })} /></label>
            <label className="benjadmin-email-check-field"><input type="checkbox" checked={selectedProfile.enabled} onChange={(event) => updateProfile(selectedProfile.id, { enabled: event.target.checked })} /> Automatikus küldés engedélyezve</label>
            <InfoGrid items={[
              { label: "SMTP host", value: selectedSavedProfile?.smtpHost || data?.smtpHost || "—" },
              { label: "SMTP port", value: String(selectedSavedProfile?.smtpPort ?? data?.smtpPort ?? "—") },
              { label: "Jelszó", value: selectedSavedProfile?.hasPassword ? "Mentve" : "Nincs" },
              { label: "Utolsó teszt", value: formatDateTime(selectedLatestTest?.createdAt) },
            ]} />
            {selectedLatestTest ? <section className="benjadmin-data-form-section"><header><strong>Utolsó teszt eredménye</strong><BenjadminStatusPill tone={selectedLatestTest.sent ? "ok" : "danger"}>{selectedLatestTest.sent ? "Sikeres" : "Sikertelen"}</BenjadminStatusPill></header><p>{selectedLatestTest.friendlyError || selectedLatestTest.error || selectedLatestTest.reason}</p></section> : null}
            <div className="benjadmin-email-profile-actions">
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void testProfile(selectedProfile.id)} disabled={testingProfileId !== null || !selectedSavedProfile?.smtpConfigured}>{testingProfileId === selectedProfile.id ? <Loader2 className="is-spinning" size={15} /> : <Send size={15} />} Teszt e-mail</button>
              <button type="button" className="benjadmin-data-primary-action" onClick={() => void saveSettings()} disabled={loading}><Mail size={15} /> Profil mentése</button>
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
