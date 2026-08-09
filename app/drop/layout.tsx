import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import DropPwaShell from "@/components/drop/DropPwaShell";

export const metadata: Metadata = {
  title: "DIMPRO Drop – biztonságos fájl- és képcsomagátadás",
  description: "Mobilra telepíthető, biztonságos DIMPRO kép- és fájlfeltöltő galériaválasztással, optimalizálással és képcsoportokkal.",
  manifest: "/drop.webmanifest",
  applicationName: "DIMPRO Drop",
  appleWebApp: {
    capable: true,
    title: "DIMPRO Drop",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/drop-favicon-v099-32.png", sizes: "32x32", type: "image/png" },
      { url: "/drop-app-icon-v099-192.png", sizes: "192x192", type: "image/png" },
      { url: "/drop-app-icon-v099-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/drop-favicon-v099.ico", type: "image/x-icon" }],
    apple: [{ url: "/drop-apple-touch-v099-180.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function DropLayout({ children }: { children: ReactNode }) {
  return <DropPwaShell>{children}</DropPwaShell>;
}
