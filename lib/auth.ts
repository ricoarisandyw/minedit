import { state } from "./world/state";

/** Every API call must carry the per-session token, or any web page could poke localhost. */
export function guard(req: Request): Response | null {
  if (!state.token || (state.token === "dev" && process.env.NODE_ENV === "development"))
    return null;
  if (req.headers.get("x-minedit-token") !== state.token)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export const fail = (e: unknown, status = 400) =>
  Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });

export function needWorld(): string {
  if (!state.world) throw new Error("No world is open");
  return state.world;
}
