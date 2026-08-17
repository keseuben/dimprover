import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import FieldCapturePwaShell from "@/components/field-capture/FieldCapturePwaShell";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = (forwardedHost || requestHeaders.get("host") || "").replace(/:\d+$/, "").toLowerCase();
  const isDev = host === "dev.dimpro.hu" || host === "app.dev.dimpro.hu" || host.endsWith(".dev.dimpro.hu") || host === "localhost" || host === "127.0.0.1";
  const appName = isDev ? "DIMPRO Terepi Gyorsrögzítő DEV" : "DIMPRO Terepi Gyorsrögzítő";
  return {
    title: `${appName} – helyszíni fotó és gyors adatbevitel`,
    description: "Capture-first DIMPRO terepi PWA képek, megjegyzések, későbbi GPS/tájolás és külön Drive-célok rögzítéséhez.",
    manifest: isDev ? "/field-capture-dev.webmanifest" : undefined,
    applicationName: appName,
    appleWebApp: { capable: true, title: appName, statusBarStyle: "default" },
    icons: {
      icon: [
        { url: "/drop-app-icon-v099-192.png", sizes: "192x192", type: "image/png" },
        { url: "/drop-app-icon-v099-512.png", sizes: "512x512", type: "image/png" }
      ],
      apple: [{ url: "/drop-apple-touch-v099-180.png", sizes: "180x180", type: "image/png" }]
    },
    robots: { index: false, follow: false, nocache: true }
  };
}

export const viewport: Viewport = {
  themeColor: "#0f766e",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function FieldCaptureLayout({ children }: { children: ReactNode }) {
  return <FieldCapturePwaShell>{children}</FieldCapturePwaShell>;
}
