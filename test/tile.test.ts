import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { deflateRawSync, deflateSync, gzipSync } from "node:zlib";
import nbt from "prismarine-nbt";
import { heightToColor, readHeightmapTile } from "../lib/world/heightmap";
import { getRegionTile, readPresenceTile } from "../lib/world/tile";
import { findXaeroWorldDir, readXaeroTile } from "../lib/world/xaero";
import { makeWorld } from "./helpers";

test("heightToColor maps elevations and hillshading correctly", () => {
  const ocean = heightToColor(40, 0, "overworld");
  const beach = heightToColor(63, 0, "overworld");
  const mountain = heightToColor(120, 0, "overworld");
  const netherLava = heightToColor(20, 0, "nether");
  const endVoid = heightToColor(20, 0, "end");

  expect(ocean).not.toBe(beach);
  expect(beach).not.toBe(mountain);
  expect(netherLava).not.toBe(ocean);
  expect(endVoid).not.toBe(ocean);

  // Slope shading test: slope > 0 should brighten, slope < 0 should darken
  const lit = heightToColor(70, 2, "overworld");
  const shadow = heightToColor(70, -2, "overworld");
  expect(lit).not.toBe(shadow);
});

test("presence tile fallback (Tier 3) works on existing chunks", () => {
  const w = makeWorld([[0, 0], [1, 1], [31, 31]]);
  const tile = readPresenceTile(w, "overworld", 0, 0);

  expect(tile.tier).toBe(3);
  expect(tile.width).toBe(32);
  expect(tile.height).toBe(32);
  expect(tile.pixels.length).toBe(1024);

  // [0, 0] exists -> non-zero color
  expect(tile.pixels[0]).not.toBe(0);
  // [1, 1] -> index is 1*32 + 1 = 33
  expect(tile.pixels[33]).not.toBe(0);
  // [0, 1] was not created -> 0
  expect(tile.pixels[32]).toBe(0);
});

test("heightmap tile (Tier 2) parses real NBT chunk Heightmaps", async () => {
  const w = makeWorld([[0, 0]]);
  const mcaFile = join(w, "region", "r.0.0.mca");

  // Create real NBT chunk with Heightmaps
  const heights = new Array(37).fill((128n << 9n) | 128n); // packed Y=64 (128 - 64)
  const chunkNbt = nbt.comp({
    Heightmaps: nbt.comp({
      WORLD_SURFACE: nbt.longArray(heights),
    }),
  }, "");
  const compressed = deflateSync(nbt.writeUncompressed(chunkNbt as any));

  // Write into sector 2 of r.0.0.mca
  const chunkLen = compressed.length + 1;
  const chunkHeader = Buffer.alloc(5);
  chunkHeader.writeUInt32BE(chunkLen, 0);
  chunkHeader.writeUInt8(2, 4); // 2 = zlib deflate

  const sectorBuf = Buffer.concat([chunkHeader, compressed]);
  const padded = Buffer.alloc(Math.ceil(sectorBuf.length / 4096) * 4096);
  sectorBuf.copy(padded);

  const fd = await Bun.file(mcaFile).arrayBuffer();
  const fileBuf = Buffer.from(fd);
  const updated = Buffer.concat([fileBuf.subarray(0, 8192), padded]);
  writeFileSync(mcaFile, updated);

  const tile = await readHeightmapTile(w, "overworld", 0, 0);
  expect(tile).not.toBeNull();
  expect(tile?.tier).toBe(2);
  expect(tile?.pixels[0]).not.toBe(0);
});

test("xaero tile (Tier 1) reads PWM cache when available", async () => {
  const w = makeWorld([[0, 0]]);
  const xaeroDim = join(w, "XaeroWorldMap", "mw$default");
  mkdirSync(xaeroDim, { recursive: true });

  // Create mock .pwm file (gzip compressed with version and colors)
  const rawData = Buffer.alloc(4100);
  rawData.writeUInt8(1, 0); // version
  for (let i = 0; i < 1024; i++) {
    rawData.writeUInt32BE(0x3a7d2800 + i, 1 + i * 4); // RGB color
  }
  const gzipped = gzipSync(rawData);
  writeFileSync(join(xaeroDim, "0_0.pwm"), gzipped);

  const xaeroDir = findXaeroWorldDir(w);
  expect(xaeroDir).not.toBeNull();

  const tile = await readXaeroTile(w, "overworld", 0, 0);
  expect(tile).not.toBeNull();
  expect(tile?.tier).toBe(1);
  expect(tile?.pixels[0]).not.toBe(0);
});

test("xaero tile (Tier 1) reads modern .xwmc cache when available", async () => {
  const w = makeWorld([[0, 0]]);
  const worldName = basename(w);
  const cacheDir = join(w, "xaero", "world-map", worldName, "null", "cache_1");
  mkdirSync(cacheDir, { recursive: true });

  // Build minimal uncompressed cache.xaero with 1 tile at (tx=2, tz=1) => packed = (2 << 4) | 1 = 0x21
  const headerBuf = Buffer.alloc(10);
  headerBuf[0] = (2 << 4) | 1; // X in high nibble, Z in low nibble
  headerBuf[1] = 0x00;
  Buffer.from([0x00, 0x00, 0x80, 0x58, 0x00, 0x00, 0x40, 0x00]).copy(headerBuf, 2);

  const tilePixels = Buffer.alloc(16384);
  for (let i = 0; i < 4096; i++) {
    tilePixels[i * 4 + 1] = 120; // R
    tilePixels[i * 4 + 2] = 180; // G
    tilePixels[i * 4 + 3] = 60; // B
  }

  const cacheXaero = Buffer.concat([headerBuf, tilePixels]);
  const deflated = deflateRawSync(cacheXaero);

  // Build standard ZIP containing cache.xaero
  const fileName = Buffer.from("cache.xaero");
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(deflated.length, 18);
  localHeader.writeUInt32LE(cacheXaero.length, 22);
  localHeader.writeUInt16LE(fileName.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const cdEntry = Buffer.alloc(46);
  cdEntry.writeUInt32LE(0x02014b50, 0);
  cdEntry.writeUInt16LE(20, 4);
  cdEntry.writeUInt16LE(20, 6);
  cdEntry.writeUInt16LE(0, 8);
  cdEntry.writeUInt16LE(8, 10);
  cdEntry.writeUInt32LE(deflated.length, 20);
  cdEntry.writeUInt32LE(cacheXaero.length, 24);
  cdEntry.writeUInt16LE(fileName.length, 28);
  cdEntry.writeUInt32LE(0, 42);

  const eocd = Buffer.alloc(22);
  const cdOffset = 30 + fileName.length + deflated.length;
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdEntry.length + fileName.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  const zipBuf = Buffer.concat([localHeader, fileName, deflated, cdEntry, fileName, eocd]);
  writeFileSync(join(cacheDir, "0_0.xwmc"), zipBuf);

  const tile = await readXaeroTile(w, "overworld", 0, 0);
  expect(tile).not.toBeNull();
  expect(tile?.tier).toBe(1);
  expect(tile?.width).toBe(512);
  expect(tile?.height).toBe(512);
  expect(tile?.png.length).toBeGreaterThan(100);
  // tx=2 -> cx=8..11, tz=1 -> cz=4..7 => index cz*32 + cx = 4*32 + 8 = 136
  expect(tile?.pixels[4 * 32 + 8]).not.toBe(0);
  // Transposed position (cz=8, cx=4) must be 0
  expect(tile?.pixels[8 * 32 + 4]).toBe(0);
});

test("getRegionTile cascades correctly: Tier 1 > Tier 2 > Tier 3", async () => {
  const w = makeWorld([[0, 0]]);
  // Without Xaero and without real Heightmaps, cascades to Tier 3
  const tile3 = await getRegionTile(w, "overworld", 0, 0);
  expect(tile3.tier).toBe(3);
});
