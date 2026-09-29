import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = process.env.ROAMNOTE_URL ?? "https://roamnote-travel-map.lizeyu17.workers.dev";
const sources = JSON.parse(await readFile(new URL("../data/place-images.sources.json", import.meta.url), "utf8"));
async function request(path, options) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(20000) });
      if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
const query = (name, [lng, lat]) => `/api/place-image?${new URLSearchParams({ name, lng, lat })}`;
for (const source of sources) {
  const response = await request(query(source.placeName, source.lnglat));
  assert.equal(response.status, 200);
  const { image } = await response.json();
  assert.equal(image?.id, source.id);
  assert.equal(image.author, source.author);
  assert.equal(image.licenseUrl, source.licenseUrl);
  assert.equal(image.width, 1200);
  const media = await request(image.url);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/webp");
  assert.ok((await media.arrayBuffer()).byteLength > 1000);
  const head = await request(image.url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const cached = await request(image.url, { headers: { "If-None-Match": media.headers.get("etag") } });
  assert.equal(cached.status, 304);
  console.log(`${source.placeName}: correct index, licensed attribution, real WebP body, HEAD and ETag OK`);
}
for (const url of [query("武康大楼", [116.4, 39.9]), query("上海博物馆", [121.539,31.2202]), query("没有收录的地点", [121.435,31.204])]) assert.equal((await (await request(url)).json()).image, null);
assert.equal((await request("/media/nonexistent-photo")).status, 404);
console.log("Deployed destination photos and wrong-place safeguards passed. Read-only checks; no user data changed.");
