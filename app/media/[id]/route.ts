import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { placeImages } from "@/db/schema";

type Context = { params: Promise<{ id: string }> };

async function serve(request: Request, context: Context, head: boolean) {
  const { id } = await context.params;
  if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(id)) return new Response(null, { status: 404 });
  if (!env.BUCKET) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    // Resolve approved IDs, never expose arbitrary bucket keys or original files.
    const row = await getDb().select().from(placeImages)
      .where(and(eq(placeImages.id, id), eq(placeImages.approved, true))).get();
    if (!row) return new Response(null, { status: 404 });
    if (!/^image\/(webp|avif|jpeg|png)$/.test(row.contentType)) return new Response(null, { status: 404 });
    let object: R2Object | null;
    let body: ReadableStream | null = null;
    if (head) object = await env.BUCKET.head(row.objectKey);
    else {
      const content = await env.BUCKET.get(row.objectKey);
      object = content;
      body = content?.body ?? null;
    }
    if (!object) return new Response(null, { status: 404 });
    const headers = new Headers({
      "Content-Type": row.contentType,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=3600",
      "ETag": object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    const etags = (request.headers.get("If-None-Match") ?? "").split(",").map((tag) => tag.trim().replace(/^W\//, ""));
    if (etags.includes(object.httpEtag) || etags.includes("*")) {
      await body?.cancel();
      headers.delete("Content-Length");
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { headers });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export function GET(request: Request, context: Context) { return serve(request, context, false); }
export function HEAD(request: Request, context: Context) { return serve(request, context, true); }
