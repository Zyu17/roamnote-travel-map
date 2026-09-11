export function GET() {
  const amapJsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  if (!amapJsKey) {
    return Response.json({ error: "Map configuration is unavailable" }, { status: 503 });
  }
  return Response.json(
    { amapJsKey },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
