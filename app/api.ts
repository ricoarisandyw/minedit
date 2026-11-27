const KEY = "minedit-token";

// The CLI opens the page as /?t=<token>; keep it for this tab and hide it from the URL.
function token(): string {
  try {
    const t = new URL(location.href).searchParams.get("t");
    if (t) {
      sessionStorage.setItem(KEY, t);
      history.replaceState(null, "", location.pathname);
    }
    return sessionStorage.getItem(KEY) || "dev";
  } catch {
    return "dev";
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const post = body !== undefined;
  const res = await fetch(path, {
    method: post ? "POST" : "GET",
    headers: { "x-minedit-token": token(), ...(post && { "content-type": "application/json" }) },
    body: post ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export type World = { path: string; name: string; seed: string | null; dims: ("overworld" | "nether" | "end")[] };
export type WorldInfo = { world: World | null; home: string; saves: string | null };
