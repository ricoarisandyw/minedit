import { fail } from "@/lib/auth";
import { isDim } from "@/lib/world/detect";
import { state } from "@/lib/world/state";
import { getRegionTile } from "@/lib/world/tile";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dim = url.searchParams.get("dim");
  const rxStr = url.searchParams.get("rx");
  const rzStr = url.searchParams.get("rz");

  if (!state.world) return fail("No world open", 400);
  if (!isDim(dim)) return fail("Bad dimension", 400);

  const rx = Number(rxStr);
  const rz = Number(rzStr);
  if (!Number.isInteger(rx) || !Number.isInteger(rz)) return fail("Bad rx/rz coordinates", 400);

  try {
    const tile = await getRegionTile(state.world, dim, rx, rz);

    if (url.searchParams.get("format") === "json") {
      return Response.json({
        tier: tile.tier,
        rx: tile.rx,
        rz: tile.rz,
        width: tile.width,
        height: tile.height,
        pixels: tile.pixels,
      });
    }

    return new Response(new Uint8Array(tile.png), {
      headers: {
        "Content-Type": "image/png",
        "X-Tile-Tier": String(tile.tier),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return fail(e, 500);
  }
}
