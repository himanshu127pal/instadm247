import type { Metadata } from "next";
import { bioMetadata, PublicBio } from "@/lib/bio-public";

export const dynamic = "force-dynamic";

/** The public Link-in-Bio page (SendDM #23): its home tab. */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return bioMetadata((await params).slug, null);
}

export default async function PublicBioPage({ params }: { params: Promise<{ slug: string }> }) {
  return <PublicBio slug={(await params).slug} tabSlug={null} />;
}
