import { fail, guard, needWorld } from "@/lib/auth";
import { isDim } from "@/lib/world/detect";
import { deleteChunks, validChunks } from "@/lib/world/region";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const { dim, chunks } = await req.json();
    if (!isDim(dim)) throw new Error("Bad dimension");
    if (!validChunks(chunks)) throw new Error("Bad chunk list");
    return Response.json(deleteChunks(needWorld(), dim, chunks));
  } catch (e) {
    return fail(e);
  }
}
