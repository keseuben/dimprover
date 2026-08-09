import type { Metadata } from "next";
import type { ReactNode } from "react";
import CustomerThemeShell from "@/components/admin/CustomerThemeShell";
import "../admin/admin-theme.css";

export const metadata: Metadata = {
  title: "DIMPRO ügyféloldali licencportál",
};

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <CustomerThemeShell>{children}</CustomerThemeShell>;
}
