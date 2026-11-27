import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, inflateSync } from "node:zlib";
import nbt from "prismarine-nbt";
import { dimDir, type Dim } from "./detect";
import { rgbaToPng } from "./png";
import type { MapTile } from "./tile";

const HEADER = 4096;
const slot = (cx: number, cz: number) => ((cx & 31) + (cz & 31) * 32) * 4;

function unpackChunkHeight(sim: any): number | null {
  const hm = sim?.Heightmaps ?? sim?.Level?.Heightmaps;
  const raw = hm?.WORLD_SURFACE ?? hm?.MOTION_BLOCKING ?? hm?.OCEAN_FLOOR;
  if (Array.isArray(raw) && raw.length > 0) {
    const b = raw.length <= 37 ? 9 : Math.ceil((raw.length * 64) / 256);
    const valuesPerLong = Math.floor(64 / b);
    const mask = (1n << BigInt(b)) - 1n;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < 256; i += 16) {
      const lIdx = Math.floor(i / valuesPerLong);
      const vIdx = i % valuesPerLong;
      if (lIdx < raw.length) {
        const val = Number((BigInt(raw[lIdx]) >> BigInt(vIdx * b)) & mask);
        const y = b >= 9 ? val - 64 : val;
        sum += y;
        count++;
      }
    }
    return count > 0 ? Math.round(sum / count) : 64;
  }
  const oldHm = sim?.Level?.HeightMap;
  if (Array.isArray(oldHm) && oldHm.length === 256) {
    let sum = 0;
    for (let i = 0; i < 256; i += 16) sum += Number(oldHm[i]);
    return Math.round(sum / 16);
  }
  return null;
}

export function heightToColor(y: number, slope: number, dim: Dim): number {
  let r = 85, g = 145, b = 50;

  if (dim === "nether") {
    if (y < 32) {
      r = 220; g = 85; b = 25;
    } else {
      r = 115; g = 35; b = 35;
    }
  } else if (dim === "end") {
    if (y < 45) {
      r = 20; g = 15; b = 30;
    } else {
      r = 215; g = 215; b = 155;
    }
  } else {
    if (y < 55) {
      r = 25; g = 60; b = 125;
    } else if (y < 63) {
      r = 45; g = 90; b = 165;
    } else if (y <= 64) {
      r = 210; g = 195; b = 140;
    } else if (y < 85) {
      r = 85; g = 145; b = 50;
    } else if (y < 115) {
      r = 55; g = 110; b = 35;
    } else if (y < 145) {
      r = 115; g = 115; b = 110;
    } else {
      r = 225; g = 235; b = 245;
    }
  }

  if (slope !== 0) {
    const factor = Math.max(-0.4, Math.min(0.4, slope * 0.06));
    if (factor > 0) {
      r = Math.min(255, Math.round(r + (255 - r) * factor));
      g = Math.min(255, Math.round(g + (255 - g) * factor));
      b = Math.min(255, Math.round(b + (255 - b) * factor));
    } else {
      const mult = 1 + factor;
      r = Math.max(0, Math.round(r * mult));
      g = Math.max(0, Math.round(g * mult));
      b = Math.max(0, Math.round(b * mult));
    }
  }

  return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | 0xff;
}

export async function readHeightmapTile(world: string, dim: Dim, rx: number, rz: number): Promise<MapTile | null> {
  const dir = dimDir(world, dim);
  if (!dir) return null;
  const mcaPath = join(dir, "region", `r.${rx}.${rz}.mca`);
  if (!existsSync(mcaPath)) return null;

  const fd = openSync(mcaPath, "r");
  const heights = Array.from({ length: 32 }, () => new Array<number | null>(32).fill(null));
  let validChunkCount = 0;
  let parsedHeightmapCount = 0;

  try {
    const header = Buffer.alloc(HEADER);
    readSync(fd, header, 0, HEADER, 0);

    for (let cz = 0; cz < 32; cz++) {
      for (let cx = 0; cx < 32; cx++) {
        const off = header.readUIntBE(slot(cx, cz), 3) * 4096;
        if (off === 0) continue;
        validChunkCount++;

        const meta = Buffer.alloc(5);
        if (readSync(fd, meta, 0, 5, off) < 5) continue;
        const len = meta.readUInt32BE(0);
        const comp = meta.readUInt8(4);
        if (len <= 1 || len > 10 * 1024 * 1024) continue;

        const compBuf = Buffer.alloc(len - 1);
        if (readSync(fd, compBuf, 0, len - 1, off + 5) < len - 1) continue;

        let nbtBuf: Buffer;
        try {
          if (comp === 2) nbtBuf = inflateSync(compBuf);
          else if (comp === 1) nbtBuf = gunzipSync(compBuf);
          else if (comp === 3) nbtBuf = compBuf;
          else continue;

          const { parsed } = await nbt.parse(nbtBuf);
          const sim = nbt.simplify(parsed);
          const h = unpackChunkHeight(sim);
          if (h !== null) {
            heights[cx][cz] = h;
            parsedHeightmapCount++;
          } else {
            heights[cx][cz] = 64;
          }
        } catch {
          heights[cx][cz] = 64;
        }
      }
    }
  } finally {
    closeSync(fd);
  }

  if (validChunkCount === 0 || parsedHeightmapCount === 0) return null;

  const pixels = new Array(1024).fill(0);
  const rgbaBuf = Buffer.alloc(32 * 32 * 4);

  for (let cz = 0; cz < 32; cz++) {
    for (let cx = 0; cx < 32; cx++) {
      const h = heights[cx][cz];
      if (h === null) continue;

      const north = cz > 0 ? (heights[cx][cz - 1] ?? h) : h;
      const west = cx > 0 ? (heights[cx - 1][cz] ?? h) : h;
      const slope = (h - north) + (h - west);

      const color = heightToColor(h, slope, dim);
      const idx = cz * 32 + cx;
      pixels[idx] = color;
      rgbaBuf[idx * 4 + 0] = (color >>> 24) & 0xff;
      rgbaBuf[idx * 4 + 1] = (color >>> 16) & 0xff;
      rgbaBuf[idx * 4 + 2] = (color >>> 8) & 0xff;
      rgbaBuf[idx * 4 + 3] = 0xff;
    }
  }

  const png = rgbaToPng(32, 32, rgbaBuf);
  return { tier: 2, rx, rz, width: 32, height: 32, png, pixels };
}
