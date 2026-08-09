"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type MailProfileId = "system" | "notifications" | "drive" | "noreply" | "billing" | "admin" | "info";

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

const profileOrder: MailProfileId[] = ["system", "notifications", "drive", "noreply", "billing", "admin", "info"];

const profileShortLabels: Record<MailProfileId, string> = {
  system: "Rendszer",
  notifications: "Értesítések",
  drive: "Drive",
  noreply: "No-reply",
  billing: "Számlázás",
  admin: "Admin",
  info: "Info",
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("hu-HU");
}

function inputClass() {
  return "mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-200/40";
}

function darkInputClass() {
  return "mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10";
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

function statusBadge(ok: boolean, labelOk: string, labelBad: string) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-black ${ok ? "border-emerald-300/40 bg-emerald-300/12 text-emerald-200" : "border-amber-300/40 bg-amber-300/12 text-amber-100"}`}>
      {ok ? labelOk : labelBad}
    </span>
  );
}

export default function MailSettingsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [data, setData] = useState<MailSettingsResponse | null>(null);
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(null));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [testingProfileId, setTestingProfileId] = useState<MailProfileId | "all" | null>(null);

  useEffect(() => {
    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (storedAdminKey) setAdminKey(storedAdminKey);
  }, []);

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
      setMessage("Add meg a DIMPRO licencadmin kulcsot.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/mail-settings", {
        headers: {
          "x-dimpro-license-admin-key": trimmedKey,
          accept: "application/json",
        },
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
      setMessage("E-mail profilok betöltve.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen e-mail beállítás lekérési hiba.");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  async function saveSettings() {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setMessage("Add meg a DIMPRO licencadmin kulcsot.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/mail-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": trimmedKey,
          accept: "application/json",
        },
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
      setMessage("Add meg a DIMPRO licencadmin kulcsot.");
      return;
    }

    setTestingProfileId(profileId);
    setMessage("");
    try {
      const response = await fetch("/api/license/mail-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": trimmedKey,
          accept: "application/json",
        },
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

  return (
    <main className="min-h-screen bg-[#06111f] px-5 py-7 text-white lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.22)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/admin" className="text-sm font-black text-cyan-200 hover:text-white">← Vissza a licencadmin felületre</Link>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-cyan-300/80">DIMPRO belső rendszer</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] md:text-5xl">E-mail beállítások</h1>
              <p className="mt-4 max-w-4xl text-sm font-semibold leading-7 text-slate-300">
                Központi SMTP és automatikus feladóprofilok: Szerverőr, app értesítések, DIMPRO Drive, no-reply, számlázás és admin üzenetek.
              </p>
            </div>
            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/80">Konfigurált profilok</p>
              <p className="mt-2 text-3xl font-black">{data?.enabledProfileCount ?? 0}/{data?.profileCount ?? 0}</p>
              <p className="mt-1 text-xs font-semibold text-cyan-50/80">Automatikus küldésre engedélyezve</p>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Admin kulcs</span>
              <input
                type="password"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="DIMPRO-LICENSE-ADMIN-..."
                className={darkInputClass()}
              />
            </label>
            <button
              type="button"
              onClick={() => void loadSettings()}
              disabled={loading || !adminKey.trim()}
              className="rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Betöltés..." : "Beállítások betöltése"}
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={loading || !adminKey.trim() || draft.profiles.length === 0}
              className="rounded-2xl border border-emerald-300/35 bg-emerald-300/10 px-6 py-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mentés
            </button>
          </div>
          {message && <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p>}
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <h2 className="text-2xl font-black tracking-[-0.04em]">Közös SMTP alap</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">DotRoll beállítás a dimpro.hu postafiókokhoz. A jelszó mentés után nem jelenik meg újra.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">SMTP host</span>
                <input value={draft.smtpHost} onChange={(event) => setDraft((current) => ({ ...current, smtpHost: event.target.value }))} className={inputClass()} />
              </label>
              <label>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">SMTP port</span>
                <input value={draft.smtpPort} onChange={(event) => setDraft((current) => ({ ...current, smtpPort: event.target.value.replace(/\D/g, "") }))} className={inputClass()} />
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm font-black text-slate-200">
              <input type="checkbox" checked={draft.smtpSecure} onChange={(event) => setDraft((current) => ({ ...current, smtpSecure: event.target.checked }))} className="h-4 w-4 accent-cyan-300" />
              SSL/TLS használata
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Közös SMTP jelszó</span>
              <input
                type="password"
                value={draft.sharedPassword}
                onChange={(event) => setDraft((current) => ({ ...current, sharedPassword: event.target.value }))}
                placeholder={data?.profiles?.some((profile) => profile.hasPassword) ? "Mentett jelszó van – üresen hagyva megtartja" : "Add meg a DotRoll postafiók jelszavát"}
                className={inputClass()}
              />
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Teszt címzettek</span>
              <input value={draft.testRecipients} onChange={(event) => setDraft((current) => ({ ...current, testRecipients: event.target.value }))} className={inputClass()} />
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Licencaktiválási rendszerüzenet címzettjei</span>
              <input
                value={draft.licenseActivationRecipients}
                onChange={(event) => setDraft((current) => ({ ...current, licenseActivationRecipients: event.target.value }))}
                placeholder="admin@dimpro.hu, info@dimpro.hu"
                className={inputClass()}
              />
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-400">Több DIMPRO e-mail cím vesszővel elválasztva adható meg.</span>
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Licenclevelek válaszcíme</span>
              <input
                value={draft.licenseReplyTo}
                onChange={(event) => setDraft((current) => ({ ...current, licenseReplyTo: event.target.value }))}
                placeholder="info@dimpro.hu"
                className={inputClass()}
              />
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-400">Az ügyfél válasza erre a kezelt címre érkezik, miközben a feladó a system@dimpro.hu marad.</span>
            </label>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {statusBadge(Boolean(data?.storageExists), "Szerverfájl létrehozva", "Még nincs mentett fájl")}
              {statusBadge(Boolean(data?.profiles?.some((profile) => profile.smtpConfigured)), "Van működésre kész profil", "Jelszó vagy profil hiányzik")}
            </div>

            <button
              type="button"
              onClick={() => void testProfile("all")}
              disabled={testingProfileId !== null || !data?.profiles?.some((profile) => profile.smtpConfigured)}
              className="mt-5 w-full rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testingProfileId === "all" ? "Összes teszt küldése..." : "Összes engedélyezett profil tesztelése"}
            </button>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <h2 className="text-2xl font-black tracking-[-0.04em]">Feladóprofilok</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">A rendszer a használati cél alapján választ feladót. Az info cím kézi ügyfélkapcsolati cím, ezért alapból nem automatikus profil.</p>

            <div className="mt-5 grid gap-4">
              {draft.profiles.length === 0 ? (
                <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100">Töltsd be az e-mail beállításokat.</p>
              ) : draft.profiles.map((profile) => {
                const savedProfile = data?.profiles?.find((item) => item.id === profile.id);
                const latestTest = latestTestsByProfile.get(profile.id);
                return (
                  <article key={profile.id} className="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">{profileShortLabels[profile.id]}</span>
                          {statusBadge(Boolean(savedProfile?.smtpConfigured), "SMTP kész", "Beállítás hiányos")}
                          {statusBadge(profile.enabled, "Aktív", "Kikapcsolva")}
                        </div>
                        <h3 className="mt-3 text-xl font-black text-white">{profile.label ?? savedProfile?.label}</h3>
                        <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">{profile.purpose}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void testProfile(profile.id)}
                        disabled={testingProfileId !== null || !savedProfile?.smtpConfigured}
                        className="shrink-0 rounded-2xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {testingProfileId === profile.id ? "Teszt..." : "Teszt e-mail"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                      <label>
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">E-mail cím</span>
                        <input value={profile.address} onChange={(event) => updateProfile(profile.id, { address: event.target.value })} className={darkInputClass()} />
                      </label>
                      <label>
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Megjelenő név</span>
                        <input value={profile.displayName} onChange={(event) => updateProfile(profile.id, { displayName: event.target.value })} className={darkInputClass()} />
                      </label>
                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-slate-200 lg:self-end">
                        <input type="checkbox" checked={profile.enabled} onChange={(event) => updateProfile(profile.id, { enabled: event.target.checked })} className="h-4 w-4 accent-cyan-300" />
                        Engedélyezve
                      </label>
                    </div>

                    {latestTest && (
                      <div className={`mt-4 rounded-2xl border p-3 ${latestTest.sent ? "border-emerald-300/25 bg-emerald-300/10" : "border-amber-300/25 bg-amber-300/10"}`}>
                        <p className="text-xs font-black text-white">Utolsó teszt: {latestTest.sent ? "sikeres" : "nem sikerült"}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">{formatDateTime(latestTest.createdAt)} · {latestTest.reason}</p>
                        {latestTest.friendlyError && <p className="mt-2 rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs font-black leading-5 text-red-50">{latestTest.friendlyError}</p>}
                        {latestTest.error && <p className="mt-1 text-xs font-semibold leading-5 text-red-100">Technikai hiba: {latestTest.error}</p>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
          <h2 className="text-2xl font-black tracking-[-0.04em]">Teszt napló</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  <th className="px-3">Időpont</th>
                  <th className="px-3">Profil</th>
                  <th className="px-3">Feladó</th>
                  <th className="px-3">Eredmény</th>
                  <th className="px-3">Címzett</th>
                </tr>
              </thead>
              <tbody>
                {(data?.tests ?? []).length === 0 ? (
                  <tr><td className="rounded-2xl bg-white/[0.04] px-3 py-4 text-sm font-semibold text-slate-400" colSpan={5}>Még nincs teszt napló.</td></tr>
                ) : (data?.tests ?? []).slice(0, 30).map((test) => (
                  <tr key={test.id} className="bg-white/[0.04] text-sm font-semibold text-slate-300">
                    <td className="rounded-l-2xl px-3 py-3 font-black text-white">{formatDateTime(test.createdAt)}</td>
                    <td className="px-3 py-3">{profileShortLabels[test.profileId]}</td>
                    <td className="px-3 py-3 font-mono text-xs text-cyan-100">{test.profileAddress ?? "-"}</td>
                    <td className="px-3 py-3">{test.sent ? "Sikeres" : test.friendlyError ?? test.reason}</td>
                    <td className="rounded-r-2xl px-3 py-3 font-mono text-xs text-slate-400">{test.to.join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
