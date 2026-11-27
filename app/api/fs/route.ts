import { fail, guard } from "@/lib/auth";
import { listDir } from "@/lib/world/fs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    return Response.json(listDir(new URL(req.url).searchParams.get("path") ?? undefined));
  } catch (e) {
    return fail(e);
  }
}
