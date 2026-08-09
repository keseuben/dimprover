import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://projektkapu.dimpro.hu"),
  title: "DIMPRO Projektkapu – D6 Core",
  description: "DIMPRO Projektkapu – D6 Core projektplatform hat összekapcsolt projektmodullal.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "DIMPRO Projektkapu – D6 Core",
    description: "A projekt digitális kapuja. Hat összekapcsolt projektmodul.",
    url: "https://projektkapu.dimpro.hu",
    siteName: "DIMPRO Projektkapu",
    locale: "hu_HU",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default function ProjektkapuLayout({ children }: { children: React.ReactNode }) {
  return children;
}
