import type { Metadata } from "next";
import "./globals.css";
import SessionGuardClient from "@/components/auth/SessionGuardClient";
import LicenseHostBackButton from "@/components/license/LicenseHostBackButton";

export const metadata: Metadata = {
  title: "DIMPRO",
  description: "Digitális munkafolyamat-rendszerek vállalkozásoknak",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SessionGuardClient />
        <LicenseHostBackButton />
        {children}
      </body>
    </html>
  );
}
