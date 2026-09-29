import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));
const sources = await load("place-images.sources.json");
const regions = await load("place-image-regions.json");
const routes = await load("popular-photo-routes.json");
const ids = new Set();
for (const source of sources) {
  assert.match(source.id, /^[a-z0-9][a-z0-9_-]{0,95}$/);
  assert.ok(!ids.has(source.id), `Duplicate image ID: ${source.id}`);
  ids.add(source.id);
  const region = regions[source.city];
  assert.ok(region?.province, `Unknown city: ${source.city}`);
  assert.match(region.provinceSlug, /^[a-z0-9-]+$/);
  assert.match(region.citySlug, /^[a-z0-9-]+$/);
  assert.ok(source.placeName && source.filename && source.author && source.licenseUrl);
  assert.ok(Array.isArray(source.names) && source.names.includes(source.placeName));
  assert.ok(Array.isArray(source.lnglat) && source.lnglat.length === 2 && source.lnglat.every(Number.isFinite));
}
const byId = new Map(sources.map(source => [source.id, source]));
for (const route of routes) {
  assert.ok(regions[route.city], `Unknown route city: ${route.city}`);
  assert.equal(new URL(route.sourceUrl).protocol, "https:");
  assert.ok(route.placeIds.length >= 2, `Route needs at least two covered places: ${route.id}`);
  for (const id of route.placeIds) assert.equal(byId.get(id)?.city, route.city, `Missing/wrong-city image in ${route.id}: ${id}`);
}
console.log(`Photo catalog: ${sources.length} licensed image candidates across ${Object.keys(regions).length} cities, ${routes.length} researched routes.`);
