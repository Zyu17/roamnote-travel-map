const AMAP_REST_ENDPOINT = "https://restapi.amap.com/v3";

function normalizeLocation(location: unknown): [number, number] | null {
  if (typeof location !== "string") return null;
  const [lng, lat] = location.split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

export async function GET(request: Request) {
  const webServiceKey = process.env.AMAP_WEB_SERVICE_KEY;
  if (!webServiceKey) {
    return Response.json({ error: "AMAP_WEB_SERVICE_KEY is not configured" }, { status: 503 });
  }

  const incoming = new URL(request.url);
  const keyword = incoming.searchParams.get("q")?.trim();
  const requestedMode = incoming.searchParams.get("mode");
  const mode = requestedMode === "geocode" ? "geocode" : requestedMode === "around" ? "around" : "place";
  const lng = Number(incoming.searchParams.get("lng"));
  const lat = Number(incoming.searchParams.get("lat"));
  if (mode === "around" && (!Number.isFinite(lng) || !Number.isFinite(lat))) return Response.json({ error: "Missing map location" }, { status: 400 });
  if (mode !== "around" && !keyword) return Response.json({ error: "Missing search keyword" }, { status: 400 });

  const target = new URL(`${AMAP_REST_ENDPOINT}/${mode === "geocode" ? "geocode/geo" : mode === "around" ? "place/around" : "place/text"}`);
  target.searchParams.set("key", webServiceKey);
  if (mode === "geocode") target.searchParams.set("address", keyword!);
  if (mode === "place") target.searchParams.set("keywords", keyword!);
  if (mode === "around") {
    target.searchParams.set("location", `${lng},${lat}`);
    target.searchParams.set("radius", "500");
    target.searchParams.set("sortrule", "distance");
  }
  if (mode !== "around") target.searchParams.set("city", "全国");
  if (mode === "place" || mode === "around") {
    target.searchParams.set("citylimit", "false");
    target.searchParams.set("offset", mode === "around" ? "1" : "8");
    target.searchParams.set("page", "1");
    target.searchParams.set("extensions", "base");
  }

  const upstream = await fetch(target, { headers: { accept: "application/json" } });
  const data = await upstream.json() as any;
  if (!upstream.ok || data?.status !== "1") {
    return Response.json(
      { error: data?.info ?? "AMap search failed", code: data?.infocode ?? null },
      { status: 502 },
    );
  }

  const source = mode === "geocode" ? data.geocodes ?? [] : data.pois ?? [];
  const places = source.flatMap((place: any, index: number) => {
    const lnglat = normalizeLocation(place.location);
    if (!lnglat) return [];
    const formattedAddress = String(place.formatted_address ?? place.address ?? place.pname ?? keyword ?? "地图选点");
    return [{
      id: String(place.id ?? `${mode}-${index}-${lnglat.join("-")}`),
      name: String(place.name ?? (mode === "geocode" ? formattedAddress : keyword ?? "地图选点")),
      address: formattedAddress,
      district: String(place.district ?? place.adname ?? place.city ?? place.province ?? ""),
      type: String(place.type ?? place.level ?? "地点"),
      lnglat,
    }];
  });

  return Response.json(
    { places },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
