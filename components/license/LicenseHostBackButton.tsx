"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BackTarget = {
  href: string;
  label: string;
};

function resolveBackTarget(pathname: string): BackTarget {
  if (pathname.startsWith("/admin/dev/rendszerstruktura")) {
    return { href: "/admin/dev", label: "Fejlesztési Központ" };
  }
  if (pathname === "/admin/dev" || pathname.startsWith("/admin/dev/")) {
    return { href: "/admin", label: "Licencadmin" };
  }
  if (pathname === "/admin") {
    return { href: "/admin/dev", label: "Fejlesztési Központ" };
  }
  if (pathname.startsWith("/adminlog")) {
    return { href: "/admin", label: "Licencadmin" };
  }
  if (pathname.startsWith("/admin/")) {
    return { href: "/admin", label: "Licencadmin" };
  }
  if (pathname.startsWith("/drive/drop")) {
    return { href: "/drive", label: "DIMPRO Drive" };
  }
  if (pathname.startsWith("/drive")) {
    return { href: "/admin/drive", label: "Drive admin" };
  }
  if (pathname.startsWith("/customer/")) {
    return { href: "/customer", label: "Ügyfélportál" };
  }
  if (pathname === "/customer") {
    return { href: "https://dimpro.hu", label: "DIMPRO kezdőlap" };
  }
  return { href: "/admin", label: "Licencadmin" };
}

export default function LicenseHostBackButton() {
  const pathname = usePathname();
  const [isLicenseHost, setIsLicenseHost] = useState(false);

  useEffect(() => {
    setIsLicenseHost(window.location.hostname === "license.dimpro.hu");
  }, []);

  const target = useMemo(() => resolveBackTarget(pathname || "/"), [pathname]);

  if (!isLicenseHost) return null;

  const hasStructureDock = pathname?.startsWith("/admin/dev/rendszerstruktura");
  const hasDevCenterDock = pathname === "/admin/dev";
  const dockClass = hasStructureDock ? "has-structure-dock" : hasDevCenterDock ? "has-dev-center-dock" : "";

  return (
    <Link
      href={target.href}
      className={`dimpro-license-safe-back ${dockClass}`}
      aria-label={`Vissza: ${target.label}`}
      title={`Vissza: ${target.label}`}
      prefetch={false}
    >
      <ArrowLeft size={18} aria-hidden="true" />
      <span>Vissza</span>
      <small>{target.label}</small>
    </Link>
  );
}
