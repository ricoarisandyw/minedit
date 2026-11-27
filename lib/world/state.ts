// Lives on globalThis so route modules (and dev hot reload) share one copy.
type State = { world: string | null; token: string };
const g = globalThis as unknown as { __minedit?: State };

export const state = (g.__minedit ??= {
  world: process.env.MINEDIT_WORLD || null,
  // Dev server has no CLI to mint a token; the CLI always sets a random one.
  token: process.env.MINEDIT_TOKEN || (process.env.NODE_ENV === "development" ? "dev" : ""),
});
