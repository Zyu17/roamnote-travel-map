export type TravelMode = "walking" | "driving" | "transit";
export const travelModes: Record<TravelMode, string> = { walking: "步行", driving: "驾车", transit: "公共交通" };
export type RoutePoint = { title: string; lnglat: [number, number] };
export type TravelRoute = { status: "ready"; distance: number; duration: number; fetchedAt: string } | { status: "unavailable"; message: string };
export function isTravelMode(value: unknown): value is TravelMode {
  return value === "walking" || value === "driving" || value === "transit";
}
export function parseRouteCoordinate(value: string | null): [number, number] | null {
  if (!value || !/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(value)) return null;
  const [lng, lat] = value.split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}
export function formatTravelDuration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 1) return "少于 1 分钟";
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ""}`;
}
export function formatTravelDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(1)} 公里`;
}
export function routeNavigationUrl(from: RoutePoint, to: RoutePoint, mode: TravelMode) {
  const url = new URL("https://uri.amap.com/navigation");
  url.search = new URLSearchParams({ from: `${from.lnglat.join(",")},${from.title}`, to: `${to.lnglat.join(",")},${to.title}`, mode: { walking: "walk", driving: "car", transit: "bus" }[mode], policy: "0", src: "roamnote", coordinate: "gaode", callnative: "1" }).toString();
  return url.toString();
}
