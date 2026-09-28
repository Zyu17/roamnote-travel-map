import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

async function sourceModule(path) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const route = await sourceModule("../lib/travel-route.ts");
const amap = await sourceModule("../lib/amap-route.ts");
for (const bad of [null, "", "180.1,30", "121,91", "121,", "NaN,31", "121,31,32"]) assert.equal(route.parseRouteCoordinate(bad), null);
assert.deepEqual(route.parseRouteCoordinate("121.12,31.2"), [121.12, 31.2]);
assert.equal(route.formatTravelDuration(1680), "28 分钟");
assert.equal(route.formatTravelDuration(3661), "1 小时 2 分钟");
assert.equal(route.formatTravelDuration(0), "少于 1 分钟");
for (const mode of ["walking", "driving", "transit"]) {
  const data = { status: "1", route: { [mode === "transit" ? "transits" : "paths"]: [{ distance: "1234", cost: { duration: "1680" } }] } };
  const result = amap.normalizeAmapRoute(data, mode);
  assert.equal(result.status, "ready"); assert.equal(result.duration, 1680); assert.equal(result.distance, 1234);
  assert.equal(amap.normalizeAmapRoute({ status: "1", route: {} }, mode).status, "unavailable");
  const url = new URL(route.routeNavigationUrl({ title: "起点 & A", lnglat: [121, 31] }, { title: "终点 B", lnglat: [116, 40] }, mode));
  assert.equal(url.searchParams.get("from"), "121,31,起点 & A");
  assert.equal(url.searchParams.get("to"), "116,40,终点 B");
  assert.equal(url.searchParams.get("mode"), { walking: "walk", driving: "car", transit: "bus" }[mode]);
}
assert.throws(() => amap.normalizeAmapRoute({ status: "0", infocode: "10001" }, "driving"));
assert.equal(amap.normalizeAmapRoute({ status: "1", route: { paths: [{ distance: "30", cost: {} }] } }, "driving").status, "unavailable");
assert.equal(amap.normalizeAmapRoute({ status: "1", route: { paths: [{ distance: "30", duration: "0" }] } }, "walking").duration, 0);
const calls = [];
const fetcher = async value => {
  const url = new URL(value); calls.push(url);
  assert.equal(url.searchParams.get("key"), "local-test-only");
  if (url.pathname.endsWith("regeo")) return Response.json({ status: "1", regeocode: { addressComponent: { citycode: url.searchParams.get("location").startsWith("121") ? "021" : "010" } } });
  return Response.json({ status: "1", route: { transits: [{ distance: "500000", cost: { duration: "22000" } }], paths: [{ distance: "2500", cost: { duration: "600" } }] } });
};
const signal = new AbortController().signal;
const transit = await amap.queryAmapRoute([121.123456789, 31], [116, 40], "transit", "local-test-only", signal, fetcher);
assert.equal(transit.duration, 22000);
const target = calls.at(-1);
assert.equal(target.pathname, "/v5/direction/transit/integrated");
assert.equal(target.searchParams.get("city1"), "021");
assert.equal(target.searchParams.get("city2"), "010");
assert.equal(target.searchParams.get("origin"), "121.123457,31");
assert.equal(target.searchParams.get("show_fields"), "cost");
const before = calls.length;
await amap.queryAmapRoute([121.123456789, 31], [116, 40], "transit", "local-test-only", signal, fetcher);
assert.equal(calls.length, before + 1, "City lookups should be cached");
await amap.queryAmapRoute([121, 31], [116, 40], "driving", "local-test-only", signal, fetcher);
assert.equal(calls.at(-1).pathname, "/v5/direction/driving");
assert.equal(calls.at(-1).searchParams.get("strategy"), "32");
await assert.rejects(amap.queryAmapRoute([121, 31], [116, 40], "walking", "local-test-only", signal, async () => new Response(null, { status: 503 })));
console.log("PASS: route parsing, missing/zero duration, API failures, all 3 navigation modes, cross-city public transport, coordinate precision and city caching. Fixtures only; no live AMap requests.");
