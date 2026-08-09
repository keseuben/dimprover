"use client";

import React, { FormEvent, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  Building2,
  CheckCircle2,
  EyeOff,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  XCircle,
} from "lucide-react";

const settingsItems = [
  { title: "Cégadatok", Icon: Building2 },
  { title: "Felhasználók", Icon: Users },
  { title: "Jogosultságok", Icon: ShieldCheck },
  { title: "Sablonok", Icon: LayoutTemplate },
  { title: "Modulbeállítások", Icon: SlidersHorizontal },
];

type GoogleConfigStatus = {
  ready: boolean;
  missing: string[];
  redirectUri: string;
  source: "database" | "environment" | "default";
  clientIdMasked: string;
  clientSecretSet: boolean;
};

const DEFAULT_GOOGLE_REDIRECT_URI =
  "https://dimprover.hu/api/calendar/integrations/google/callback";

export default function SettingsPage() {
  const [googleStatus, setGoogleStatus] = useState<GoogleConfigStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(DEFAULT_GOOGLE_REDIRECT_URI);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadGoogleConfig() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/calendar/integrations/google/config", {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Google konfiguráció lekérése sikertelen.");
      }

      setGoogleStatus(payload.google);
      setRedirectUri(payload.google.redirectUri || DEFAULT_GOOGLE_REDIRECT_URI);
    } catch (configError) {
      setError(
        configError instanceof Error
          ? configError.message
          : "Google konfiguráció lekérése sikertelen.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadGoogleConfig();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function saveGoogleConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/calendar/integrations/google/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, redirectUri }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Google konfiguráció mentése sikertelen.");
      }

      setGoogleStatus(payload.google);
      setClientSecret("");
      setMessage("Google Naptár OAuth beállítások mentve.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Google konfiguráció mentése sikertelen.",
      );
    } finally {
      setSaving(false);
    }
  }

  const isReady = Boolean(googleStatus?.ready);

  return (
    <AppLayout>
      <div className="mb-7">
        <p className="text-sm font-medium text-slate-500">DIMPROVER modul</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Beállítások</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Cégadatok, felhasználók, jogosultságok, sablonok és külső integrációk kezelési felülete.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {settingsItems.map((item) => {
          const Icon = item.Icon;
          return (
            <section key={item.title} className="rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Icon size={22} />
              </div>
              <h2 className="text-lg font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Előkészített modulhely a későbbi rendszerbeállításokhoz.</p>
            </section>
          );
        })}
      </div>

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Settings className="text-sky-700" size={22} />
              <h2 className="text-lg font-semibold text-slate-950">Google Naptár integráció</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Ezeket az adatokat csak az admin állítja be egyszer. A felhasználóknak később csak a Google Naptár csatlakoztatása gombot kell használniuk.
            </p>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${isReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {isReady ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {isReady ? "Beállítva" : "Hiányos beállítás"}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={saveGoogleConfig} className="space-y-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Google Client ID</span>
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={googleStatus?.clientIdMasked || "Google OAuth Client ID"}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
              <span className="mt-2 block text-xs text-slate-500">Mentéskor a Google Cloud Console OAuth Client ID értékét add meg.</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Google Client Secret</span>
              <input
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                type="password"
                placeholder={googleStatus?.clientSecretSet ? "Már beállítva, csak csere esetén töltsd ki" : "Google OAuth Client Secret"}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
              <span className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <EyeOff size={14} /> A secret nem jelenik meg visszaolvasáskor, és titkosított payloadként kerül mentésre.
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Redirect URI</span>
              <input
                value={redirectUri}
                onChange={(event) => setRedirectUri(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
              <span className="mt-2 block text-xs text-slate-500">Ennek pontosan egyeznie kell a Google Cloud OAuth client Authorized redirect URI értékével.</span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                Mentés
              </button>
              <a
                href="/api/calendar/integrations/google/start"
                className={`inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition ${isReady ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50" : "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"}`}
              >
                <KeyRound size={17} /> Google Naptár csatlakoztatása
              </a>
            </div>

            {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
            {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          </form>

          <aside className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Aktuális állapot</h3>
            {loading ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="animate-spin" size={17} /> Betöltés...
              </div>
            ) : (
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="font-medium text-slate-500">Forrás</dt>
                  <dd className="mt-1 text-slate-900">{googleStatus?.source || "default"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Client ID</dt>
                  <dd className="mt-1 text-slate-900">{googleStatus?.clientIdMasked || "Nincs beállítva"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Client Secret</dt>
                  <dd className="mt-1 text-slate-900">{googleStatus?.clientSecretSet ? "Beállítva" : "Nincs beállítva"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Redirect URI</dt>
                  <dd className="mt-1 break-all text-slate-900">{googleStatus?.redirectUri || DEFAULT_GOOGLE_REDIRECT_URI}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Hiányzó mezők</dt>
                  <dd className="mt-1 text-slate-900">{googleStatus?.missing?.length ? googleStatus.missing.join(", ") : "Nincs"}</dd>
                </div>
              </dl>
            )}
          </aside>
        </div>
      </section>
    </AppLayout>
  );
}
