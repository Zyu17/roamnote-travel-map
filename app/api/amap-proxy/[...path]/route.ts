const AMAP_REST_HOST = "https://restapi.amap.com";
const AMAP_STYLE_HOST = "https://webapi.amap.com";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const securityCode = process.env.AMAP_SECURITY_CODE;

  const { path } = await context.params;
  // AMap requires the serviceHost URL to end in the literal
  // `/_AMapService` prefix. Strip that routing prefix before forwarding.
  const normalizedPath = path[0] === "_AMapService" ? path.slice(1) : path;
  const suffix = normalizedPath.join("/");
  const isStyleRequest = suffix.startsWith("v4/map/styles");
  const host = isStyleRequest ? AMAP_STYLE_HOST : AMAP_REST_HOST;
  const incoming = new URL(request.url);
  const target = new URL(`${host}/${suffix}`);
  incoming.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  if (!securityCode) return Response.json({ error: "AMAP_SECURITY_CODE is not configured" }, { status: 503 });

  // Requests made by the JS SDK already contain the Web(JS API) key. The
  // matching security code must be appended server-side; replacing that key
  // with a Web Service key breaks map-tile authentication.
  target.searchParams.set("jscode", securityCode);

  const upstream = await fetch(target, {
    method: request.method,
    headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      "cache-control": upstream.headers.get("cache-control") ?? "private, max-age=60",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
