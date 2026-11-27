import { fail, guard, needWorld } from "@/lib/auth";
import { parseSeed, writeSeed } from "@/lib/world/level";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const { seed } = await req.json();
    if (typeof seed !== "string" || seed.length > 200) throw new Error("Bad seed");
    const value = parseSeed(seed);
    const backup = await writeSeed(needWorld(), value);
    return Response.json({ seed: String(value), backup });
  } catch (e) {
    return fail(e);
  }
}
