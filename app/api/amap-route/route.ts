import { getAccount, isSameOrigin, unauthorized } from "@/lib/auth";
import { isTravelMode, parseRouteCoordinate } from "@/lib/travel-route";
import { queryAmapRoute } from "@/lib/amap-route";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不正确" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const origin = parseRouteCoordinate(params.get("origin"));
  const destination = parseRouteCoordinate(params.get("destination"));
  const mode = params.get("mode");
  if (!origin || !destination || !isTravelMode(mode)) return Response.json({ error: "起终点坐标或交通方式不正确" }, { status: 400 });
  try {
    if (!await getAccount(request)) return unauthorized();
    const key = process.env.AMAP_WEB_SERVICE_KEY;
    if (!key) return Response.json({ error: "路线服务尚未配置" }, { status: 503 });
    const result = await queryAmapRoute(origin, destination, mode, key, AbortSignal.timeout(12_000));
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    const message = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "路线查询超时，请重试"
      : error instanceof Error && /^(高德路线服务|无法获取地点所属城市|该地点暂不支持公共交通)/.test(error.message) ? error.message : "路线服务暂不可用，请稍后重试";
    return Response.json({ error: message }, { status: 502 });
  }
}
