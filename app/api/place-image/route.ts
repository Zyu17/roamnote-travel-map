import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { placeImages, placeImageNames } from "@/db/schema";
import { normalizePlaceName, placeDistanceMeters, type PlaceImage } from "@/lib/place-images";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim() ?? "";
  const lng = Number(params.get("lng"));
  const lat = Number(params.get("lat"));
  if (!name || name.length > 120 || !params.get("lng")?.trim() || !params.get("lat")?.trim() ||
      !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return Response.json({ error: "地点名称和坐标不完整" }, { status: 400 });
  }
  try {
    const candidates = await getDb().select({ image: placeImages }).from(placeImageNames)
      .innerJoin(placeImages, eq(placeImages.id, placeImageNames.imageId))
      .where(and(eq(placeImageNames.name, normalizePlaceName(name)), eq(placeImages.approved, true)))
      .limit(50);
    const match = candidates.map(({ image }) => ({ image, distance: placeDistanceMeters([lng, lat], [image.longitude, image.latitude]) }))
      .filter(({ image, distance }) => distance <= image.matchRadius)
      .sort((a, b) => a.distance - b.distance || b.image.updatedAt.getTime() - a.image.updatedAt.getTime())[0]?.image;
    const image: PlaceImage | null = match ? {
      id: match.id, url: `/media/${encodeURIComponent(match.id)}?v=${match.contentHash.slice(0, 16)}`,
      alt: match.alt, width: match.width, height: match.height,
      focalX: match.focalX, focalY: match.focalY,
      author: match.author, sourcePageUrl: match.sourcePageUrl,
      license: match.license, licenseUrl: match.licenseUrl, changes: match.changes,
    } : null;
    return Response.json({ image }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return Response.json({ image: null, error: "图片图库暂时不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
