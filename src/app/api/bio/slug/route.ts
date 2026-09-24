import { ok, route } from "@/lib/api";
import { checkSlug } from "@/lib/bio-slug";

export const runtime = "nodejs";

/**
 * Is this Link-in-Bio address free? Called as the customer types. Signed-in
 * only, and the answer is a yes/no about a public URL — anyone can already
 * find out whether /l/<slug> exists by opening it.
 */
export const GET = route(async ({ request }) => {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  const pageId = url.searchParams.get("pageId");
  return ok(await checkSlug(slug, pageId));
});
