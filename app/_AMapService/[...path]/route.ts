const AMAP_REST_HOST = "https://restapi.amap.com";
const AMAP_STYLE_HOST = "https://webapi.amap.com";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const securityCode = process.env.AMAP_SECURITY_CODE;
  if (!securityCode) return Response.json({ error: "AMAP_SECURITY_CODE is not configured" }, { status: 503 });
  const { path } = await context.params;
  const suffix = path.join("/");
  const host = suffix.startsWith("v4/map/styles") ? AMAP_STYLE_HOST : AMAP_REST_HOST;
  const incoming = new URL(request.url);
  const target = new URL(`${host}/${suffix}`);
  incoming.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  target.searchParams.set("jscode", securityCode);
  const upstream = await fetch(target, { method: request.method, headers: { "content-type": request.headers.get("content-type") ?? "application/json" }, body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer() });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8", "cache-control": upstream.headers.get("cache-control") ?? "private, max-age=60" } });
}

export const GET = proxy;
export const POST = proxy;
