import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fail, guard } from "@/lib/auth";
import { dimensions } from "@/lib/world/detect";
import { readName, readSeed } from "@/lib/world/level";
import { state } from "@/lib/world/state";

export const dynamic = "force-dynamic";

// Where the vanilla launcher keeps worlds, so the folder picker can start there.
const home = homedir();
const SAVES = [
  join(home, "Library/Application Support/minecraft/saves"),
  join(home, ".minecraft/saves"),
  ...(process.env.APPDATA ? [join(process.env.APPDATA, ".minecraft/saves")] : []),
];
const saves = () => SAVES.find((p) => existsSync(p)) ?? null;

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const path = state.world;
  if (!path) return Response.json({ world: null, home, saves: saves() });
  try {
    const [name, seed] = await Promise.all([readName(path), readSeed(path).catch(() => null)]);
    return Response.json({
      home,
      saves: saves(),
      world: { path, name: name ?? basename(path), seed: seed === null ? null : String(seed), dims: dimensions(path) },
    });
  } catch (e) {
    return fail(e, 500);
  }
}
