import { Readable } from "node:stream";
import { EXT, isToken, openUpload } from "@/lib/media/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A scheduler upload, served to Instagram for publishing. See docs/SCHEDULER.md.
 *
 * Public by design: Instagram's servers fetch it with no credentials. The
 * 32-character random token is what keeps it private until it's published,
 * and the file is deleted after. Only JPEG, MP4 and MOV are ever stored, so
 * nothing served here can run in a browser. Range requests are supported,
 * which video fetchers use.
 */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const match = file.match(/^([A-Za-z0-9_-]{32})\.([a-z0-9]+)$/);
  if (!match || !isToken(match[1])) return notFound();

  const rangeHeader = request.headers.get("range");
  const range = parseRange(rangeHeader);
  const found = await openUpload(match[1], range ?? undefined);
  if (!found || EXT[found.upload.mime] !== match[2]) {
    found?.stream?.destroy();
    return notFound();
  }
  if (!found.stream) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${found.size}` } });
  }

  const headers = new Headers({
    "Content-Type": found.upload.mime,
    "Content-Length": String(found.end - found.start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  });
  if (range) headers.set("Content-Range", `bytes ${found.start}-${found.end}/${found.size}`);

  return new Response(Readable.toWeb(found.stream) as ReadableStream, { status: range ? 206 : 200, headers });
}

export async function HEAD(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const res = await GET(request, ctx);
  await res.body?.cancel();
  return new Response(null, { status: res.status, headers: res.headers });
}

function parseRange(header: string | null): { start: number; end?: number } | null {
  const m = header?.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  return { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined };
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
}
