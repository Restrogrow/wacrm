import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = path.resolve("public/logo-v2.png");
const OUTPUT = path.resolve("public/favicon.ico");
const SIZES = [16, 32, 48];

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const dataStart = 6 + count * 16;
  const header = Buffer.alloc(6);

  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  let offset = dataStart;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const { size, buffer } = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    entries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([
    header,
    ...entries,
    ...pngBuffers.map((p) => p.buffer),
  ]);
}

const pngBuffers = await Promise.all(
  SIZES.map(async (size) => ({
    size,
    buffer: await sharp(SOURCE).resize(size, size).png().toBuffer(),
  }))
);

await writeFile(OUTPUT, buildIco(pngBuffers));
console.log(`Wrote ${OUTPUT} (${SIZES.join("/")}px)`);
