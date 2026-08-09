"use client";

import { useRef, useState } from "react";

type CustomerLicense = {
  companyName: string;
  status: string;
  statusLabel: string;
  expiresAt: string;
  maxDevices: number;
  activeDeviceCount: number;
  devices: {
    serialNumber: number;
    userName: string;
    organizationUnit: string;
    machineIdHash: string;
    appId: string;
    firstActivatedAt: string;
    lastOnlineCheckAt: string;
    status: string;
    note: string;
  }[];
  enabledModules: { id: string; label: string }[];
  planCode: string;
  billingInterval: string;
  billingStatus: string;
  currentPeriodEnd: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  secondaryContactName: string;
  secondaryContactEmail: string;
  secondaryContactPhone: string;
  additionalContacts: {
    id: string;
    name: string;
    role: string;
    email: string;
    phone: string;
    receiveEmail: boolean;
  }[];
  adminNote: string;
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("hu-HU");
}

function daysLeft(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Lejárt ${Math.abs(days)} napja`;
  if (days === 0) return "Ma jár le";
  return `${days} nap van hátra`;
}

function maskLicenseKey(value: string) {
  const clean = value.trim();
  if (!clean) return "-";
  const parts = clean.split("-").filter(Boolean);
  if (parts.length >= 4) {
    return `${parts.slice(0, 2).join("-")}-••••••••-${parts.at(-1)}`;
  }
  if (clean.length <= 10) return `${clean.slice(0, 3)}••••`;
  return `${clean.slice(0, 10)}••••••••${clean.slice(-4)}`;
}

function deviceStatusLabel(status: string) {
  return status === "blocked" ? "Tiltott" : "Aktív";
}

export default function LicenseCustomerPage() {
  const [licenseKey, setLicenseKey] = useState("");
  const [maskedLicenseKey, setMaskedLicenseKey] = useState("");
  const [license, setLicense] = useState<CustomerLicense | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const clearKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadLicense() {
    const key = licenseKey.trim();
    if (!key) {
      setMessage("Add meg a licenckulcsot.");
      return;
    }
    setLoading(true);
    setMessage("");
    setLicense(null);
    setShowDevices(false);
    try {
      const response = await fetch(`/api/license/customer?licenseKey=${encodeURIComponent(key)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "Nem sikerült lekérdezni a licencet.");
        return;
      }
      setLicense(data.license);
      setMaskedLicenseKey(maskLicenseKey(key));
      setMessage("Licenc lekérdezve. A beírt licenckulcs 5 másodperc múlva törlődik a mezőből.");
      if (clearKeyTimerRef.current) clearTimeout(clearKeyTimerRef.current);
      clearKeyTimerRef.current = setTimeout(() => {
        setLicenseKey("");
      }, 5000);
    } catch {
      setMessage("Hálózati vagy szerverhiba történt.");
    } finally {
      setLoading(false);
    }
  }

  const freeDeviceSlots = license ? Math.max(license.maxDevices - license.activeDeviceCount, 0) : 0;
  const contactRows = license
    ? [
        { id: "primary", name: license.contactName, role: "Elsődleges kapcsolattartó", email: license.contactEmail, phone: license.contactPhone },
        { id: "secondary", name: license.secondaryContactName, role: "Másodlagos kapcsolattartó", email: license.secondaryContactEmail, phone: license.secondaryContactPhone },
        ...(license.additionalContacts ?? []).map((contact) => ({
          id: contact.id,
          name: contact.name,
          role: contact.role || "További értesítési kapcsolattartó",
          email: contact.email,
          phone: contact.phone,
        })),
      ].filter((contact) => contact.name || contact.email || contact.phone)
    : [];

  return (
    <main className="min-h-screen bg-[#050812] px-5 py-10 text-slate-100">
      <section className="mx-auto w-full max-w-7xl rounded-[2rem] border border-cyan-400/20 bg-slate-950/80 p-6 shadow-[0_0_80px_rgba(34,211,238,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">DIMPRO ügyféloldali licencportál</p>
        <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">Licenc állapot lekérdezése</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">Add meg a kapott licenckulcsot. A felület megmutatja a licenc állapotát, lejáratát, gépszámát és moduljogosultságait.</p>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void loadLicense();
            }}
            placeholder="DIMPRO-..."
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
          />
          <button type="button" onClick={loadLicense} disabled={loading} className="rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 disabled:opacity-60">
            {loading ? "Lekérdezés..." : "Lekérdezés"}
          </button>
        </div>

        {message ? <div className="mt-5 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}

        {license ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Cég</div><div className="mt-2 text-lg font-semibold text-white">{license.companyName}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Státusz</div><div className="mt-2 text-lg font-semibold text-white">{license.statusLabel}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Licencazonosító</div><div className="mt-2 break-all text-lg font-semibold text-white">{maskedLicenseKey || "••••••••"}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Lejárat</div><div className="mt-2 text-lg font-semibold text-white">{formatDate(license.expiresAt)}</div><div className="mt-1 text-sm text-cyan-200">{daysLeft(license.expiresAt)}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Gépek</div><div className="mt-2 text-lg font-semibold text-white">{license.activeDeviceCount}/{license.maxDevices} aktív gép</div><div className="mt-1 text-sm text-cyan-200">Szabad géphely: {freeDeviceSlots}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Csomag</div><div className="mt-2 text-lg font-semibold text-white">{license.planCode}</div><div className="mt-1 text-sm text-slate-400">Fizetés: {license.billingStatus} · Ciklus: {license.billingInterval}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:col-span-2 xl:col-span-3"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Moduljogosultságok</div><div className="mt-3 flex flex-wrap gap-2">{license.enabledModules.length ? license.enabledModules.map((module) => <span key={module.id} className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs text-cyan-100">{module.label}</span>) : <span className="text-sm text-slate-400">Nincs modul megadva.</span>}</div></div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:col-span-2 xl:col-span-1">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Kapcsolattartók</div>
              <div className="mt-3 space-y-3 text-sm text-slate-300">
                {contactRows.length === 0 ? <div className="text-slate-400">Nincs kapcsolattartó megadva.</div> : contactRows.map((contact, index) => (
                  <div key={contact.id} className={index === 0 ? "" : "border-t border-slate-800 pt-3"}>
                    <div className="font-semibold text-white">{contact.name || "Név nincs megadva"}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">{contact.role}</div>
                    <div className="mt-2"><span className="text-slate-500">E-mail:</span> <span className="font-semibold text-white">{contact.email || "-"}</span></div>
                    <div><span className="text-slate-500">Telefon:</span> <span className="font-semibold text-white">{contact.phone || "-"}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:col-span-2 xl:col-span-2">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Admin megjegyzés</div>
              <div className="mt-3 min-h-12 whitespace-pre-wrap text-sm leading-6 text-slate-300">{license.adminNote || "-"}</div>
            </div>
          </div>
        ) : null}
      </section>

      {license ? (
        <section className="mx-auto mt-6 w-full max-w-[1700px] rounded-[2rem] border border-cyan-400/20 bg-[#080e1d] shadow-[0_0_70px_rgba(15,23,42,0.85)]">
          <button type="button" onClick={() => setShowDevices((current) => !current)} className="flex w-full items-center justify-between gap-4 rounded-t-[2rem] bg-slate-950/70 px-5 py-4 text-left">
            <div>
              <div className="text-base font-semibold text-white">Aktivált gépek</div>
              <div className="mt-1 text-sm text-slate-400">{license.activeDeviceCount} aktív gép · {showDevices ? "táblázat nyitva" : "összecsukva"}</div>
            </div>
            <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs font-semibold text-cyan-100">{showDevices ? "Bezárás" : "Kinyitás"}</span>
          </button>

          {showDevices ? (
            <div className="overflow-x-auto border-t border-slate-800 bg-slate-950/40 rounded-b-[2rem]">
              <table className="min-w-[1450px] text-left text-sm">
                <thead className="bg-slate-950/80 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Sorszám</th>
                    <th className="px-4 py-3">Név</th>
                    <th className="px-4 py-3">Szervezeti egység</th>
                    <th className="px-4 py-3">Gépazonosító</th>
                    <th className="px-4 py-3">Alkalmazás</th>
                    <th className="px-4 py-3">Aktiválva</th>
                    <th className="px-4 py-3">Utolsó ellenőrzés</th>
                    <th className="px-4 py-3">Státusz</th>
                    <th className="px-4 py-3">Megjegyzés</th>
                  </tr>
                </thead>
                <tbody>
                  {license.devices.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-5 text-slate-400">Még nincs aktivált gép.</td></tr>
                  ) : (
                    license.devices.map((device) => (
                      <tr key={`${device.machineIdHash}-${device.serialNumber}`} className="border-t border-slate-800">
                        <td className="px-4 py-3 text-slate-300">{device.serialNumber}</td>
                        <td className="px-4 py-3 text-white">{device.userName || "-"}</td>
                        <td className="px-4 py-3 text-slate-300">{device.organizationUnit || "-"}</td>
                        <td className="max-w-[380px] truncate px-4 py-3 font-mono text-xs text-slate-300">{device.machineIdHash}</td>
                        <td className="px-4 py-3 text-slate-300">{device.appId}</td>
                        <td className="px-4 py-3 text-slate-300">{formatDate(device.firstActivatedAt)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatDate(device.lastOnlineCheckAt)}</td>
                        <td className="px-4 py-3 text-slate-300">{deviceStatusLabel(device.status)}</td>
                        <td className="px-4 py-3 text-slate-300">{device.note || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
