// Builds the blog's WebP images from their SVG sources.
//
//   node scripts/build-blog-images.mjs
//
// For every public/blog/<slug>/<name>.svg it:
//   1. stamps "repeatgrow.com" in the bottom-right corner (once), so the
//      brand travels with the image when it shows up in Google Images or
//      gets shared;
//   2. writes <name>.webp next to it, with the SVG's <title> as the image
//      description and Repeat Grow as artist and copyright holder (EXIF).
// Pages and the sitemap use the .webp files; the .svg files are the source.
// Run it again after adding or editing a blog SVG, and commit both files.
import sharp from "sharp";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BLOG_DIR = path.resolve("public/blog");
const STAMP_ID = "rg-brand";
const YEAR = new Date().getFullYear();

function stamp(svg) {
  if (svg.includes(`id="${STAMP_ID}"`)) return svg;
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/) ?? [];
  if (!w) throw new Error("SVG has no viewBox");
  const mark =
    `  <text id="${STAMP_ID}" x="${w - 28}" y="${h - 24}" text-anchor="end" ` +
    `font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="600" ` +
    `fill="#ffffff" fill-opacity="0.6">repeatgrow.com</text>\n`;
  return svg.replace(/<\/svg>\s*$/, `${mark}</svg>\n`);
}

const unescape = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

let count = 0;
for (const slug of await readdir(BLOG_DIR)) {
  const dir = path.join(BLOG_DIR, slug);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }
  for (const file of files.filter((f) => f.endsWith(".svg"))) {
    const src = path.join(dir, file);
    const svg = stamp(await readFile(src, "utf8"));
    await writeFile(src, svg);

    const title = unescape(svg.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? slug);
    await sharp(Buffer.from(svg), { density: 96 })
      .resize({ width: 1200 })
      .webp({ quality: 86 })
      .withExif({
        IFD0: {
          ImageDescription: title,
          Artist: "Repeat Grow",
          Copyright: `(c) ${YEAR} Repeat Grow, repeatgrow.com`,
        },
      })
      .toFile(src.replace(/\.svg$/, ".webp"));
    count++;
  }
}
console.log(`Built ${count} blog images.`);
