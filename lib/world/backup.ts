import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Copy files (absolute paths inside the world) to <world>/.minedit-backup/<time>/, keeping layout. */
export function backup(world: string, files: string[]): string {
  const dest = join(world, ".minedit-backup", new Date().toISOString().replace(/[:.]/g, "-"));
  for (const file of files) {
    const to = join(dest, relative(world, file));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(file, to);
  }
  return dest;
}
