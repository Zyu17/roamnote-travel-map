import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Miniflare } from "miniflare";
import { normalizePlaceName, placeDistanceMeters } from "../lib/place-image-matching.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
assert.equal(normalizePlaceName(" 上海博物馆（东馆） "), "上海博物馆东馆");
assert.notEqual(normalizePlaceName("上海博物馆东馆"), normalizePlaceName("上海博物馆"));
assert.equal(placeDistanceMeters([121, 31], [121, 31]), 0);
assert.ok(placeDistanceMeters([121, 31], [116, 40]) > 900000);
// Fresh ephemeral storage: never modifies local or production accounts, trips, or photos.
const server = path.join(root, "dist/server");
const files = (await readdir(server, { recursive: true })).filter(file => file.endsWith(".js") && file !== "index.js");
const mf = new Miniflare({
  modules: ["index.js", ...files].map(file => ({ type: "ESModule", path: path.join(server, file) })),
  modulesRoot: server,
  compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], r2Buckets: ["BUCKET"],
});
try {
  const db = await mf.getD1Database("DB");
  const migration = await readFile(path.join(root, "drizzle/0002_heavy_nightmare.sql"), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").filter(v => v.trim())) await db.prepare(statement).run();
  await db.prepare(`INSERT INTO place_images (id,place_name,city,longitude,latitude,match_radius,object_key,content_type,width,height,focal_x,focal_y,alt,source_page_url,source_image_url,author,license,license_url,changes,content_hash,approved,updated_at) VALUES ('test-photo','测试景点','上海',121.435,31.204,1500,'test/photo.webp','image/webp',1200,800,0.5,0.5,'test','https://example.com','https://example.com','test','CC0 1.0','https://creativecommons.org/publicdomain/zero/1.0/','test','0123456789abcdef',1,1000)`).run();
  await db.prepare("INSERT INTO place_image_names (name,image_id) VALUES ('测试景点','test-photo')").run();
  const bucket = await mf.getR2Bucket("BUCKET");
  await bucket.put("test/photo.webp", new Uint8Array([82,73,70,70]), { httpMetadata: { contentType: "image/webp" } });
  const get = (url, options) => mf.dispatchFetch(`https://test.invalid${url}`, options);
  const query = (name, lng = 121.435, lat = 31.204) => `/api/place-image?${new URLSearchParams({ name, lng: String(lng), lat: String(lat) })}`;
  const match = await get(query("测试景点"));
  assert.equal(match.status, 200);
  assert.equal((await match.json()).image.url, "/media/test-photo?v=0123456789abcdef");
  for (const url of [query("测试景点",116,40), query("测试景点东馆"), query("未知地点")]) assert.equal((await (await get(url)).json()).image, null);
  for (const url of ["/api/place-image?name=test", "/api/place-image?name=test&lng=&lat=", query("test",181,31)]) assert.equal((await get(url)).status,400);
  const media = await get("/media/test-photo");
  assert.equal(media.status,200);
  assert.equal(media.headers.get("content-type"),"image/webp");
  assert.equal((await media.arrayBuffer()).byteLength,4);
  const etag = media.headers.get("etag");
  assert.ok(etag);
  assert.equal((await get("/media/test-photo",{headers:{"If-None-Match":`W/${etag}`}})).status,304);
  const head = await get("/media/test-photo",{method:"HEAD"});
  assert.equal(head.status,200);
  assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await get("/media/unknown")).status,404);
  await db.prepare("UPDATE place_images SET approved=0 WHERE id='test-photo'").run();
  assert.equal((await get("/media/test-photo")).status,404);
  assert.equal((await (await get(query("测试景点"))).json()).image,null);
  console.log("Place image matching, isolation, validation, private R2 media, HEAD, ETag and withdrawal checks passed.");
} finally { await mf.dispose(); }
