import { fail, guard, needWorld } from "@/lib/auth";
import { isDim } from "@/lib/world/detect";
import { listChunks } from "@/lib/world/region";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const dim = new URL(req.url).searchParams.get("dim");
    if (!isDim(dim)) throw new Error("Bad dimension");
    return Response.json({ chunks: listChunks(needWorld(), dim) });
  } catch (e) {
    return fail(e);
  }
}
