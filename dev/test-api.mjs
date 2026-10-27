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
assert.deepEqual(st.configured, { rotation: true, metricool: true, mcToken: true, mcUserId: true, proxy: true, tiny: false, sms: false });
assert.equal((await call("secrets", { mcUserId: "nimporte" })).s, 400);
assert.equal((await call("settings", { socksPort: "517157867" })).s, 400, "port SOCKS5 farfelu refusé");
ok(await call("settings", { socksPort: "17157" }), "port SOCKS5 ok");
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

// Hero SMS
assert.equal((await call("sms/buy", { country: 14 })).s, 400, "sans clé Hero : refusé");
tok = admin;
ok(await call("secrets", { heroToken: "HERO_TEST" }), "clé hero");
tok = va;
const prices = ok(await call("sms/prices"), "prix");
assert.equal(prices.find((c) => c.id === 14).price, 0.035);
assert.equal(ok(await call("sms/balance"), "solde").balance, 9.5);
assert.equal((await call("sms/buy", { country: 55 })).s, 400, "Taïwan retiré");
assert.equal(prices.length, 2, "seulement Hong Kong et Singapour");
const act = ok(await call("sms/buy", { country: 14 }), "achat");
assert.match(act.phone, /^\+8529/);
assert.equal(act.status, "attente");
assert.equal((await call("sms/buy", { country: 14 })).s, 400, "un seul numéro en cours");
let c = ok(await call(`sms/${act.id}/code`, {}), "code ?");
assert.equal(c.code, null);
await fetch(B + "/__dev/sms?code=654321");
c = ok(await call(`sms/${act.id}/code`, {}), "code");
assert.equal(c.code, "654321");
assert.equal((await call(`sms/${act.id}/cancel`, {})).s, 400, "code reçu -> pas d'annulation");
st = ok(await call("state"), "state");
assert.equal(st.sms.code, "654321");
step("Hero SMS : prix, solde, achat, code reçu");
const a1 = ok(await call("accounts/create", { pseudo: "@tw_girl1", phone: act.phone, smsId: act.id, password: "pw1" }), "création 1");
assert.equal((await (await fetch(B + "/__sms")).json()).finished, true, "activation terminée chez Hero");
st = ok(await call("state"), "state");
assert.equal(st.sms, null, "plus de numéro en cours");
// un numero annule est rembourse si aucun code
const act2 = ok(await call("sms/buy", { country: 196 }), "achat 2");
ok(await call(`sms/${act2.id}/cancel`, {}), "annulation");
assert.equal((await (await fetch(B + "/__sms")).json()).cancelled, true);
// un echec de creation rembourse tout seul
const act3 = ok(await call("sms/buy", { country: 14 }), "achat 3");
ok(await call("accounts/failed", { phone: act3.phone, smsId: act3.id, reason: "Code SMS jamais reçu" }), "échec 2");
assert.equal((await (await fetch(B + "/__sms")).json()).cancelled, true, "remboursé après échec");
step("Hero SMS : terminé à la création, remboursé à l'annulation et à l'échec");
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

assert.equal((await call(`accounts/${a1.id}/setup`, {})).s, 400);
step("setup refusé avant le warm-up");
for (const a of [a1, a2, a3]) ok(await call(`accounts/${a.id}/warmup`, {}), "warmup");
const pickOf = { epingle: "b1", lien: "b2", relais: "b3" };
for (const a of [a1, a2, a3]) ok(await call(`accounts/${a.id}/setup`, { bio: pickOf[a.strategy] + " (modifiée)", bioPick: pickOf[a.strategy] }), "setup VA");
{
  const bank = ok(await call("state"), "state").settings.bioBank;
  assert.deepEqual([bank.epingle.length, bank.lien.length, bank.relais.length], [0, 0, 0], "bio utilisée = sortie de la banque");
  tok = admin;
  ok(await call("settings", { bioBank: { epingle: ["b1", "b4"], lien: ["b2", "b5"], relais: ["b3", "b6"] } }), "resauvegarde avec vieilles bios");
  const bank2 = ok(await call("state"), "state").settings.bioBank;
  assert.deepEqual(bank2, { epingle: ["b4"], lien: ["b5"], relais: ["b6"] }, "une bio déjà utilisée ne revient jamais");
  tok = va;
}
step("bios : chaque bio ne sert qu'une fois, même si une vieille page la renvoie");
step("setup par la VA juste après le warm-up (pas d'attente)");
tok = admin;

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
// connexion en 1 clic : marque creee + lien anonyme, puis verification
const c1 = ok(await call(`accounts/${a1.id}/mcconnect`, {}), "mcconnect a1");
assert.equal(c1.blogId, "1003", "marque créée par le CRM");
assert.ok(c1.mcLink.startsWith("https://f.mtr.cool/"), "lien de connexion");
const brandsAfter = ok(await call("metricool/brands"), "marques");
assert.equal(brandsAfter.find((b) => b.blogId === "1003").label, "@" + a1.pseudo, "marque nommée @pseudo");
let vf = ok(await call(`accounts/${a1.id}/mcverify`, {}), "verify avant connexion");
assert.equal(vf.connected, false);
await fetch(B + `/__dev/connect?blogId=1003&username=quelquun_dautre`);
assert.equal((await call(`accounts/${a1.id}/mcverify`, {})).s, 400, "mauvais compte refusé");
await fetch(B + `/__dev/connect?blogId=1003&username=${a1.pseudo}`);
vf = ok(await call(`accounts/${a1.id}/mcverify`, {}), "verify");
assert.equal(vf.connected, true);
assert.equal(vf.account.status, "actif");
assert.ok(vf.plan.created.length >= 0);
step("Metricool en 1 clic : marque + lien + vérif + planif auto");
assert.equal((await call(`accounts/${a2.id}/metricool`, { blogId: "1003" })).s, 400);
step("marque déjà prise refusée");
const photosAcc = [a1, a2, a3].find((a) => a.group === "photos");
const textesAcc = [a1, a2, a3].find((a) => a.group === "textes");
ok(await call(`accounts/${a2.id}/metricool`, { blogId: "222" }), "relier a2");
ok(await call(`accounts/${a3.id}/metricool`, { blogId: "333" }), "relier a3");
const plans = {};
plans[a1.group] = vf.plan;
for (const a of [a2, a3]) plans[a.group] = ok(await call("metricool/plan", { accountId: a.id, days: 3 }), "planif " + a.group);
console.log("   planif :", Object.fromEntries(Object.entries(plans).map(([g, p]) => [g, `${p.created.length} posts, soucis: ${p.problems.join(" | ") || "aucun"}`])));
assert.ok(plans.textes.problems.length > 0, "groupe textes : 2 textes seulement -> doit signaler le manque");
assert.equal(plans.textes.created.length, 2);
assert.ok(plans.photos.created.length >= 6);
assert.ok(plans.villes.created.length >= 6);
const mc = await (await fetch(B + "/__mc")).json();
const photoPost = mc.posts.find((p) => p.blogId === String(photosAcc.id === a1.id ? 1003 : photosAcc.id === a2.id ? 222 : 333));
assert.ok(photoPost.media[0].startsWith("https://static.metricool.test/"), "photo normalisée");
assert.deepEqual(photoPost.providers, [{ network: "threads" }]);
assert.equal(photoPost.publicationDate.timezone, "Asia/Taipei");
const textPosts = mc.posts.filter((p) => p.media.length === 0);
assert.ok(textPosts.length > 0);
// jamais le meme texte deux fois sur le meme compte
for (const blog of ["1003", "222", "333"]) {
  const t = mc.posts.filter((p) => p.blogId === blog).map((p) => p.text);
  assert.equal(new Set(t).size, t.length, "texte répété sur " + blog);
}
// heures locales dans les creneaux +- jitter
for (const p of mc.posts) {
  const [h, m] = p.publicationDate.dateTime.slice(11, 16).split(":").map(Number);
  const mins = h * 60 + m;
  assert.ok([8 * 60, 12 * 60 + 30, 20 * 60 + 30].some((s) => Math.abs(s - mins) <= 25), "créneau " + p.publicationDate.dateTime);
}
// statut des posts relu sur Metricool : publié (avec lien) et erreur
{
  const mine = mc.posts.filter((p) => p.blogId === "222");
  await fetch(B + `/__dev/mcstatus?id=${mine[0].id}&s=PUBLISHED`);
  await fetch(B + `/__dev/mcstatus?id=${mine[1].id}&s=ERROR`);
  const sy = ok(await call("posts/sync", {}), "sync posts");
  assert.ok(sy.changed >= 2);
  const sp = ok(await call("state"), "state").posts;
  const p0 = sp.find((p) => String(p.mcId) === String(mine[0].id));
  const p1 = sp.find((p) => String(p.mcId) === String(mine[1].id));
  assert.equal(p0.status, "publie");
  assert.match(p0.url, /threads\.com/);
  assert.equal(p1.status, "erreur");
  assert.equal(p1.error, "Token Threads expiré");
  assert.ok(ok(await call("state"), "state").tasks.postErrors.includes(p1.id), "post en erreur remonte");
  step("posts relus sur Metricool : publié avec lien, erreur avec raison");
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
const calls = (await (await fetch(B + "/__mc")).json()).calls;
const del = calls.filter((c) => c.method === "DELETE" && c.path.includes("/scheduler/posts/")).length;
assert.equal(del, cancelled);
assert.ok(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/connections/threads") && c.query.includes("blogId=333")), "Threads déconnecté de la marque du mort");
step(`compte sauté : ${cancelled} posts annulés sur Metricool, marque libérée`);
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
const c4 = ok(await call(`accounts/${a4.id}/mcconnect`, {}), "mcconnect a4");
assert.equal(c4.blogId, "333", "reprend la marque du compte mort");
assert.equal((await call("metricool/brands")).j.find((b) => b.blogId === "333").label, "@tw_girl4", "marque renommée");
await fetch(B + `/__dev/connect?blogId=333&username=tw_girl4`);
assert.equal(ok(await call(`accounts/${a4.id}/mcverify`, {}), "verify a4").connected, true);
step("marque du compte mort réutilisée et renommée");

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
assert.equal(ok(await call("metricool/health", {}), "santé").length, 0, "tout est connecté");
await fetch(B + "/__dev/connect?blogId=222&username=");
const alerts = ok(await call("metricool/health", {}), "santé");
assert.equal(alerts.length, 1);
assert.match(alerts[0].msg, /Threads déconnecté/);
{
  // le compte deconnecte remonte en priorite pour la VA, et ne fait plus partie des comptes a planifier
  const sv = ok(await call("state", undefined, va), "state VA");
  assert.deepEqual(sv.tasks.toReconnect, [alerts[0].accountId], "compte à reconnecter");
  assert.ok(!sv.tasks.toPlan.includes(alerts[0].accountId));
  assert.equal(sv.mcAlerts.length, 1, "la VA voit l'alerte");
  ok(await call("help/seen", { k: "reconnect" }, va), "aide notée");
}
step("santé Metricool : alerte Threads déconnecté, compte à reconnecter en priorité");

// import Google Drive
const dl = ok(await call("drive/list?folder=" + encodeURIComponent("https://drive.google.com/drive/folders/DOSSIERTEST123?usp=drive_link")), "liste drive");
assert.deepEqual(dl.map((f) => f.name), ["1.jpg", "2.jpg"], "images seulement, triées");
const fr = await fetch(B + "/api/drive/file?id=" + dl[0].id, { headers: { authorization: "Bearer " + admin } });
assert.equal(fr.headers.get("content-type"), "image/png");
const du = "data:image/png;base64," + Buffer.from(await fr.arrayBuffer()).toString("base64");
ok(await call("media/upload", { kind: "pfp", dataUrl: du, filename: "1.jpg", driveId: dl[0].id }), "import pfp");
assert.equal((await call("media/upload", { kind: "pfp", dataUrl: du, filename: "1.jpg", driveId: dl[0].id })).s, 400, "pas de doublon");
assert.equal(ok(await call("drive/list?folder=DOSSIERTEST123"), "re-liste").find((f) => f.name === "1.jpg").already, true);
step("import Google Drive : liste, image, pas de doublon");

// menage TinyURL : vieux liens du domaine supprimes, jamais ceux des comptes
tok = va;
assert.equal((await call("tiny/cleanup")).s, 403, "VA : interdit");
tok = admin;
const ml = ok(await call("tiny/model", {}), "lien perso de la modèle");
assert.equal(ml.link, "https://chauna.live/chloe", "accents retirés");
const scan = ok(await call("tiny/cleanup"), "scan");
const crmLinks = ok(await call("state"), "state").accounts.filter((a) => a.link.startsWith("https://chauna.live/")).length;
assert.ok(crmLinks >= 1);
assert.equal(scan.kept >= crmLinks, true);
assert.equal(scan.count, 31, "30 vieux + 1 archivé, sans les liens du CRM");
assert.equal((await call("tiny/cleanup", { confirm: "autre.com" })).s, 400, "confirmation obligatoire");
const clean = ok(await call("tiny/cleanup", { confirm: "chauna.live" }), "ménage");
assert.equal(clean.deleted, 31);
const tz = await (await fetch(B + "/__tiny")).json();
assert.ok(!tz.deleted.includes("taipeilily_2"), "lien d'un compte jamais supprimé");
assert.ok(!tz.deleted.includes("chloe"), "lien perso jamais supprimé");
assert.equal(ok(await call("tiny/cleanup"), "rescan").count, 1, "reste seulement l'archivé du mock");
step("ménage TinyURL : 31 vieux liens supprimés, liens des comptes gardés");
st = ok(await call("state"), "state admin");
const actions = new Set(st.logs.map((l) => l.action));
for (const a of ["premier_acces", "connexion", "ip_changee", "compte_cree", "creation_ratee", "warmup_fait", "setup_fait", "metricool_relie", "marque_creee", "lien_metricool", "planif", "check", "compte_saute"]) assert.ok(actions.has(a), "log manquant " + a);
step("logs complets (" + st.logs.length + " lignes)");
console.log("\nTOUT EST VERT ✅");
