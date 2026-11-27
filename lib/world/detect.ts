import { existsSync } from "node:fs";
import { join } from "node:path";

export type Dim = "overworld" | "nether" | "end";

// Old layout first, then the newer dimensions/<namespace>/<name> layout.
const DIM_DIRS: Record<Dim, string[]> = {
  overworld: ["", "dimensions/minecraft/overworld"],
  nether: ["DIM-1", "dimensions/minecraft/the_nether"],
  end: ["DIM1", "dimensions/minecraft/the_end"],
};

export const DIMS = Object.keys(DIM_DIRS) as Dim[];
export const isDim = (v: unknown): v is Dim => typeof v === "string" && v in DIM_DIRS;

/** Folder that holds region/, entities/, poi/ for a dimension, or null. */
export function dimDir(world: string, dim: Dim): string | null {
  for (const rel of DIM_DIRS[dim]) {
    const dir = join(world, rel);
    if (existsSync(join(dir, "region"))) return dir;
  }
  return null;
}

export const dimensions = (world: string): Dim[] => DIMS.filter((d) => dimDir(world, d));

export const isWorld = (dir: string): boolean =>
  existsSync(join(dir, "level.dat")) && dimensions(dir).length > 0;
