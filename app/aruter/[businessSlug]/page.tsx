import { AruterPublicOfferPage } from "@/components/aruter/AruterOfferPages";

type PageProps = {
  params: Promise<{
    businessSlug: string;
  }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { businessSlug } = await params;
  return {
    title: `${businessSlug} - DIMPRO Árutér ajánlatoldal`,
  };
}

export default async function Page({ params }: PageProps) {
  await params;
  return <AruterPublicOfferPage />;
}
