import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AdminThemeShell from "@/components/admin/AdminThemeShell";
import "../admin/admin-theme.css";

export const metadata: Metadata = {
  title: "DIMPRO Admin belépési napló",
};

export const viewport: Viewport = {
  themeColor: "#0e7490",
};

export default function AdminLogLayout({ children }: { children: ReactNode }) {
  return <AdminThemeShell>{children}</AdminThemeShell>;
}
