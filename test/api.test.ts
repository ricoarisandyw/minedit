import { expect, test } from "bun:test";
import { makeWorld } from "./helpers";

const world = makeWorld([[0, 0], [1, 1]]);
process.env.MINEDIT_TOKEN = "secret";
process.env.MINEDIT_WORLD = world;

const { GET } = await import("../app/api/world/route");
const { POST: del } = await import("../app/api/delete/route");
const { POST: open } = await import("../app/api/open/route");
const { GET: chunks } = await import("../app/api/chunks/route");

const url = "http://127.0.0.1/api/x";
const authed = { "x-minedit-token": "secret", "content-type": "application/json" };
const post = (headers: Record<string, string>, body: unknown) => new Request(url, { method: "POST", headers, body: JSON.stringify(body) });

test("every route refuses calls without the right token", async () => {
  expect((await GET(new Request(url))).status).toBe(401);
  expect((await GET(new Request(url, { headers: { "x-minedit-token": "wrong" } }))).status).toBe(401);
  expect((await chunks(new Request(url + "?dim=overworld"))).status).toBe(401);
  expect((await del(post({}, { dim: "overworld", chunks: [[0, 0]] }))).status).toBe(401);
  expect((await open(post({}, { path: world }))).status).toBe(401);
});

test("with the token the world loads and bad input is rejected", async () => {
  const res = await GET(new Request(url, { headers: authed }));
  expect(res.status).toBe(200);
  expect((await res.json()).world.name).toBe("Test World");
  expect((await chunks(new Request(url + "?dim=../etc", { headers: authed }))).status).toBe(400);
  expect((await del(post(authed, { dim: "overworld", chunks: [["a", 1]] }))).status).toBe(400);
  expect((await open(post(authed, { path: "/" }))).status).toBe(400);
});
