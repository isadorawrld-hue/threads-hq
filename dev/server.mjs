// Serveur de test local : stockage en memoire + faux Metricool + faux proxy.
// node dev/server.mjs  ->  http://localhost:8788
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { handle } from "../lib/core.mjs";

const PORT = Number(process.env.PORT || 8788);
const ROOT = new URL("../public/", import.meta.url).pathname;
const mem = new Map();
const store = {
  get: async (k) => (mem.has(k) ? structuredClone(mem.get(k)) : null),
  set: async (k, v) => void mem.set(k, structuredClone(v)),
  getBinary: async (k) => mem.get(k) || null,
  setBinary: async (k, v) => void mem.set(k, v),
  delete: async (k) => void mem.delete(k),
  list: async (p) => [...mem.keys()].filter((k) => k.startsWith(p)).sort(),
};

// --- faux reseau
let ipN = 10;
const mcPosts = [];
const mcCalls = [];
const brands = [
  { id: 111, label: "compte A", networksData: { threads: { username: "acc_a" } }, timezone: "Asia/Taipei" },
  { id: 222, label: "compte B", networksData: { threads: { username: "acc_b" } }, timezone: "Asia/Taipei" },
  { id: 333, label: "vide", networksData: {}, timezone: "Asia/Taipei" },
];
async function fakeFetch(url, opts = {}) {
  const u = new URL(url);
  if (u.hostname === "rotate.test") {
    ipN++;
    return new Response("ok", { status: 200 });
  }
  if (u.hostname === "app.metricool.com" || u.hostname === "mc.test") {
    if (opts.headers?.["X-Mc-Auth"] !== "TOKEN_TEST") return new Response(JSON.stringify({ error: "denied" }), { status: 401 });
    mcCalls.push({ method: opts.method || "GET", path: u.pathname, query: u.search, body: opts.body ? JSON.parse(opts.body) : null });
    if (u.pathname.endsWith("/v2/settings/brands")) return Response.json({ data: brands });
    if (u.pathname.endsWith("/actions/normalize/image/url")) return Response.json("https://static.metricool.test/" + encodeURIComponent(u.searchParams.get("url")));
    if (u.pathname.endsWith("/v2/scheduler/posts") && opts.method === "POST") {
      const id = 9000 + mcPosts.length;
      mcPosts.push({ id, ...JSON.parse(opts.body), blogId: u.searchParams.get("blogId") });
      return Response.json({ data: { id } });
    }
    if (opts.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ data: [] });
  }
  return new Response("not found", { status: 404 });
}
async function fakeProxyFetch(url, proxy) {
  if (!proxy) return Response.json({ ip: "1.1.1.1", country: "TH", city: "Bangkok" });
  return Response.json({ ip: `82.64.12.${ipN}`, country: "FR", city: "Paris", org: "SFR" });
}

const env = { store, fetch: fakeFetch, proxyFetch: fakeProxyFetch, rotateWaitMs: 3000, rotatePollMs: 200 };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/__mc") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ posts: mcPosts, calls: mcCalls }));
    }
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: req.method === "GET" ? undefined : body }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    try {
      const data = await readFile(join(ROOT, file));
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end("404");
    }
  })
  .listen(PORT, () => console.log("CRM local sur http://localhost:" + PORT));
