import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { dimDir, type Dim } from "./detect";
import { readHeightmapTile } from "./heightmap";
import { rgbaToPng } from "./png";
import { readXaeroTile } from "./xaero";

export type MapTile = {
  tier: 1 | 2 | 3;
  rx: number;
  rz: number;
  width: number;
  height: number;
  png: Buffer;
  pixels: number[];
};

const tileCache = new Map<string, MapTile>();

export function clearTileCache(world?: string) {
  if (!world) {
    tileCache.clear();
    return;
  }
  for (const k of tileCache.keys()) {
    if (k.startsWith(`${world}|`)) tileCache.delete(k);
  }
}

export function readPresenceTile(world: string, dim: Dim, rx: number, rz: number): MapTile {
  const dir = dimDir(world, dim);
  const pixels = new Array(1024).fill(0);
  const rgbaBuf = Buffer.alloc(32 * 32 * 4);

  if (!dir) {
    const png = rgbaToPng(32, 32, rgbaBuf);
    return { tier: 3, rx, rz, width: 32, height: 32, png, pixels };
  }

  const mcaPath = join(dir, "region", `r.${rx}.${rz}.mca`);
  if (!existsSync(mcaPath)) {
    const png = rgbaToPng(32, 32, rgbaBuf);
    return { tier: 3, rx, rz, width: 32, height: 32, png, pixels };
  }

  const fd = openSync(mcaPath, "r");
  try {
    const header = Buffer.alloc(4096);
    readSync(fd, header, 0, 4096, 0);
    for (let cz = 0; cz < 32; cz++) {
      for (let cx = 0; cx < 32; cx++) {
        const off = header.readUIntBE(((cx & 31) + (cz & 31) * 32) * 4, 3);
        if (off !== 0) {
          const globalCx = rx * 32 + cx;
          const globalCz = rz * 32 + cz;
          const isAlt = (globalCx + globalCz) & 1;
          const color = isAlt ? 0x4f8a33ff : 0x5a9a3bff;
          const idx = cz * 32 + cx;
          pixels[idx] = color;
          rgbaBuf[idx * 4 + 0] = (color >>> 24) & 0xff;
          rgbaBuf[idx * 4 + 1] = (color >>> 16) & 0xff;
          rgbaBuf[idx * 4 + 2] = (color >>> 8) & 0xff;
          rgbaBuf[idx * 4 + 3] = 0xff;
        }
      }
    }
  } finally {
    closeSync(fd);
  }

  const png = rgbaToPng(32, 32, rgbaBuf);
  return { tier: 3, rx, rz, width: 32, height: 32, png, pixels };
}

export async function getRegionTile(world: string, dim: Dim, rx: number, rz: number): Promise<MapTile> {
  const key = `${world}|${dim}|${rx}|${rz}`;
  const cached = tileCache.get(key);
  if (cached) return cached;

  // 1. Tier 1: Xaero World Map (.xwmc or .pwm)
  try {
    const xaero = await readXaeroTile(world, dim, rx, rz);
    if (xaero) {
      tileCache.set(key, xaero);
      return xaero;
    }
  } catch {}

  // 2. Tier 2: Heightmap Relief (Fallback A)
  try {
    const hm = await readHeightmapTile(world, dim, rx, rz);
    if (hm) {
      tileCache.set(key, hm);
      return hm;
    }
  } catch {}

  // 3. Tier 3: Chunk Presence (Fallback B)
  const presence = readPresenceTile(world, dim, rx, rz);
  tileCache.set(key, presence);
  return presence;
}
