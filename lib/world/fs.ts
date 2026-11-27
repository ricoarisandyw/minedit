import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isWorld } from "./detect";

export type Listing = { path: string; parent: string | null; isWorld: boolean; dirs: { name: string; isWorld: boolean }[] };

export function listDir(input?: string): Listing {
  const path = resolve(input || homedir());
  const dirs = readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, isWorld: isWorld(join(path, e.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parent = dirname(path);
  return { path, parent: parent === path ? null : parent, isWorld: isWorld(path), dirs };
}
