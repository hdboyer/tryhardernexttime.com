import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const PHOTO_PATTERN = /^(\d{4}-\d{2}-\d{2})--([a-z0-9]+(?:-[a-z0-9]+)*)\.(?:jpe?g|png|webp)$/;

export function parsePhotoFilename(filename) {
  const match = PHOTO_PATTERN.exec(filename);
  if (!match) return null;
  const [, date, slug] = match;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return {
    id: `${date}--${slug}`,
    date,
    slug,
    caption: slug.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
  };
}

export function sortPosts(posts) {
  return [...posts].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
}

export function validateSiteConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("content/site.json must be an object");
  requireStrings(config, ["brand", "description"], "site");
  if (!config.profile || typeof config.profile !== "object") throw new TypeError("profile must be an object");
  requireStrings(config.profile, ["displayName", "handle", "bio", "initials", "fanCount", "effortScore"], "profile");
  if (config.profile.initials.length > 4) throw new TypeError("profile.initials must be four characters or fewer");
  if (!Array.isArray(config.ads) || config.ads.length === 0) throw new TypeError("ads must contain at least one fake ad");
  config.ads.forEach((ad, index) => requireStrings(ad, ["headline", "copy", "cta"], `ads[${index}]`));
  requireStrings(config.modalAd, ["headline", "copy", "cta"], "modalAd");
  return config;
}

function requireStrings(value, keys, label) {
  for (const key of keys) {
    if (typeof value?.[key] !== "string" || value[key].trim().length === 0) throw new TypeError(`${label}.${key} must be a non-empty string`);
  }
}

function orientedWidth(metadata) {
  return metadata.orientation >= 5 && metadata.orientation <= 8 ? metadata.height : metadata.width;
}

function outputWidths(sourceWidth) {
  if (!Number.isInteger(sourceWidth) || sourceWidth < 1) throw new TypeError("Image width could not be determined");
  return [...new Set([480, 960].map((width) => Math.min(width, sourceWidth)))].sort((a, b) => a - b);
}

async function processPhoto(inputPath, photo, outputDirectory) {
  const image = sharp(inputPath, { failOn: "warning" }).rotate();
  const metadata = await image.metadata();
  const widths = outputWidths(orientedWidth(metadata));
  const sources = { webp: [], jpeg: [] };
  let largest;

  for (const width of widths) {
    const webpName = `${photo.id}-${width}.webp`;
    const jpegName = `${photo.id}-${width}.jpg`;
    const webp = await image.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toFile(path.join(outputDirectory, webpName));
    const jpeg = await image.clone().resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outputDirectory, jpegName));
    sources.webp.push({ src: `/photos/${webpName}`, width: webp.width });
    sources.jpeg.push({ src: `/photos/${jpegName}`, width: jpeg.width });
    largest = jpeg;
  }

  return {
    ...photo,
    alt: photo.caption,
    width: largest.width,
    height: largest.height,
    sources,
  };
}

export async function buildSite(rootDirectory = path.resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  const root = path.resolve(rootDirectory);
  const dist = path.join(root, "dist");
  if (dist !== path.resolve(root, "dist")) throw new Error("Refusing to clean an unexpected output directory");

  const configPath = path.join(root, "content", "site.json");
  const photoDirectory = path.join(root, "content", "photos");
  const outputPhotos = path.join(dist, "photos");
  const outputContent = path.join(dist, "content");

  const config = validateSiteConfig(JSON.parse(await readFile(configPath, "utf8")));
  await rm(dist, { recursive: true, force: true });
  await mkdir(outputPhotos, { recursive: true });
  await mkdir(outputContent, { recursive: true });

  for (const file of ["index.html", "styles.css", "app.js", "state-utils.js", "site-state.json", "favicon.svg", "CNAME"]) {
    await cp(path.join(root, file), path.join(dist, file));
  }
  await writeFile(path.join(outputContent, "site.json"), `${JSON.stringify(config, null, 2)}\n`);

  const entries = await readdir(photoDirectory, { withFileTypes: true });
  const candidates = [];
  const invalid = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      invalid.push(`${entry.name} (unsupported image type)`);
      continue;
    }
    const parsed = parsePhotoFilename(entry.name);
    if (!parsed) invalid.push(`${entry.name} (expected YYYY-MM-DD--caption-slug.ext)`);
    else candidates.push({ ...parsed, filename: entry.name });
  }
  if (invalid.length) throw new Error(`Invalid photo uploads:\n- ${invalid.join("\n- ")}`);

  const posts = [];
  for (const photo of sortPosts(candidates)) {
    posts.push(await processPhoto(path.join(photoDirectory, photo.filename), photo, outputPhotos));
  }
  await writeFile(path.join(dist, "posts.json"), `${JSON.stringify(posts, null, 2)}\n`);
  await writeFile(path.join(dist, ".nojekyll"), "");

  return { postCount: posts.length, output: dist };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const result = await buildSite();
  console.log(`Built ${result.postCount} photo post${result.postCount === 1 ? "" : "s"} into ${result.output}`);
}
