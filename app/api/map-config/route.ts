export function GET() {
  // Cloudflare stores this as a server-side Worker secret. The response only
  // exposes the JavaScript API key, which AMap requires the browser to load.
  const amapJsKey = process.env.AMAP_JS_KEY ?? process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  if (!amapJsKey) {
    return Response.json({ error: "Map configuration is unavailable" }, { status: 503 });
  }
  return Response.json(
    { amapJsKey },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
