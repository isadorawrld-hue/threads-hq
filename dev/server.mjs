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
let heroFail = 0;
let heroEarly = false;
let heroComDown = false;
const heroHosts = [];
let soN = 0;
let spN = 0;
let sp = null;
let spEarly = false;
let so = null;
let heroLose = 0;
let heroLost = false;
const heroActives = [];
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
  if (u.hostname === "api.smspool.net") {
    const f = Object.fromEntries(new URLSearchParams(opts.body || ""));
    if (opts.headers?.Authorization !== "Bearer SP_TEST" || f.key !== "SP_TEST") return new Response(JSON.stringify({ success: 0, message: "Invalid API key" }), { status: 401 });
    if (u.pathname === "/request/price") return Response.json(f.country === "23" && f.service === "457" ? { price: "0.19", success_rate: 81 } : { success: 0, message: "This service is not available for this country." });
    if (u.pathname === "/request/balance") return Response.json({ balance: "4.20" });
    if (u.pathname === "/purchase/sms") {
      if (f.country !== "23" || f.service !== "457") return Response.json({ success: 0, message: "bad " + opts.body });
      spN++; sp = { id: "SPX" + spN, code: null, cancelled: false };
      return Response.json({ success: 1, number: String(745123455 + spN), cc: "33", order_id: sp.id, country: "France", service: "Instagram / Threads", pool: 7, expires_in: 1200, cost: "0.19" });
    }
    if (u.pathname === "/sms/check" && sp && f.orderid === sp.id) return Response.json(sp.code ? { status: 3, sms: sp.code, full_sms: "Your Instagram code is " + sp.code } : { status: 1, message: "pending", sms: null });
    if (u.pathname === "/sms/cancel" && sp && f.orderid === sp.id) { if (spEarly) { spEarly = false; return Response.json({ success: 0, message: "You can cancel after 2 minutes" }); } sp.cancelled = true; return Response.json({ success: 1 }); }
    return Response.json({ success: 0, message: "not found" });
  }
  if (u.hostname === "api-x.smsonline.cloud") {
    const key = u.searchParams.get("apiKey") || (opts.body ? JSON.parse(opts.body).apiKey : null);
    if (key !== "SO_TEST") return new Response(JSON.stringify({ ok: false, body: "Invalid API key" }), { status: 401 });
    let m;
    if ((m = u.pathname.match(/^\/v3\/numbers\/lookup\/U1\/(\d+)\/any$/))) return Response.json({ ok: true, body: { data: m[1] === "55" ? [] : [{ id: "tg", name: "Telegram", price: 0.3, quantity: 50, m: "x", n: "y" }, { id: "ig", name: "Instagram + Threads", price: 0.42, quantity: 120, deliverability: 61, m: "MM", n: "NN" }] } });
    if (u.pathname === "/v3/numbers/U1/order" && opts.method === "PUT") {
      const b = JSON.parse(opts.body);
      if (b.m !== "MM" || b.n !== "NN" || b.service !== "ig" || b.carrier !== "any") return new Response(JSON.stringify({ ok: false, body: "bad order " + opts.body }), { status: 400 });
      soN++; so = { id: "so" + soN, code: null, refunded: false };
      return Response.json({ ok: true, body: { orderId: so.id, phoneNumber: "+3361234567" + soN, expiredAtUTC: new Date(Date.now() + 20 * 60e3).toISOString(), purchasePrice: 0.42 } });
    }
    if ((m = u.pathname.match(/^\/v3\/numbers\/U1\/order\/(so\d+)$/)) && so && m[1] === so.id) return Response.json({ ok: true, body: [{ orderId: so.id, status: so.refunded ? "refunded" : "waitingForSMS", receivedSMS: so.code ? "Your Instagram code is " + so.code.slice(0, 3) + " " + so.code.slice(3) : "" }] });
    if ((m = u.pathname.match(/^\/v3\/numbers\/U1\/order\/(so\d+)\/refund$/)) && opts.method === "PATCH" && so && m[1] === so.id) { if (so.code) return new Response(JSON.stringify({ ok: false, body: "already received" }), { status: 400 }); so.refunded = true; return Response.json({ ok: true, body: "ok" }); }
    if (u.pathname === "/v3/customers/U1/balance") return Response.json({ ok: true, body: { userId: "U1", balance: 7.5 } });
    return new Response(JSON.stringify({ ok: false, body: "not found" }), { status: 404 });
  }
  if (u.hostname === "hero-sms.com" && heroComDown) { const e = new TypeError("fetch failed"); e.cause = { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND hero-sms.com" }; throw e; }
  if (u.hostname === "hero-sms.com" || u.hostname === "hero-sms.io") {
    heroHosts.push(u.hostname);
    if (heroFail > 0) { heroFail--; throw new TypeError("fetch failed"); }
    if (u.pathname.endsWith("/activations") && opts.method === "POST" && heroLose > 0) { heroLose--; heroLost = true; }
    if (u.pathname.endsWith("/handler_api.php")) return new Response(u.searchParams.get("api_key") === "HERO_TEST" ? "ACCESS_BALANCE:9.5" : "BAD_KEY", { status: 200 });
    if (opts.headers?.Authorization !== "ApiKey HERO_TEST") return new Response(JSON.stringify({ title: "Unauthenticated." }), { status: 401 });
    if (u.pathname.endsWith("/activations/offers/sms")) return Response.json({ data: { ig: { 78: { prices: { default: 0.12 }, counts: { total: 934 } }, 187: { prices: { default: 0.1 }, counts: { total: 500 } }, 14: { prices: { default: 0.035 }, counts: { total: 934 } }, 196: { prices: { default: 0.2102 }, counts: { total: 117 } }, 55: { prices: { default: 0.75 }, counts: { total: 0 } } } } });
    if (u.pathname.endsWith("/activations") && opts.method === "POST") {
      const b = JSON.parse(opts.body);
      if (b.country === 55) return new Response(JSON.stringify({ title: "NO_NUMBERS" }), { status: 404 });
      smsN++; smsAct = { id: String(7000 + smsN), phone: "8529" + String(1000000 + smsN), price: b.country === 14 ? 0.035 : 0.2102, expiredAt: new Date(Date.now() + 20 * 60e3).toISOString(), code: null, finished: false, cancelled: false };
      const item = { id: smsAct.id, status: "waitOtp", phone: smsAct.phone, service: b.service, country: b.country, countryPhoneCode: 852, price: smsAct.price, createdAt: new Date().toISOString(), expiredAt: smsAct.expiredAt };
      heroActives.unshift(item);
      if (heroLost) { heroLost = false; throw new TypeError("fetch failed"); }
      return Response.json({ data: [item] });
    }
    if (u.pathname.endsWith("/activations") && (opts.method || "GET") === "GET") {
      return Response.json({ data: heroActives.filter((x) => smsAct && x.id === smsAct.id && !smsAct.cancelled && !smsAct.finished) });
    }
    const m = u.pathname.match(/\/activations\/(\d+)(\/otp\/last|\/finish)?$/);
    if (m && smsAct && m[1] === smsAct.id) {
      if (m[2] === "/otp/last") return smsAct.code ? Response.json({ data: { id: "1", smsCode: smsAct.code, smsText: "Your Instagram code is " + smsAct.code, receivedAt: new Date().toISOString(), type: "sms" } }) : new Response(JSON.stringify({ title: "Waiting for the first sms or email" }), { status: 400 });
      if (m[2] === "/finish") { smsAct.finished = true; return new Response(null, { status: 204 }); }
      if (opts.method === "DELETE" && heroEarly) { heroEarly = false; return new Response(JSON.stringify({ title: "You can't cancel activation in first 2 minutes" }), { status: 400 }); }
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

const env = { store, fetch: fakeFetch, proxyFetch: fakeProxyFetch, rotateWaitMs: 3000, rotatePollMs: 200, heroRetryMs: 50, planBudgetMs: Number(process.env.PLAN_BUDGET_MS || 7000) };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webm": "video/webm", ".mp4": "video/mp4", ".png": "image/png" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/__dev/connect") {
      const b = brands.find((x) => String(x.id) === url.searchParams.get("blogId"));
      if (b) b.networksData = url.searchParams.get("username") ? { threads: { username: url.searchParams.get("username") } } : {};
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/__dev/ipage") {
      const ip = mem.get("lastip");
      if (ip) ip.at = new Date(Date.now() - Number(url.searchParams.get("min") || 0) * 60e3).toISOString();
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/__dev/sms") {
      if (smsAct) smsAct.code = url.searchParams.get("code") || "123456";
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/__tr") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ calls: trCalls })); }
    if (url.pathname === "/__tiny") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ deleted: tinyDeleted, left: oldTiny })); }
    if (url.pathname === "/__dev/heroflaky") {
      heroFail = Number(url.searchParams.get("fail") || 0);
      heroLose = Number(url.searchParams.get("lose") || 0);
      if (url.searchParams.has("early")) heroEarly = true;
      if (url.searchParams.has("comdown")) heroComDown = url.searchParams.get("comdown") === "1";
      heroHosts.length = 0;
      res.writeHead(200); return res.end("ok");
    }
    if (url.pathname === "/__heroN") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ n: smsN, hosts: heroHosts })); }
    if (url.pathname === "/__dev/sp") { if (url.searchParams.has("early")) spEarly = true; else if (sp) sp.code = url.searchParams.get("code") || "123456"; res.writeHead(200); return res.end("ok"); }
    if (url.pathname === "/__sp") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ n: spN, sp })); }
    if (url.pathname === "/__dev/so") { if (so) so.code = url.searchParams.get("code") || "123456"; res.writeHead(200); return res.end("ok"); }
    if (url.pathname === "/__so") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ n: soN, so })); }
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
