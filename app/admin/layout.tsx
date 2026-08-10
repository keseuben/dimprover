import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AdminThemeShell from "@/components/admin/AdminThemeShell";
import "./admin-theme.css";


export const viewport: Viewport = { themeColor: "#0e7490" };

export const metadata: Metadata = {
  title: "DIMPRO BENJADMIN – AI Fejlesztési és Üzemeltetési Központ",
  manifest: "/dimpro-dev.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BENJADMIN",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/pwa/dimpro-dev-192.png",
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminThemeShell>{children}</AdminThemeShell>;
}
