import { CommerceStorefrontAdmin } from "@/components/aruter/CommerceStorefrontAdmin";

export const metadata = {
  title: "Storefront kapcsolatok - DIMPRO Árutér Commerce Core",
};

export default function CommerceStorefrontAdminPage() {
  return <CommerceStorefrontAdmin storefrontSlug="kovacs-kerteszet" />;
}
