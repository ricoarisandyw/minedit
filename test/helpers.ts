import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import nbt from "prismarine-nbt";

/** Fake .mca: header says which chunks exist, each gets one 4 KB sector of filler. */
export function fakeRegion(file: string, chunks: [number, number][]) {
  const buf = Buffer.alloc(8192 + chunks.length * 4096, 0xab);
  buf.fill(0, 0, 8192);
  chunks.forEach(([x, z], n) => {
    const i = ((x & 31) + (z & 31) * 32) * 4;
    buf.writeUIntBE(2 + n, i, 3);
    buf[i + 3] = 1;
    buf.writeUInt32BE(1_700_000_000, 4096 + i);
  });
  writeFileSync(file, buf);
}

export function fakeLevel(file: string, seed: [number, number], name = "Test World") {
  const root = nbt.comp(
    {
      Data: nbt.comp({
        LevelName: nbt.string(name),
        WorldGenSettings: nbt.comp({ seed: nbt.long(seed), generate_features: nbt.byte(1) }),
      }),
    },
    "",
  );
  writeFileSync(file, gzipSync(nbt.writeUncompressed(root as any, "big")));
}

/** Overworld with chunks, plus a matching entities/ folder. Nether optional. */
export function makeWorld(chunks: [number, number][], nether: [number, number][] = []) {
  const dir = mkdtempSync(join(tmpdir(), "minedit-"));
  fakeLevel(join(dir, "level.dat"), [0x01234567, 0x089abcde]);
  const put = (base: string, sub: string, list: [number, number][]) => {
    mkdirSync(join(dir, base, sub), { recursive: true });
    const byRegion = new Map<string, [number, number][]>();
    for (const c of list) byRegion.set(`r.${c[0] >> 5}.${c[1] >> 5}.mca`, [...(byRegion.get(`r.${c[0] >> 5}.${c[1] >> 5}.mca`) ?? []), c]);
    for (const [name, cs] of byRegion) fakeRegion(join(dir, base, sub, name), cs);
  };
  put("", "region", chunks);
  put("", "entities", chunks);
  put("", "poi", chunks);
  if (nether.length) put("DIM-1", "region", nether);
  return dir;
}
