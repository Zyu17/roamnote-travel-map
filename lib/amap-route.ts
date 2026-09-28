import type { TravelMode, TravelRoute } from "./travel-route";
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function numeric(value: unknown) { return (typeof value === "number" || typeof value === "string" && value.trim()) ? Number(value) : NaN; }
export function normalizeAmapRoute(data: unknown, mode: TravelMode, now = new Date()): TravelRoute {
  const root = object(data);
  if (root.status !== "1") throw new Error("高德路线服务暂不可用，请检查路线接口权限与配额");
  const route = object(root.route);
  const options = mode === "transit" ? route.transits : route.paths;
  for (const value of Array.isArray(options) ? options : []) {
    const path = object(value);
    const distance = numeric(path.distance);
    const duration = numeric(object(path.cost).duration ?? path.duration);
    if (Number.isFinite(distance) && distance >= 0 && Number.isFinite(duration) && duration >= 0) return { status: "ready", distance, duration, fetchedAt: now.toISOString() };
  }
  return { status: "unavailable", message: "高德未返回可用路线；跨城行程可另行安排航班或火车" };
}
const cityCache = new Map<string, { value: string; expires: number }>();
export async function queryAmapRoute(origin: [number, number], destination: [number, number], mode: TravelMode, key: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<TravelRoute> {
  const coordinate = (point: [number, number]) => point.map(v => Number(v.toFixed(6))).join(",");
  async function upstream(url: URL) {
    url.searchParams.set("key", key);
    const response = await fetcher(url, { signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("高德路线服务暂不可用，请稍后重试");
    return response.json() as Promise<unknown>;
  }
  async function city(point: [number, number]) {
    const location = coordinate(point);
    const cached = cityCache.get(location);
    if (cached && cached.expires > Date.now()) return cached.value;
    const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
    url.searchParams.set("location", location);
    url.searchParams.set("extensions", "base");
    const data = object(await upstream(url));
    if (data.status !== "1") throw new Error("无法获取地点所属城市，请检查高德接口权限");
    const code = object(object(data.regeocode).addressComponent).citycode;
    if (typeof code !== "string" || !/^\d{2,4}$/.test(code)) throw new Error("该地点暂不支持公共交通查询");
    if (cityCache.size >= 256) cityCache.delete(cityCache.keys().next().value!);
    cityCache.set(location, { value: code, expires: Date.now() + 300_000 });
    return code;
  }
  const target = new URL(`https://restapi.amap.com/v5/direction/${mode === "transit" ? "transit/integrated" : mode}`);
  target.searchParams.set("origin", coordinate(origin));
  target.searchParams.set("destination", coordinate(destination));
  target.searchParams.set("show_fields", "cost");
  if (mode === "driving") target.searchParams.set("strategy", "32");
  if (mode === "transit") {
    const [city1, city2] = await Promise.all([city(origin), city(destination)]);
    target.searchParams.set("city1", city1); target.searchParams.set("city2", city2);
    target.searchParams.set("AlternativeRoute", "1");
  }
  return normalizeAmapRoute(await upstream(target), mode);
}
