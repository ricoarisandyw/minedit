import { closeSync, existsSync, openSync, readdirSync, readSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { backup } from "./backup";
import { dimDir, type Dim } from "./detect";
import { clearTileCache } from "./tile";

const NAME = /^r\.(-?\d+)\.(-?\d+)\.mca$/;
const HEADER = 4096; // location table; timestamps follow in the next 4096 bytes
const SUBDIRS = ["region", "entities", "poi"]; // same .mca format, all keyed by chunk

const MAX_COORD = 1 << 24;
const slot = (x: number, z: number) => ((x & 31) + (z & 31) * 32) * 4;

function readHeader(file: string): Buffer {
  const buf = Buffer.alloc(HEADER);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buf, 0, HEADER, 0); // short/corrupt files stay zero-filled = "no chunks"
  } finally {
    closeSync(fd);
  }
  return buf;
}

/** Flat [x0, z0, x1, z1, ...] of chunks that exist in region/. */
export function listChunks(world: string, dim: Dim): number[] {
  const dir = dimDir(world, dim);
  if (!dir) return [];
  const out: number[] = [];
  for (const name of readdirSync(join(dir, "region"))) {
    const m = NAME.exec(name);
    if (!m) continue;
    const header = readHeader(join(dir, "region", name));
    for (let i = 0; i < 1024; i++) {
      if (header.readUInt32BE(i * 4) !== 0) out.push(Number(m[1]) * 32 + (i % 32), Number(m[2]) * 32 + (i >> 5));
    }
  }
  return out;
}

export type Chunk = [number, number];

export function validChunks(v: unknown): v is Chunk[] {
  return (
    Array.isArray(v) &&
    v.length <= 500_000 &&
    v.every(
      (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        c.every((n) => Number.isInteger(n) && Math.abs(n) < MAX_COORD),
    )
  );
}

/** Zero the chunk's table entries (Minecraft then regenerates it). Backs up touched files first. */
export function deleteChunks(world: string, dim: Dim, chunks: Chunk[]): { deleted: number; backup: string | null } {
  const dir = dimDir(world, dim);
  if (!dir) throw new Error("Dimension not found");

  const byFile = new Map<string, Chunk[]>();
  for (const [x, z] of chunks) {
    const name = `r.${x >> 5}.${z >> 5}.mca`;
    byFile.set(name, [...(byFile.get(name) ?? []), [x, z]]);
  }

  const targets: string[] = [];
  for (const name of byFile.keys())
    for (const sub of SUBDIRS) {
      const full = join(dir, sub, name);
      if (existsSync(full)) targets.push(full);
    }
  if (!targets.length) return { deleted: 0, backup: null };

  const backupDir = backup(world, targets);

  let deleted = 0;
  const zero = Buffer.alloc(4);
  for (const full of targets) {
    const name = basename(full);
    const isRegion = dirname(full) === join(dir, "region");
    const fd = openSync(full, "r+");
    try {
      const probe = Buffer.alloc(4);
      for (const [x, z] of byFile.get(name)!) {
        if (isRegion && (readSync(fd, probe, 0, 4, slot(x, z)) < 4 || probe.readUInt32BE(0) === 0)) continue;
        writeSync(fd, zero, 0, 4, slot(x, z));
        writeSync(fd, zero, 0, 4, HEADER + slot(x, z));
        if (isRegion) deleted++;
      }
    } finally {
      closeSync(fd);
    }
  }
  clearTileCache(world);
  return { deleted, backup: backupDir };
}
