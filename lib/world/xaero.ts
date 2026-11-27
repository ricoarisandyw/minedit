import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import type { Dim } from "./detect";
import { rgbaToPng } from "./png";
import type { MapTile } from "./tile";

const XAERO_TILE_SIG = Buffer.from([0x00, 0x00, 0x80, 0x58, 0x00, 0x00, 0x40, 0x00]);

export function unzipSingleFile(buf: Buffer): Buffer | null {
  try {
    // Search for End of Central Directory (EOCD) signature 0x06054b50 from end of file
    let cdOffset = -1;
    const startScan = Math.max(0, buf.length - 65535 - 22);
    for (let i = buf.length - 22; i >= startScan; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        cdOffset = buf.readUInt32LE(i + 16);
        break;
      }
    }

    if (cdOffset < 0 || cdOffset >= buf.length) {
      // Fallback: check if local header at 0 has compressed data
      if (buf.length > 30 && buf.readUInt32LE(0) === 0x04034b50) {
        const compMethod = buf.readUInt16LE(8);
        const compSize = buf.readUInt32LE(18);
        const nameLen = buf.readUInt16LE(26);
        const extraLen = buf.readUInt16LE(28);
        const dataStart = 30 + nameLen + extraLen;
        if (compSize > 0 && dataStart + compSize <= buf.length) {
          const raw = buf.subarray(dataStart, dataStart + compSize);
          return compMethod === 8 ? inflateRawSync(raw) : raw;
        }
      }
      return null;
    }

    // Read first Central Directory entry (signature 0x02014b50)
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) return null;
    const compMethod = buf.readUInt16LE(cdOffset + 10);
    const compSize = buf.readUInt32LE(cdOffset + 20);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);

    if (localHeaderOffset + 30 > buf.length) return null;
    if (buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null;

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

    if (dataStart + compSize > buf.length) return null;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    return compMethod === 8 ? inflateRawSync(raw) : raw;
  } catch {
    return null;
  }
}

export function findXaeroWorldDir(worldPath: string): string | null {
  const worldName = basename(worldPath);
  const candidates = [
    worldPath,
    dirname(worldPath),
    dirname(dirname(worldPath)),
    dirname(dirname(dirname(worldPath))),
    process.cwd(),
  ];

  const subdirs = ["xaero/world-map", "XaeroWorldMap", "xaero"];

  for (const root of candidates) {
    for (const sub of subdirs) {
      const mapRoot = join(root, sub);
      if (!existsSync(mapRoot)) continue;

      // Check if mapRoot itself directly contains dimension folders
      if (
        existsSync(join(mapRoot, "null")) ||
        existsSync(join(mapRoot, "mw$default")) ||
        existsSync(join(mapRoot, "DIM-1")) ||
        existsSync(join(mapRoot, "dim-1"))
      ) {
        return mapRoot;
      }

      const direct = [
        join(mapRoot, worldName),
        join(mapRoot, `Singleplayer_${worldName}`),
        join(mapRoot, worldName.replace(/ /g, "_")),
        join(mapRoot, worldName.replace(/ /g, "^")),
        join(mapRoot, worldName.toLowerCase()),
      ];

      for (const d of direct) {
        if (existsSync(d)) {
          if (
            existsSync(join(d, "null")) ||
            existsSync(join(d, "mw$default")) ||
            existsSync(join(d, "DIM-1")) ||
            existsSync(join(d, "dim-1")) ||
            existsSync(join(d, "DIM1")) ||
            existsSync(join(d, "dim1"))
          ) {
            return d;
          }
        }
      }

      // Check all folders inside mapRoot for case-insensitive / normalized match
      try {
        const entries = readdirSync(mapRoot, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          if (ent.name.toLowerCase() === worldName.toLowerCase()) {
            return join(mapRoot, ent.name);
          }
        }
      } catch {}
    }
  }
  return null;
}

export function getXaeroDimDir(xaeroWorldDir: string, dim: Dim): string | null {
  const rels: Record<Dim, string[]> = {
    overworld: ["null", "mw$default", "null/mw$default", ""],
    nether: ["DIM-1", "dim-1", "DIM-1/mw$default", "dim-1/mw$default"],
    end: ["DIM1", "dim1", "DIM1/mw$default", "dim1/mw$default"],
  };

  for (const rel of rels[dim]) {
    const p = rel ? join(xaeroWorldDir, rel) : xaeroWorldDir;
    if (existsSync(p)) return p;
  }
  return null;
}

export async function readXaeroTile(world: string, dim: Dim, rx: number, rz: number): Promise<MapTile | null> {
  const xaeroDir = findXaeroWorldDir(world);
  if (!xaeroDir) return null;
  const dDir = getXaeroDimDir(xaeroDir, dim);
  if (!dDir) return null;

  // Search candidate paths: modern .xwmc (cache_1 = Level 0 1:1 full-res regions) first, then legacy .pwm
  // Note: cache/1, cache/2, etc. are BranchLeveledRegion zoom-out caches (2x2+ regions per file), NOT 1:1.
  const candidates = [
    join(dDir, "cache_1", `${rx}_${rz}.xwmc`),
    join(dDir, "cache_1", `${rx}_${rz}.xwmc.outdated`),
    join(dDir, `${rx}_${rz}.xwmc`),
    join(dDir, `${rx}_${rz}.pwm`),
    join(dDir, `r_${rx}_${rz}.pwm`),
    join(dDir, `${rx},${rz}.pwm`),
    join(dDir, "mw$default", `${rx}_${rz}.pwm`),
  ];

  let filePath: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) {
      filePath = p;
      break;
    }
  }
  if (!filePath) return null;

  try {
    const fileBuf = readFileSync(filePath);

    // 1. Modern Xaero format (.xwmc = ZIP containing cache.xaero)
    if (filePath.endsWith(".xwmc") || filePath.endsWith(".xwmc.outdated")) {
      const inflated = unzipSingleFile(fileBuf);
      if (!inflated || inflated.length < 16) return null;

      const out = Buffer.alloc(512 * 512 * 4);
      let lastIdx = 0;
      let tileCount = 0;

      while (true) {
        const idx = inflated.indexOf(XAERO_TILE_SIG, lastIdx);
        if (idx === -1) break;
        if (idx >= 2 && idx + 8 + 16384 <= inflated.length) {
          const packed = inflated[idx - 2];
          // Xaero writes (x << 4) | z in LeveledRegion.saveCacheTextures
          const tx = (packed >> 4) & 0x0f;
          const tz = packed & 0x0f;

          if (tx < 8 && tz < 8) {
            const tileData = inflated.subarray(idx + 8, idx + 8 + 16384);
            for (let py = 0; py < 64; py++) {
              for (let px = 0; px < 64; px++) {
                const destX = tx * 64 + px;
                const destZ = tz * 64 + py;
                const destOffset = (destZ * 512 + destX) * 4;
                const srcOffset = (py * 64 + px) * 4;

                // OpenGL GL_UNSIGNED_INT_8_8_8_8_REV format:
                // byte 1 = Red, byte 2 = Green, byte 3 = Blue
                const r = tileData[srcOffset + 1];
                const g = tileData[srcOffset + 2];
                const b = tileData[srcOffset + 3];

                if (r !== 0 || g !== 0 || b !== 0) {
                  out[destOffset + 0] = r;
                  out[destOffset + 1] = g;
                  out[destOffset + 2] = b;
                  out[destOffset + 3] = 255;
                }
              }
            }
            tileCount++;
          }
        }
        lastIdx = idx + 8 + 16384;
      }

      if (tileCount === 0) return null;

      // Sample 32x32 chunk center pixels for legacy pixel array compatibility
      const pixels = new Array(1024).fill(0);
      for (let cz = 0; cz < 32; cz++) {
        for (let cx = 0; cx < 32; cx++) {
          const bx = cx * 16 + 8;
          const bz = cz * 16 + 8;
          const idx = (bz * 512 + bx) * 4;
          const r = out[idx];
          const g = out[idx + 1];
          const b = out[idx + 2];
          const a = out[idx + 3];
          pixels[cz * 32 + cx] = ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | a;
        }
      }

      const png = rgbaToPng(512, 512, out);
      return { tier: 1, rx, rz, width: 512, height: 512, png, pixels };
    }

    // 2. Legacy Xaero format (.pwm = GZIP compressed 32x32 integers)
    const buf = gunzipSync(fileBuf);
    if (buf.length < 16) return null;

    const pixels = new Array(1024).fill(0);
    const rgbaBuf = Buffer.alloc(32 * 32 * 4);
    let offset = 0;
    let version = buf.readUInt8(offset++);
    if (version === 255) {
      version = buf.readInt32BE(offset);
      offset += 4;
    }

    for (let i = 0; i < 1024; i++) {
      const pos = offset + i * 4;
      if (pos + 4 <= buf.length) {
        const c = buf.readUInt32BE(pos);
        if (c !== 0) {
          const color = (c << 8) | 0xff;
          pixels[i] = color;
          rgbaBuf[i * 4 + 0] = (c >>> 16) & 0xff;
          rgbaBuf[i * 4 + 1] = (c >>> 8) & 0xff;
          rgbaBuf[i * 4 + 2] = c & 0xff;
          rgbaBuf[i * 4 + 3] = 0xff;
        }
      }
    }

    const hasData = pixels.some((p) => p !== 0);
    if (!hasData) return null;

    const png = rgbaToPng(32, 32, rgbaBuf);
    return { tier: 1, rx, rz, width: 32, height: 32, png, pixels };
  } catch {
    return null;
  }
}
