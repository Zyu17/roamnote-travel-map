import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizePlaceName } from "../lib/place-image-matching.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 1 || !["--local", "--remote"].includes(args[0])) throw new Error("Choose exactly --local or --remote.");
const mode = args[0];
const records = JSON.parse(await readFile(path.join(root, ".place-images/manifest.json"), "utf8"));
const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const command = (args) => {
  const result = spawnSync(process.execPath, [wrangler, ...args, "--config", "wrangler.jsonc"], { cwd: root, stdio: "inherit", timeout: 180000,
    env: { ...process.env, WRANGLER_LOG_PATH: path.join(root, ".wrangler/logs"), WRANGLER_SEND_METRICS: "false" } });
  if (result.error || result.status !== 0) throw new Error(`Wrangler ${args[0]} failed. ${result.error?.message ?? ""}`);
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = [];
for (const row of records) {
  if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(row.id) || !row.objectKey.startsWith(`places/${row.id}/`) ||
      !Array.isArray(row.names) || !row.names.length || row.contentType !== "image/webp" || !row.author || !row.licenseUrl) throw new Error("Invalid image manifest.");
  if (!row.lnglat.every(Number.isFinite) || Math.abs(row.lnglat[0]) > 180 || Math.abs(row.lnglat[1]) > 90 ||
      !Number.isFinite(row.matchRadius) || row.matchRadius < 1 || row.matchRadius > 30000 ||
      ![row.focalX, row.focalY].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error(`Invalid coordinates or focal point: ${row.id}`);
  const filePath = path.resolve(root, row.file);
  if (!filePath.startsWith(path.join(root, ".place-images") + path.sep)) throw new Error("Image file must be under .place-images.");
  const bytes = await readFile(filePath);
  if (createHash("sha256").update(bytes).digest("hex") !== row.contentHash) throw new Error(`Hash mismatch: ${row.id}`);
  if (!row.originalObjectKey?.startsWith(`originals/${row.id}/`) || !/^[a-f0-9]{64}$/.test(row.originalHash)) throw new Error(`Invalid original backup: ${row.id}`);
  const originalPath = path.resolve(root, row.originalFile);
  if (!originalPath.startsWith(path.join(root, ".place-images/originals") + path.sep)) throw new Error("Original file must be under .place-images/originals.");
  const original = await readFile(originalPath);
  if (createHash("sha256").update(original).digest("hex") !== row.originalHash) throw new Error(`Original hash mismatch: ${row.id}`);
  const keys = ["id", "place_name", "city", "longitude", "latitude", "match_radius", "object_key", "content_type", "width", "height", "focal_x", "focal_y", "alt", "source_page_url", "source_image_url", "author", "license", "license_url", "changes", "content_hash", "approved", "updated_at"];
  const values = [row.id, row.placeName, row.city, ...row.lnglat, row.matchRadius, row.objectKey, row.contentType, row.width, row.height, row.focalX, row.focalY, row.alt, row.sourcePageUrl, row.sourceImageUrl, row.author, row.license, row.licenseUrl, row.changes, row.contentHash, 1, Date.now()];
  sql.push(`INSERT INTO place_images (${keys.join(",")}) VALUES (${values.map(quote).join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys.slice(1).map((key) => `${key}=excluded.${key}`).join(",")};`);
  sql.push(`DELETE FROM place_image_names WHERE image_id=${quote(row.id)};`);
  for (const name of new Set([row.placeName, ...row.names].map(normalizePlaceName))) sql.push(`INSERT INTO place_image_names(image_id,name) VALUES(${quote(row.id)},${quote(name)});`);
}
// Validate the entire bundle before uploading. Upload photos before publishing index rows.
command(["d1", "migrations", "apply", "DB", mode]);
for (const row of records) {
  command(["r2", "object", "put", `roamnote-images/${row.originalObjectKey}`, "--file", path.resolve(root, row.originalFile), "--content-type", "image/jpeg", mode]);
  command(["r2", "object", "put", `roamnote-images/${row.objectKey}`, "--file", path.resolve(root, row.file), "--content-type", "image/webp", mode]);
}
const directory = await mkdtemp(path.join(tmpdir(), "roamnote-image-import-"));
const sqlPath = path.join(directory, "images.sql");
await writeFile(sqlPath, sql.join("\n"));
command(["d1", "execute", "DB", mode, "--file", sqlPath]);
console.log(`Imported ${records.length} photos and names into ${mode === "--remote" ? "production" : "local preview"}.`);
