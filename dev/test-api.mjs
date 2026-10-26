// Test de bout en bout de l'API contre le serveur local (node dev/server.mjs).
import assert from "node:assert/strict";
const B = process.env.BASE || "http://localhost:8788";
let tok = "";
async function call(path, body, t = tok, method) {
  const r = await fetch(B + "/api/" + path, { method: method || (body ? "POST" : "GET"), headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  return { s: r.status, j };
}
const ok = (r, msg) => {
  if (r.s >= 300) throw new Error(`${msg} -> ${r.s} ${JSON.stringify(r.j)}`);
  return r.j;
};
const step = (m) => console.log("✓", m);

let r = await call("status");
assert.equal(r.j.firstRun, true);
r = ok(await call("login", { pin: "4321", name: "Awen" }), "premier login");
const admin = r.token;
tok = admin;
step("premier accès = admin Awen");
assert.equal((await call("login", { pin: "0000" })).s, 401);
step("mauvais code refusé");
assert.equal((await call("state", null, "faux.jeton")).s, 401);
step("jeton bidon refusé");

ok(await call("users", { name: "Bilot", pin: "5555", role: "admin" }), "ajout Bilot");
ok(await call("users", { name: "VA", pin: "1111", role: "va" }), "ajout VA");
assert.equal((await call("users", { name: "X", pin: "1111", role: "va" })).s, 400);
step("utilisateurs + code unique");

ok(await call("settings", { bioBank: { epingle: ["b1"], lien: ["b2"], relais: ["b3"] }, hub: { pseudo: "chloe_main", postUrl: "" }, proxy: "proxy.test:8000:user:pass", smsSiteUrl: "https://sms.test", links: ["https://tinyurl.com/a1", "https://tinyurl.com/a2", "https://tinyurl.com/a3"], bios: ["bio 1", "bio 2"], pinnedPost: "épinglé" }), "réglages");
ok(await call("secrets", { rotationUrl: "https://rotate.test/x", mcToken: "TOKEN_TEST", mcUserId: "42" }), "secrets");
let st = ok(await call("state"), "state");
assert.deepEqual(st.configured, { rotation: true, metricool: true, mcToken: true, mcUserId: true, proxy: true, tiny: false });
assert.equal((await call("secrets", { mcUserId: "nimporte" })).s, 400);
ok(await call("secrets", { mcUserId: "https://app.metricool.com/evolution/web?blogId=1&userId=42" }), "userId via URL");
assert.equal(JSON.stringify(st).includes("TOKEN_TEST"), false, "le token ne doit jamais sortir");
assert.equal(JSON.stringify(st).includes("rotate.test"), false, "le lien de rotation ne doit jamais sortir");
step("secrets cachés au navigateur");

const va = ok(await call("login", { pin: "1111" }), "login VA").token;
tok = va;
assert.equal((await call("secrets", { mcToken: "x" })).s, 403);
assert.equal((await call("settings", { proxy: "x" })).s, 403);
st = ok(await call("state"), "state VA");
assert.equal(st.logs, undefined);
step("VA : pas accès aux réglages ni aux logs");

assert.equal((await call("accounts/create", { pseudo: "a", phone: "1", password: "p" })).s, 400);
step("création refusée sans IP fraîche");
const ip1 = ok(await call("rotate", {}), "rotation");
assert.match(ip1.ip, /^82\.64\.12\./);
const a1 = ok(await call("accounts/create", { pseudo: "@tw_girl1", phone: "+886 900 000 001", password: "pw1" }), "création 1");
assert.equal(a1.pseudo, "tw_girl1");
assert.equal(a1.ip, ip1.ip);
assert.equal(a1.link, "https://tinyurl.com/a1");
assert.equal((await call("accounts/create", { pseudo: "tw_girl2", phone: "2", password: "p" })).s, 400);
step("compte créé, même IP refusée pour le suivant");
ok(await call("accounts/failed", { phone: "3", reason: "Numéro refusé" }), "échec");
await call("rotate", {});
const a2 = ok(await call("accounts/create", { pseudo: "tw_girl2", phone: "+886 2", password: "pw2" }), "création 2");
await call("rotate", {});
const a3 = ok(await call("accounts/create", { pseudo: "tw_girl3", phone: "+886 3", password: "pw3" }), "création 3");
assert.notEqual(a1.group, a2.group);
assert.notEqual(a2.group, a3.group);
step("groupes répartis : " + [a1.group, a2.group, a3.group].join(", "));
assert.deepEqual([a1.strategy, a2.strategy, a3.strategy].sort(), ["epingle", "lien", "relais"], "3 stratégies réparties");
const relay = [a1, a2, a3].find((a) => a.strategy === "relais");
assert.equal(relay.link, "", "un compte relais n'a pas de lien");
step("stratégies réparties, relais sans lien");

for (const a of [a1, a2, a3]) ok(await call(`accounts/${a.id}/warmup`, {}), "warmup");
assert.equal((await call(`accounts/${a1.id}/setup`, {})).s, 400);
step("setup bloqué avant 24h pour la VA");
tok = admin;
for (const a of [a1, a2, a3]) ok(await call(`accounts/${a.id}/setup`, { bio: "bio" }), "setup admin");
step("setup forcé par l'admin");

// contenu
ok(await call("texts/bulk", { group: "textes", lines: "今天沒穿內衣就出門 || sortie sans soutif\n雙人床一個人睡\n雙人床一個人睡" }), "textes");
ok(await call("texts/bulk", { group: "photos", lines: "photo texte 1\nphoto texte 2\nphoto texte 3\nphoto texte 4\nphoto texte 5\nphoto texte 6\nphoto texte 7\nphoto texte 8\nphoto texte 9\nphoto texte 10" }), "textes photos");
ok(await call("texts/bulk", { group: "villes", lines: Array.from({ length: 12 }, (_, i) => "ville " + i).join("\n") }), "textes villes");
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const m1 = ok(await call("media/upload", { group: "photos", dataUrl: png, filename: "p1.png" }), "upload");
ok(await call("media/upload", { kind: "pfp", dataUrl: png, filename: "pfp.png" }), "upload pfp");
const img = await fetch(B + "/api/media/" + m1.id + ".png");
assert.equal(img.status, 200);
assert.equal(img.headers.get("content-type"), "image/png");
step("textes (doublons ignorés) + photos servies publiquement");
st = ok(await call("state"), "state");
assert.equal(st.texts.filter((t) => t.group === "textes").length, 2);

// metricool
tok = va;
const brands = ok(await call("metricool/brands"), "marques");
assert.equal(brands.length, 3);
assert.equal(brands[0].threads, "acc_a");
assert.equal(brands[2].threads, null);
ok(await call(`accounts/${a1.id}/metricool`, { blogId: "111" }), "relier a1");
assert.equal((await call(`accounts/${a2.id}/metricool`, { blogId: "111" })).s, 400);
step("marque déjà prise refusée");
const photosAcc = [a1, a2, a3].find((a) => a.group === "photos");
const textesAcc = [a1, a2, a3].find((a) => a.group === "textes");
ok(await call(`accounts/${a2.id}/metricool`, { blogId: "222" }), "relier a2");
ok(await call(`accounts/${a3.id}/metricool`, { blogId: "333" }), "relier a3");
const plans = {};
for (const a of [a1, a2, a3]) plans[a.group] = ok(await call("metricool/plan", { accountId: a.id, days: 3 }), "planif " + a.group);
console.log("   planif :", Object.fromEntries(Object.entries(plans).map(([g, p]) => [g, `${p.created.length} posts, soucis: ${p.problems.join(" | ") || "aucun"}`])));
assert.ok(plans.textes.problems.length > 0, "groupe textes : 2 textes seulement -> doit signaler le manque");
assert.equal(plans.textes.created.length, 2);
assert.ok(plans.photos.created.length >= 6);
assert.ok(plans.villes.created.length >= 6);
const mc = await (await fetch(B + "/__mc")).json();
const photoPost = mc.posts.find((p) => p.blogId === String([a1, a2, a3].find((a) => a.group === "photos") && (photosAcc.id === a1.id ? 111 : photosAcc.id === a2.id ? 222 : 333)));
assert.ok(photoPost.media[0].startsWith("https://static.metricool.test/"), "photo normalisée");
assert.deepEqual(photoPost.providers, [{ network: "threads" }]);
assert.equal(photoPost.publicationDate.timezone, "Asia/Taipei");
const textPosts = mc.posts.filter((p) => p.media.length === 0);
assert.ok(textPosts.length > 0);
// jamais le meme texte deux fois sur le meme compte
for (const blog of ["111", "222", "333"]) {
  const t = mc.posts.filter((p) => p.blogId === blog).map((p) => p.text);
  assert.equal(new Set(t).size, t.length, "texte répété sur " + blog);
}
// heures locales dans les creneaux +- jitter
for (const p of mc.posts) {
  const [h, m] = p.publicationDate.dateTime.slice(11, 16).split(":").map(Number);
  const mins = h * 60 + m;
  assert.ok([8 * 60, 12 * 60 + 30, 20 * 60 + 30].some((s) => Math.abs(s - mins) <= 25), "créneau " + p.publicationDate.dateTime);
}
const again = ok(await call("metricool/plan", { accountId: (photosAcc).id, days: 3 }), "replanif");
assert.equal(again.created.length, 0, "pas de doublon de créneau");
step(`planif Metricool OK (${mc.posts.length} posts, créneaux Taïwan, pas de doublon)`);

// check + saute + remplacement
st = ok(await call("state"), "state");
assert.equal(st.tasks.toCheck.length, 3);
ok(await call(`accounts/${a1.id}/check`, { status: "actif", followers: 12 }), "check ok");
ok(await call(`accounts/${a2.id}/check`, { status: "shadowban" }), "check sb");
ok(await call(`accounts/${a3.id}/check`, { status: "saute", note: "suspendu" }), "check saute");
st = ok(await call("state"), "state");
assert.equal(st.tasks.toCheck.length, 0);
assert.deepEqual(st.tasks.toReplace, [a3.id]);
const cancelled = st.posts.filter((p) => p.accountId === a3.id && p.status === "annule").length;
assert.ok(cancelled > 0);
const del = (await (await fetch(B + "/__mc")).json()).calls.filter((c) => c.method === "DELETE").length;
assert.equal(del, cancelled);
step(`compte sauté : ${cancelled} posts annulés sur Metricool`);
await call("rotate", {});
const a4 = ok(await call("accounts/create", { pseudo: "tw_girl4", phone: "+886 4", password: "pw4" }), "remplacement");
assert.equal(a4.group, a3.group);
assert.equal(a4.replaces, a3.id);
assert.equal(a4.strategy, a3.strategy, "le remplaçant garde la stratégie");
if (a3.strategy !== "relais") assert.equal(a4.link, a3.link, "reprend le lien libéré"); else assert.equal(a4.link, "");
st = ok(await call("state"), "state");
assert.equal(st.tasks.toReplace.length, 0);
step("remplaçant : même groupe, même lien, lien de remplacement");
// la marque 333 est liberee
ok(await call(`accounts/${a4.id}/warmup`, {}), "w4");
tok = admin;
ok(await call(`accounts/${a4.id}/setup`, {}), "s4");
ok(await call(`accounts/${a4.id}/metricool`, { blogId: "333" }), "relier sur la marque libérée");
step("marque du compte mort réutilisée");

assert.equal((await call("links/stats", {})).s, 400);
ok(await call("secrets", { tinyToken: "TINY_TEST" }), "token tiny");
const lsr = ok(await call("links/stats", {}), "stats liens");
assert.ok(Object.keys(lsr.links).length >= 2, "liens relevés");
assert.equal(Object.values(lsr.links)[0].clicks30, 42);
assert.equal(Object.values(lsr.links)[0].clicks7, 9);
st = ok(await call("state"), "state");
assert.equal(st.configured.tiny, true);
assert.ok(st.linkStats && st.linkStats.links);
step("stats des liens TinyURL (7 j / 30 j)");
// creation automatique du lien TinyURL avec le pseudo
ok(await call("settings", { model: { name: "Chloé", link: "https://ludivine.me/d" }, tinyDomain: "chauna.live" }), "modèle + domaine");
tok = va;
await call("rotate", {});
const a5 = ok(await call("accounts/create", { pseudo: "Taipei.Lily_2", phone: "+886 5", password: "pw5" }), "création 5");
if (a5.strategy !== "relais") {
  assert.equal(a5.link, "https://chauna.live/taipeilily_2", "lien créé avec le pseudo nettoyé");
  assert.equal(a5.linkAlias, "taipeilily_2");
} else assert.equal(a5.link, "");
await call("rotate", {});
const a6 = ok(await call("accounts/create", { pseudo: "taipei_lily", phone: "+886 6", password: "pw6", linkDomain: "tinyurl" }), "création 6 (alias pris, tinyurl.com)");
if (a6.strategy !== "relais") { assert.equal(a6.link, "https://tinyurl.com/taipei_lilyx", "alias pris -> variante, sans domaine perso"); assert.equal(a6.linkDomain, "tinyurl"); }
tok = admin;
const forced = [a5, a6].find((x) => x.strategy === "relais");
if (forced) assert.equal((await call(`accounts/${forced.id}/makelink`, {})).s, 400);
step("lien TinyURL auto : pseudo, variante si alias pris, pas pour les relais");
const alerts = ok(await call("metricool/health", {}), "santé");
assert.equal(alerts.length, 1);
assert.match(alerts[0].msg, /Threads déconnecté/);
step("santé Metricool : alerte Threads déconnecté");
st = ok(await call("state"), "state admin");
const actions = new Set(st.logs.map((l) => l.action));
for (const a of ["premier_acces", "connexion", "ip_changee", "compte_cree", "creation_ratee", "warmup_fait", "setup_fait", "metricool_relie", "planif", "check", "compte_saute"]) assert.ok(actions.has(a), "log manquant " + a);
step("logs complets (" + st.logs.length + " lignes)");
console.log("\nTOUT EST VERT ✅");
