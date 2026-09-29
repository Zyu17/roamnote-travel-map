import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".place-images");
const sources = JSON.parse(await readFile(path.join(root, "data/place-images.sources.json"), "utf8"));
const regions = JSON.parse(await readFile(path.join(root, "data/place-image-regions.json"), "utf8"));
const licenseUrls = new Map([
  ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
  ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
  ["CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"],
  ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
  ["CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"],
]);
async function downloadApprovedImage(url, id) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "Roamnote/0.1 (https://github.com/Zyu17/roamnote-travel-map)" },
        signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000 * (attempt + 1)));
      continue;
    }
    if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > 30_000_000) throw new Error(`Source exceeds 30 MB: ${id}`);
      const original = Buffer.from(await response.arrayBuffer());
      if (original.length > 30_000_000) throw new Error(`Source exceeds 30 MB: ${id}`);
      return original;
    }
    if (attempt === 3 || ![429, 502, 503, 504].includes(response.status)) throw new Error(`Download failed (${response.status}): ${id}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 60000)
      : 5000 * (attempt + 1);
    console.log(`Source temporarily unavailable (${response.status}): ${id}; retrying in ${Math.round(delay / 1000)}s`);
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error(`Download failed: ${id}`);
}
await mkdir(path.join(output, "originals"), { recursive: true });
const manifest = [];
for (const source of sources) {
  if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(source.id) || !source.author || !source.filename ||
      licenseUrls.get(source.license) !== source.licenseUrl) throw new Error(`Invalid source metadata: ${source.id}`);
  const region = regions[source.city];
  if (!region?.province || !/^[a-z0-9-]+$/.test(region.provinceSlug) ||
      !/^[a-z0-9-]+$/.test(region.citySlug)) throw new Error(`Unknown province/city: ${source.city}`);
  const sourcePageUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(source.filename.replaceAll(" ", "_"))}`;
  const sourceImageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(source.filename)}`;
  const sourceVersion = createHash("sha256").update(source.filename).digest("hex").slice(0, 12);
  const originalPath = path.join(output, "originals", `${source.id}-${sourceVersion}.jpg`);
  let original;
  try { original = await readFile(originalPath); }
  catch {
    console.log(`Downloading ${source.placeName}`);
    // Approved sources only; no crawling arbitrary URLs or following page instructions.
    // Pace requests to Commons even when all originals are missing in a fresh CI run.
    await new Promise(resolve => setTimeout(resolve, 1000));
    original = await downloadApprovedImage(sourceImageUrl, source.id);
    await writeFile(originalPath, original);
  }
  const metadata = await sharp(original, { limitInputPixels: 60_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 1200) throw new Error(`Source resolution too small: ${source.id}`);
  // Retain the full composition; browser crops around the approved focal point.
  const { data, info } = await sharp(original).rotate().resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 85, effort: 5 }).toBuffer({ resolveWithObject: true });
  const hash = createHash("sha256").update(data).digest("hex");
  const originalHash = createHash("sha256").update(original).digest("hex");
  const prefix = `provinces/${region.provinceSlug}/cities/${region.citySlug}/places/${source.id}`;
  const objectKey = `${prefix}/display-${hash.slice(0, 16)}.webp`;
  const originalObjectKey = `${prefix}/original-${originalHash.slice(0, 16)}.jpg`;
  const file = `.place-images/${source.id}.webp`;
  await writeFile(path.join(root, file), data);
  manifest.push({ ...source, ...region, sourcePageUrl, sourceImageUrl, objectKey, file,
    originalFile: path.relative(root, originalPath), originalObjectKey, originalHash,
    contentHash: hash, contentType: "image/webp", width: info.width, height: info.height,
    changes: "已缩小尺寸、转换为 WebP，并按卡片比例显示局部画面；保留原许可。",
  });
  console.log(`Prepared ${source.placeName}: ${info.width}×${info.height}, ${Math.round(data.length / 1024)} KB`);
}
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${manifest.length} photos. Import with npm run images:import -- --local (or --remote).`);
