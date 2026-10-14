import type { Metadata } from "next";
import { bioMetadata, PublicBio } from "@/lib/bio-public";

export const dynamic = "force-dynamic";

/** One tab of a public Link-in-Bio page. */

export async function generateMetadata({ params }: { params: Promise<{ slug: string; tab: string }> }): Promise<Metadata> {
  const { slug, tab } = await params;
  return bioMetadata(slug, tab);
}

export default async function PublicBioTab({ params }: { params: Promise<{ slug: string; tab: string }> }) {
  const { slug, tab } = await params;
  return <PublicBio slug={slug} tabSlug={tab} />;
}
