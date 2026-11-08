// Branchements public-apis du 8 nov. : qualite d'IP (ip-api), scan anti-nudite (NSFWJS), taux du dollar (currency-api / BCE).
// A lancer apres dev/test-api.mjs et dev/test-compta.mjs, sur le meme serveur local.
import assert from "node:assert/strict";
import { ipVerdict, nsfwVerdict, nsfwClean, mediaUsable, pickMedia } from "../lib/core.mjs";
const B = process.env.BASE || "http://localhost:8788";
async function call(path, body, t) {
  const r = await fetch(B + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}
const LOGINS = { awen: ["Awen", "lune-rouge-4321"], va: ["VA", "nuage-vert-1111"] };
const login = async (k) => (await call("login", { name: LOGINS[k][0], password: LOGINS[k][1] })).j.token;
const awen = await login("awen");
const va = await login("va");
const dev = (p) => fetch(B + p);

// ---------------------------------------------------------------- qualite d'IP
assert.equal(ipVerdict({ status: "fail" }), null, "ip-api en erreur : pas de verdict, rien de bloqué");
assert.equal(ipVerdict({ status: "success", hosting: true }).v, "grillee");
assert.equal(ipVerdict({ status: "success", proxy: true }).v, "suspecte");
assert.equal(ipVerdict({ status: "success", hosting: true, proxy: true, mobile: true }).v, "ok", "une IP mobile n'est jamais grillée");
assert.equal(ipVerdict({ status: "success", isp: "SFR" }).why, "IP résidentielle");
console.log("✓ verdict IP : datacenter grillée, proxy suspect, mobile toujours ok");

assert.equal((await call("settings", { ipProfile: "fr" }, awen)).s, 200);
await dev("/__dev/ipq?v=hosting&n=1");
let r = await call("rotate", {}, va);
assert.equal(r.s, 200);
assert.equal(r.j.q.v, "grillee");
assert.equal(r.j.bad, "IP de datacenter");
assert.equal(r.j.retryOk, true, "proxy France : on peut rechanger tout de suite");
r = await call("accounts/create", { pseudo: "dc_test", email: "x@y.z", password: "pw" }, va);
assert.equal(r.s, 400);
assert.match(r.j.error, /datacenter/, "compte refusé sur une IP de datacenter");
r = await call("rotate", {}, va);
assert.equal(r.j.bad, null);
assert.equal(r.j.q.v, "ok");
assert.equal(r.j.q.isp, "SFR");
const acc = await call("accounts/create", { pseudo: "ipq_test", email: "x@y.z", password: "pw" }, va);
assert.equal(acc.s, 200, JSON.stringify(acc.j));
assert.equal(acc.j.ipq.v, "ok", "qualité de l'IP gardée sur le compte");
await dev("/__dev/ipq?v=proxy&n=1");
r = await call("rotate", {}, va);
assert.equal(r.j.q.v, "suspecte");
assert.equal(r.j.bad, "IP marquée proxy / VPN");
const st = (await call("state", null, awen)).j;
assert.ok(st.logs.some((l) => l.action === "ip_changee" && /datacenter/.test(l.ipq || "")), "journal : qualité de l'IP notée");
console.log("✓ rotation : IP grillée signalée, création refusée, IP propre acceptée et notée");

// ---------------------------------------------------------------- scan anti-nudite
assert.equal(nsfwVerdict(nsfwClean({ porn: 0.7 })), "bloquee");
assert.equal(nsfwVerdict(nsfwClean({ porn: 0.3, hentai: 0.25 })), "bloquee", "porn + hentai additionnés");
assert.equal(nsfwVerdict(nsfwClean({ sexy: 0.9 })), "osee");
assert.equal(nsfwVerdict(nsfwClean({ porn: 0.02, sexy: 0.4 })), "ok");
assert.equal(nsfwClean("nope"), null);
assert.equal(nsfwClean({ porn: 7 }).porn, 0, "score hors 0..1 ignoré");
const pool = [{ id: "a", group: "g", nsfwV: "bloquee" }, { id: "b", group: "g", nsfwV: "bloquee", nsfwOk: true }, { id: "c", group: "g", nsfwV: "osee" }];
assert.deepEqual(pool.filter(mediaUsable).map((m) => m.id), ["b", "c"]);
for (let i = 0; i < 20; i++) assert.notEqual(pickMedia(pool, { id: "x", group: "g" }, []).id, "a", "une photo bloquée n'est jamais postée");
assert.equal(pickMedia([pool[0]], { id: "x", group: "g" }, []), null, "que des photos bloquées : aucune photo");
console.log("✓ verdict nudité et planification sans photo bloquée");

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const grp = st.settings.groups.find((g) => g.withPhoto).id;
const up = async (nsfw) => (await call("media/upload", { group: grp, dataUrl: png, filename: "t.png", nsfw }, awen)).j;
const bad = await up({ porn: 0.91, hentai: 0.01, sexy: 0.05 });
assert.equal(bad.nsfwV, "bloquee", JSON.stringify(bad));
const hot = await up({ porn: 0.05, hentai: 0, sexy: 0.93 });
assert.equal(hot.nsfwV, "osee");
const none = await up(null);
assert.equal(none.nsfwV, undefined, "pas scannée");
assert.equal((await call(`media/${none.id}/nsfw`, { nsfw: { porn: 0.01, sexy: 0.1 } }, va)).s, 403, "VA : pas de scan");
r = await call(`media/${none.id}/nsfw`, { nsfw: { porn: 0.01, sexy: 0.1 } }, awen);
assert.equal(r.j.nsfwV, "ok");
assert.equal((await call(`media/${none.id}/nsfw`, { nsfw: "x" }, awen)).s, 400);
r = await call(`media/${bad.id}/nsfw`, { allow: true }, awen);
assert.equal(r.j.nsfwOk, true, "admin : autoriser quand même");
r = await call(`media/${bad.id}/nsfw`, { allow: false }, awen);
assert.equal(r.j.nsfwOk, false);
const media = (await call("state", null, awen)).j.media;
assert.equal(media.find((m) => m.id === bad.id).nsfwV, "bloquee", "le verdict part dans l'état");
for (const m of [bad, hot, none]) await call(`media/${m.id}/delete`, {}, awen);
console.log("✓ photos : scores gardés à l'envoi, scan après coup, autoriser / bloquer");

// ---------------------------------------------------------------- taux du dollar
r = await call("compta/settings", { auto: true }, awen);
assert.equal(r.j.rateAuto, true);
assert.equal(r.j.usdRate, 0.8969, "taux du jour currency-api (arrondi 4 décimales)");
assert.equal(r.j.rateDate, "2026-11-08");
const n1 = (await (await dev("/__fx")).json()).calls;
await call("compta", null, awen);
assert.equal((await (await dev("/__fx")).json()).calls, n1, "taux gardé en cache 12 h");
r = await call("compta/settings", { usdRate: "0,95" }, awen);
assert.equal(r.j.usdRate, 0.95);
assert.equal(r.j.rateAuto, false, "taux à la main passe devant");
r = await call("compta/settings", { auto: true }, awen);
assert.equal(r.j.usdRate, 0.8969, "retour au taux du jour");
await dev("/__dev/fx?down=1&clear=1");
r = await call("compta", null, awen);
assert.equal(r.j.usdRate, 0.92, "toutes les sources en panne et pas de cache : 0,92");
assert.equal(r.j.rateDown, true);
await dev("/__dev/fx?down=0&clear=1");
assert.equal((await call("compta", null, awen)).j.usdRate, 0.8969);
console.log("✓ taux du dollar : du jour, cache, à la main, secours");
console.log("\nBRANCHEMENTS PUBLIC-APIS VERTS ✅");
