import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dimensions, isWorld } from "../lib/world/detect";
import { parseSeed, readName, readSeed, writeSeed } from "../lib/world/level";
import { deleteChunks, listChunks, validChunks } from "../lib/world/region";
import { makeWorld } from "./helpers";

const pairs = (flat: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push(`${flat[i]},${flat[i + 1]}`);
  return out.sort();
};

test("lists chunks incl. negative coordinates and other regions", () => {
  const w = makeWorld([[0, 0], [31, 31], [-1, -1], [-33, 40], [100, -5]]);
  expect(pairs(listChunks(w, "overworld"))).toEqual(["-1,-1", "-33,40", "0,0", "100,-5", "31,31"].sort());
});

test("detects worlds and dimensions", () => {
  const w = makeWorld([[0, 0]], [[1, 1]]);
  expect(isWorld(w)).toBe(true);
  expect(dimensions(w)).toEqual(["overworld", "nether"]);
  expect(isWorld(mkdtempSync(join(tmpdir(), "minedit-empty-")))).toBe(false);
});

test("delete zeroes only the chosen chunks, in region/entities/poi, and backs up", () => {
  const w = makeWorld([[0, 0], [1, 0], [2, 0]]);
  const file = join(w, "region", "r.0.0.mca");
  const sizeBefore = statSync(file).size;
  const original = readFileSync(file);

  const res = deleteChunks(w, "overworld", [[1, 0], [50, 50]]); // 50,50 does not exist
  expect(res.deleted).toBe(1);
  expect(pairs(listChunks(w, "overworld"))).toEqual(["0,0", "2,0"]);
  for (const sub of ["entities", "poi"]) {
    const buf = readFileSync(join(w, sub, "r.0.0.mca"));
    expect(buf.readUInt32BE(4)).toBe(0);
    expect(buf.readUInt32BE(4096 + 4)).toBe(0);
    expect(buf.readUInt32BE(0)).not.toBe(0);
  }
  expect(statSync(file).size).toBe(sizeBefore);
  expect(statSync(file).size % 4096).toBe(0);
  expect(res.backup && readFileSync(join(res.backup, "region", "r.0.0.mca")).equals(original)).toBe(true);
});

test("delete with nothing to touch makes no backup", () => {
  const w = makeWorld([[0, 0]]);
  expect(deleteChunks(w, "overworld", [[500, 500]])).toEqual({ deleted: 0, backup: null });
  expect(existsSync(join(w, ".minedit-backup"))).toBe(false);
});

test("seed round-trips, incl. negative and huge values, and keeps the rest of level.dat", async () => {
  const w = makeWorld([[0, 0]]);
  expect(await readSeed(w)).toBe((0x01234567n << 32n) | 0x089abcden);
  for (const s of [-1n, 12345n, -9223372036854775808n, 9223372036854775807n, 0n]) {
    await writeSeed(w, s);
    expect(await readSeed(w)).toBe(s);
  }
  expect(await readName(w)).toBe("Test World");
  expect(readdirSync(join(w, ".minedit-backup")).length).toBeGreaterThan(0);
});

test("parseSeed follows game rules", () => {
  expect(parseSeed("12345")).toBe(12345n);
  expect(parseSeed("-7")).toBe(-7n);
  expect(parseSeed("hello")).toBe(99162322n); // Java "hello".hashCode()
  expect(parseSeed("99999999999999999999")).toBe(parseSeed("99999999999999999999")); // too big → hash, no throw
  expect(typeof parseSeed("")).toBe("bigint");
});

test("validChunks rejects junk", () => {
  expect(validChunks([[1, 2]])).toBe(true);
  expect(validChunks([[1.5, 2]])).toBe(false);
  expect(validChunks([["1", 2]])).toBe(false);
  expect(validChunks([[1e12, 0]])).toBe(false);
  expect(validChunks("x")).toBe(false);
});
