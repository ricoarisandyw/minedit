import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import nbt from "prismarine-nbt";
import { backup } from "./backup";

// Where the seed lives, per game version. First match wins.
const SPOTS = [
  { file: "level.dat", path: ["Data", "WorldGenSettings", "seed"] }, // 1.16+
  { file: "level.dat", path: ["Data", "RandomSeed"] }, // < 1.16
  { file: "data/minecraft/world_gen_settings.dat", path: ["data", "seed"] }, // newest layout (unverified)
];

type Tag = { type: string; value: any };

const load = async (file: string) => (await nbt.parse(gunzipSync(readFileSync(file)))).parsed as unknown as Tag;

function walk(root: Tag, path: string[]): Tag | undefined {
  let cur: Tag | undefined = root;
  for (const key of path) cur = cur?.type === "compound" ? cur.value[key] : undefined;
  return cur?.type === "long" ? cur : undefined;
}

const toBig = ([hi, lo]: [number, number]) => (BigInt(hi) << 32n) | BigInt(lo >>> 0);
const fromBig = (n: bigint): [number, number] => [Number(BigInt.asIntN(32, n >> 32n)), Number(BigInt.asIntN(32, n))];

async function findSeed(world: string) {
  for (const spot of SPOTS) {
    const file = join(world, spot.file);
    if (!existsSync(file)) continue;
    const root = await load(file);
    const tag = walk(root, spot.path);
    if (tag) return { file, root, tag };
  }
  throw new Error("Seed not found in this world (unsupported game version?)");
}

export async function readSeed(world: string): Promise<bigint> {
  return toBig((await findSeed(world)).tag.value);
}

export async function readName(world: string): Promise<string | null> {
  const root = await load(join(world, "level.dat"));
  const name = root.value?.Data?.value?.LevelName;
  return name?.type === "string" ? name.value : null;
}

export async function writeSeed(world: string, seed: bigint): Promise<string> {
  const { file, root, tag } = await findSeed(world);
  const backupDir = backup(world, [file]);
  tag.value = fromBig(seed);
  const tmp = `${file}.minedit-tmp`;
  writeFileSync(tmp, gzipSync(nbt.writeUncompressed(root as any, "big")));
  renameSync(tmp, file);
  return backupDir;
}

const javaHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return BigInt(h);
};

/** Same rules as the game: empty = random, number that fits a long = itself, anything else = Java hashCode. */
export function parseSeed(input: string): bigint {
  const text = input.trim();
  if (!text) return BigInt.asIntN(64, randomBytes(8).readBigUInt64BE());
  if (/^-?\d+$/.test(text)) {
    const n = BigInt(text);
    if (n === BigInt.asIntN(64, n)) return n;
  }
  return javaHash(text);
}
