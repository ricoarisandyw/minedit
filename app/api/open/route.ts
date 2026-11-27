import { resolve } from "node:path";
import { fail, guard } from "@/lib/auth";
import { isWorld } from "@/lib/world/detect";
import { state } from "@/lib/world/state";
import { clearTileCache } from "@/lib/world/tile";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const { path } = await req.json();
    if (typeof path !== "string") throw new Error("Bad path");
    const dir = resolve(path);
    if (!isWorld(dir)) throw new Error("That folder is not a Minecraft world");
    state.world = dir;
    clearTileCache();
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
