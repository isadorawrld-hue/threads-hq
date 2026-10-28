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
let tinyTaken = null;
const tinyDom = {};
let oldTiny = Array.from({ length: 30 }, (_, i) => "vieux" + i);
const tinyDeleted = [];
let trCalls = 0;
const mcPosts = [];
const mcCalls = [];
let mcLinkFor = null;
const mcStatus = {};
let smsN = 0;
let smsAct = null;
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
  if (u.hostname === "api.tinyurl.com") {
    if (opts.headers?.Authorization !== "Bearer TINY_TEST") return new Response(JSON.stringify({ errors: ["Unauthenticated"] }), { status: 401 });
    if (u.pathname === "/create") {
      const b = JSON.parse(opts.body); tinyTaken = tinyTaken || new Set(["taipei_lily"]);
      if (tinyTaken.has(b.alias)) return new Response(JSON.stringify({ code: 5, errors: ["Alias is not available."] }), { status: 422 });
      tinyTaken.add(b.alias); tinyDom[b.alias] = b.domain; return Response.json({ code: 0, data: { tiny_url: `https://${b.domain}/${b.alias}`, alias: b.alias, domain: b.domain, url: b.url } });
    }
    if (u.pathname.startsWith("/urls/")) {
      const type = u.pathname.split("/")[2]; const page = Number(u.searchParams.get("page") || 1);
      const all = type === "available" ? [...oldTiny.map((a) => ({ domain: "chauna.live", alias: a })), ...Object.entries(tinyDom).map(([a, d]) => ({ domain: d, alias: a }))] : [{ domain: "chauna.live", alias: "vieuxarchive" }];
      const items = all.slice((page - 1) * 25, page * 25);
      return Response.json({ data: items.map((x) => ({ ...x, tiny_url: `https://${x.domain}/${x.alias}` })), meta: { pagination: { total_pages: Math.ceil(all.length / 25) } } });
    }
    if (u.pathname.startsWith("/alias/") && opts.method === "DELETE") {
      const [, , dom, al] = u.pathname.split("/");
      oldTiny = oldTiny.filter((a) => a !== decodeURIComponent(al)); tinyDeleted.push(decodeURIComponent(al));
      return Response.json({ data: { domain: dom, alias: al, deleted: true }, code: 0, errors: [] });
    }
    const from = u.searchParams.get("from"); const days = Math.round((Date.now() - new Date(from).getTime()) / 864e5);
    return Response.json({ data: [{ date: from, count: days >= 20 ? 42 : 9 }] });
  }
  if (u.hostname === "translate.googleapis.com") {
    trCalls++;
    const q = u.searchParams.get("q") || "";
    return Response.json([[["FR: " + q.slice(0, 40), q, null, null, 1]], null, "zh-TW"]);
  }
  if (u.hostname === "drive.google.com") {
    if (u.pathname === "/embeddedfolderview") {
      if (u.searchParams.get("id") !== "DOSSIERTEST123") return new Response("no", { status: 404 });
      return new Response(["2.jpg", "1.jpg", "notes.txt"].map((n, i) => `<div class="flip-entry" id="entry-FICHIER${i}ABCDEFGH"><div class="flip-entry-title">${n}</div></div>`).join(""), { headers: { "content-type": "text/html" } });
    }
    if (u.pathname === "/thumbnail") {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      return new Response(png, { headers: { "content-type": "image/png" } });
    }
  }
  if (u.hostname === "hero-sms.com") {
    if (u.pathname.endsWith("/handler_api.php")) return new Response(u.searchParams.get("api_key") === "HERO_TEST" ? "ACCESS_BALANCE:9.5" : "BAD_KEY", { status: 200 });
    if (opts.headers?.Authorization !== "ApiKey HERO_TEST") return new Response(JSON.stringify({ title: "Unauthenticated." }), { status: 401 });
    if (u.pathname.endsWith("/activations/offers/sms")) return Response.json({ data: { ig: { 78: { prices: { default: 0.12 }, counts: { total: 934 } }, 187: { prices: { default: 0.1 }, counts: { total: 500 } }, 14: { prices: { default: 0.035 }, counts: { total: 934 } }, 196: { prices: { default: 0.2102 }, counts: { total: 117 } }, 55: { prices: { default: 0.75 }, counts: { total: 0 } } } } });
    if (u.pathname.endsWith("/activations") && opts.method === "POST") {
      const b = JSON.parse(opts.body);
      if (b.country === 55) return new Response(JSON.stringify({ title: "NO_NUMBERS" }), { status: 404 });
      smsN++; smsAct = { id: String(7000 + smsN), phone: "8529" + String(1000000 + smsN), price: b.country === 14 ? 0.035 : 0.2102, expiredAt: new Date(Date.now() + 20 * 60e3).toISOString(), code: null, finished: false, cancelled: false };
      return Response.json({ data: [{ id: smsAct.id, status: "waitOtp", phone: smsAct.phone, service: b.service, country: b.country, countryPhoneCode: 852, price: smsAct.price, createdAt: new Date().toISOString(), expiredAt: smsAct.expiredAt }] });
    }
    const m = u.pathname.match(/\/activations\/(\d+)(\/otp\/last|\/finish)?$/);
    if (m && smsAct && m[1] === smsAct.id) {
      if (m[2] === "/otp/last") return smsAct.code ? Response.json({ data: { id: "1", smsCode: smsAct.code, smsText: "Your Instagram code is " + smsAct.code, receivedAt: new Date().toISOString(), type: "sms" } }) : new Response(JSON.stringify({ title: "Not found" }), { status: 404 });
      if (m[2] === "/finish") { smsAct.finished = true; return new Response(null, { status: 204 }); }
      if (opts.method === "DELETE") { if (smsAct.code) return new Response(JSON.stringify({ title: "UNPROCESSABLE" }), { status: 422 }); smsAct.cancelled = true; return new Response(null, { status: 204 }); }
    }
    return new Response(JSON.stringify({ title: "Not found" }), { status: 404 });
  }
  if (u.hostname === "app.metricool.com" || u.hostname === "mc.test") {
    if (opts.headers?.["X-Mc-Auth"] !== "TOKEN_TEST") return new Response(JSON.stringify({ error: "denied" }), { status: 401 });
    mcCalls.push({ method: opts.method || "GET", path: u.pathname, query: u.search, body: opts.body ? JSON.parse(opts.body) : null });
    if (u.pathname.endsWith("/v2/settings/brands") && opts.method === "POST") {
      const b = JSON.parse(opts.body); const nb = { id: 1000 + brands.length, label: b.brandLabel, networksData: {}, timezone: "Asia/Taipei" };
      brands.push(nb); return Response.json({ data: nb });
    }
    if (u.pathname.endsWith("/v2/settings/brands")) return Response.json({ data: brands });
    if (u.pathname.endsWith("/connections/anonymous-link")) {
      if (opts.method === "POST") { mcLinkFor = u.searchParams.get("blogId"); return Response.json({ data: { link: "https://f.mtr.cool/TEST" + mcLinkFor, expiresAt: { dateTime: "2099-01-01T00:00:00", timezone: "Europe/Paris" } } }); }
      return new Response(null, { status: 200 });
    }
    if (u.pathname.endsWith("/connections/threads") && opts.method === "DELETE") {
      const b = brands.find((x) => String(x.id) === u.searchParams.get("blogId")); if (b) b.networksData = {};
      return new Response(null, { status: 200 });
    }
    if (u.pathname.endsWith("/admin/update-label-blog")) { const b = brands.find((x) => String(x.id) === u.searchParams.get("blogId")); if (b) b.label = u.searchParams.get("newName"); return Response.json({}); }
    // simulation : la VA "connecte" Threads sur la marque via /__dev/connect?blogId=&username=
    if (u.pathname.endsWith("/actions/normalize/image/url")) return Response.json("https://static.metricool.test/" + encodeURIComponent(u.searchParams.get("url")));
    if (u.pathname.endsWith("/v2/scheduler/posts") && (opts.method || "GET") === "GET") {
      const bid = u.searchParams.get("blogId");
      return Response.json({ data: mcPosts.filter((p) => p.blogId === bid).map((p) => ({ id: p.id, publicationDate: p.publicationDate, text: p.text, providers: [{ network: "threads", status: mcStatus[p.id] || "PENDING", publicUrl: mcStatus[p.id] === "PUBLISHED" ? `https://www.threads.com/@x/post/${p.id}` : "", detailedStatus: mcStatus[p.id] === "ERROR" ? "Token Threads expiré" : "" }] })) });
    }
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
  // FAKE_IP=HK pour les videos d'aide : une IP de Hong Kong, comme en vrai
  if (process.env.FAKE_IP === "HK") return Response.json({ ip: `103.152.34.${ipN}`, country: "HK", city: "Hong Kong", org: "HKBN" });
  return Response.json({ ip: `82.64.12.${ipN}`, country: "FR", city: "Paris", org: "SFR" });
}

const env = { store, fetch: fakeFetch, proxyFetch: fakeProxyFetch, rotateWaitMs: 3000, rotatePollMs: 200, planBudgetMs: Number(process.env.PLAN_BUDGET_MS || 7000) };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webm": "video/webm", ".mp4": "video/mp4", ".png": "image/png" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/__dev/connect") {
      const b = brands.find((x) => String(x.id) === url.searchParams.get("blogId"));
      if (b) b.networksData = url.searchParams.get("username") ? { threads: { username: url.searchParams.get("username") } } : {};
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/__dev/sms") {
      if (smsAct) smsAct.code = url.searchParams.get("code") || "123456";
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/__tr") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ calls: trCalls })); }
    if (url.pathname === "/__tiny") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ deleted: tinyDeleted, left: oldTiny })); }
    if (url.pathname === "/__sms") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(smsAct)); }
    if (url.pathname === "/__dev/mcstatus") {
      mcStatus[url.searchParams.get("id")] = url.searchParams.get("s");
      res.writeHead(200); return res.end("ok");
    }
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
