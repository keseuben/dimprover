import { NextRequest, NextResponse } from "next/server";
import { readLicenseStore } from "@/app/lib/license/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusLabels: Record<string, string> = {
  active: "Aktív",
  trial: "Próba",
  pending: "Függőben",
  blocked: "Tiltott",
  expired: "Lejárt",
  archived: "Archivált",
};

const moduleLabels: Record<string, string> = {
  hage_workspace: "HAGE munkafelület",
  tasks: "Feladatkezelés",
  vacations: "Szabadságtervező",
  documents: "Dokumentumtár",
  minutes: "Jegyzőkönyvek",
  schedule: "Ütemterv",
  aruter: "Árutér",
};

export async function GET(request: NextRequest) {
  const licenseKey = request.nextUrl.searchParams.get("licenseKey")?.trim();
  if (!licenseKey) {
    return NextResponse.json({ ok: false, error: "Hiányzó licenckulcs." }, { status: 400 });
  }

  const store = await readLicenseStore();
  const license = store.licenses.find((item) => item.licenseKey === licenseKey);
  if (!license) {
    return NextResponse.json({ ok: false, error: "A licenc nem található." }, { status: 404 });
  }

  const devices = store.devices.filter((device) => device.licenseId === license.id);
  const activeDeviceCount = devices.filter((device) => device.status === "active").length;

  return NextResponse.json(
    {
      ok: true,
      license: {
        companyName: license.companyName,
        status: license.status,
        statusLabel: statusLabels[license.status] ?? license.status,
        expiresAt: license.expiresAt,
        maxDevices: license.maxDevices,
        activeDeviceCount,
        devices: devices.map((device, index) => ({
          serialNumber: index + 1,
          userName: device.userName ?? "",
          organizationUnit: device.organizationUnit ?? "",
          machineIdHash: device.machineIdHash,
          appId: device.appId,
          firstActivatedAt: device.firstActivatedAt,
          lastOnlineCheckAt: device.lastOnlineCheckAt,
          status: device.status,
          note: device.note ?? "",
        })),
        enabledModules: license.enabledModules.map((moduleId) => ({
          id: moduleId,
          label: moduleLabels[moduleId] ?? moduleId,
        })),
        planCode: license.planCode ?? "manual",
        billingInterval: license.billingInterval ?? "manual",
        billingStatus: license.billingStatus ?? "manual",
        currentPeriodEnd: license.currentPeriodEnd ?? license.expiresAt,
        contactName: license.contactName ?? "",
        contactEmail: license.contactEmail ?? "",
        contactPhone: license.contactPhone ?? "",
        secondaryContactName: license.secondaryContactName ?? "",
        secondaryContactEmail: license.secondaryContactEmail ?? "",
        secondaryContactPhone: license.secondaryContactPhone ?? "",
        additionalContacts: (license.additionalContacts ?? []).map((contact) => ({
          id: contact.id,
          name: contact.name,
          role: contact.role ?? "",
          email: contact.email,
          phone: contact.phone ?? "",
          receiveEmail: contact.receiveEmail,
        })),
        adminNote: license.adminNote ?? "",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
