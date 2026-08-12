import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const viewport: Viewport = { themeColor: "#0b1220" };

export const metadata: Metadata = {
  title: "BENJADMIN Fejlesztői Konzol",
  description: "DIMPRO BENJADMIN napi ember-AI fejlesztési együttműködési felület.",
  manifest: "/benjadmin-console.webmanifest",
  appleWebApp: { capable: true, title: "BENJADMIN Konzol", statusBarStyle: "black-translucent" },
  icons: { apple: "/pwa/dimpro-dev-192.png" },
};

export default function DeveloperConsoleLayout({ children }: { children: ReactNode }) {
  return children;
}
