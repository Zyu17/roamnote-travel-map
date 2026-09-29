import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".place-images");
const sources = JSON.parse(await readFile(path.join(root, "data/place-images.sources.json"), "utf8"));
const licenseUrls = new Map([
  ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
  ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
  ["CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"],
  ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
]);
await mkdir(path.join(output, "originals"), { recursive: true });
const manifest = [];
for (const source of sources) {
  if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(source.id) || !source.author || !source.filename ||
      licenseUrls.get(source.license) !== source.licenseUrl) throw new Error(`Invalid source metadata: ${source.id}`);
  const sourcePageUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(source.filename.replaceAll(" ", "_"))}`;
  const sourceImageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(source.filename)}`;
  const originalPath = path.join(output, "originals", `${source.id}.jpg`);
  let original;
  try { original = await readFile(originalPath); }
  catch {
    console.log(`Downloading ${source.placeName}`);
    // Approved sources only; no crawling arbitrary URLs or following page instructions.
    const response = await fetch(sourceImageUrl, {
      headers: { "User-Agent": "Roamnote/0.1 (https://github.com/Zyu17/roamnote-travel-map)" },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Download failed (${response.status}): ${source.id}`);
    original = Buffer.from(await response.arrayBuffer());
    if (original.length > 30_000_000) throw new Error(`Source exceeds 30 MB: ${source.id}`);
    await writeFile(originalPath, original);
  }
  const metadata = await sharp(original, { limitInputPixels: 60_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 1200) throw new Error(`Source resolution too small: ${source.id}`);
  // Retain the full composition; browser crops around the approved focal point.
  const { data, info } = await sharp(original).rotate().resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 85, effort: 5 }).toBuffer({ resolveWithObject: true });
  const hash = createHash("sha256").update(data).digest("hex");
  const objectKey = `places/${source.id}/${hash.slice(0, 16)}.webp`;
  const file = `.place-images/${source.id}.webp`;
  await writeFile(path.join(root, file), data);
  manifest.push({ ...source, sourcePageUrl, sourceImageUrl, objectKey, file,
    originalFile: `.place-images/originals/${source.id}.jpg`,
    contentHash: hash, contentType: "image/webp", width: info.width, height: info.height,
    changes: "已缩小尺寸、转换为 WebP，并按卡片比例显示局部画面；保留原许可。",
  });
  console.log(`Prepared ${source.placeName}: ${info.width}×${info.height}, ${Math.round(data.length / 1024)} KB`);
}
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${manifest.length} photos. Import with npm run images:import -- --local (or --remote).`);
