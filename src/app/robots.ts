import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in areas and machine endpoints have nothing for a search engine,
      // and tracked-link redirects (/r) would only muddy click counts.
      disallow: ["/dashboard", "/admin", "/api/", "/r/", "/verify-email", "/reset-password"],
    },
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
