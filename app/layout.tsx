import type { Metadata } from "next";
import "./globals.css";
import SessionGuardClient from "@/components/auth/SessionGuardClient";

export const metadata: Metadata = {
  title: "DIMPROVER",
  description: "Digitális Műszaki Projektirányítási Rendszer",

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
  {children}
</body>
    </html>
  );
}