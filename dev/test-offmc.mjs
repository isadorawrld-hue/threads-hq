// Test « Metricool plein » (7 nov.) : les comptes au-dela des places Metricool restent hors Metricool (posts a la main),
// le plus ancien passe sur Metricool quand une place se libere, et deux comptes ne partagent jamais une marque.
// A lancer juste apres dev/test-api.mjs, sur le meme serveur (Awen lune-rouge-4321, VA nuage-vert-1111).
import assert from "node:assert/strict";
const B = process.env.BASE || "http://localhost:8788";
async function call(path, body, t) {
  const r = await fetch(B + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}
const ok = (r, m) => { if (r.s >= 300) throw new Error(`${m} -> ${r.s} ${JSON.stringify(r.j)}`); return r.j; };
const step = (m) => console.log("✓", m);
const awen = ok(await call("login", { name: "Awen", password: "lune-rouge-4321" }), "login awen").token;
const va = ok(await call("login", { name: "VA", password: "nuage-vert-1111" }), "login va").token;

let st = ok(await call("state", null, awen), "state");
const places0 = st.tasks.mcPlaces;
assert.ok(places0 && typeof places0.used === "number", "places Metricool dans les tâches");
// on remplit Metricool : autant de places que de comptes deja dessus
ok(await call("settings", { mcSlots: places0.used }, awen), "plan plein");
await fetch(B + "/__dev/mcfull?v=1");

// un compte acheté complet, fait par la VA
let n = 0;
async function newBought(tag) {
  await call("rotate", {}, va);
  const a = ok(await call("accounts/create", { pseudo: "off." + tag, password: "pw", bought: true, geelarkProfile: "offmc " + tag + " " + n++ }, va), "création " + tag);
  ok(await call(`accounts/${a.id}/warmup`, { newPseudo: "chloe.off" + tag }, va), "warm-up " + tag);
  return ok(await call(`accounts/${a.id}/setup`, { bio: "bio " + tag }, va), "setup " + tag);
}
const x1 = await newBought("a");
assert.equal(x1.status, "actif", "compte fini");
assert.ok(x1.offMc, "Metricool plein : le compte passe hors Metricool");
assert.equal(x1.blogId || null, null, "pas de marque");
st = ok(await call("state", null, va), "state va");
assert.ok(st.tasks.toManual.includes(x1.id), "tâche « À la main » pour la VA");
assert.ok(!st.tasks.toConnect.includes(x1.id), "pas proposé à Metricool sans place");
assert.ok(!st.tasks.toPlan.includes(x1.id), "jamais planifié sur Metricool");
assert.ok(st.tasks.toCheck.includes(x1.id), "dans le check du jour");
step("Metricool plein : setup fini = compte hors Metricool, tâche à la main, pas de planification");

// tache du jour : texte poste a la main, une fois par jour, jamais deux fois le meme texte
const tx = st.texts.find((t) => t.group === x1.group && !t.off);
assert.ok(tx, "un texte pour le groupe");
let r = await call(`accounts/${x1.id}/manualdone`, { textId: "nexistepas" }, va);
assert.ok(r.s >= 400, "texte inconnu refusé");
const md = ok(await call(`accounts/${x1.id}/manualdone`, { textId: tx.id }, va), "fait aujourd'hui");
assert.equal(md.lastManualDay, st.today);
assert.equal((await call(`accounts/${x1.id}/manualdone`, { textId: tx.id }, va)).s, 400, "pas deux fois le même jour");
st = ok(await call("state", null, va), "state");
assert.ok(!st.tasks.toManual.includes(x1.id), "tâche faite pour aujourd'hui");
const mp = st.posts.find((p) => p.accountId === x1.id && p.textId === tx.id);
assert.ok(mp && mp.manual && mp.status === "publie", "post à la main enregistré (le texte ne resservira pas à ce compte)");
const onMc = st.accounts.find((a) => a.blogId && !a.offMc && a.status === "actif");
assert.equal((await call(`accounts/${onMc.id}/manualdone`, {}, va)).s, 400, "un compte Metricool n'a pas de tâche à la main");
step("à la main : 1 fois par jour, post enregistré, texte jamais repris");

// deuxieme compte hors Metricool : c'est le plus ancien qui passe en premier
const x2 = await newBought("b");
assert.ok(x2.offMc, "2e compte aussi hors Metricool");
ok(await call("settings", { mcSlots: places0.used + 1 }, awen), "une place de plus");
st = ok(await call("state", null, va), "state");
assert.ok(st.tasks.toConnect.includes(x1.id), "le plus ancien est proposé à Metricool");
assert.ok(!st.tasks.toConnect.includes(x2.id), "un seul compte pour une seule place");
// un nouveau compte fini ne passe pas devant ceux qui attendent
const x3 = await newBought("c");
assert.ok(x3.offMc, "le nouveau attend derrière les comptes hors Metricool");
step("place libérée : le plus ancien hors Metricool passe en premier, un nouveau ne double pas");

// connexion du promu : il quitte le mode hors Metricool
await fetch(B + "/__dev/mcfull?v=0");
const c = ok(await call(`accounts/${x1.id}/mcconnect`, {}, va), "mcconnect promu");
assert.ok(c.blogId && c.mcLink, "marque + lien");
await fetch(B + `/__dev/connect?blogId=${c.blogId}&username=${c.pseudo}`);
const v = ok(await call(`accounts/${x1.id}/mcverify`, {}, va), "verify promu");
assert.equal(v.connected, true);
assert.equal(v.account.offMc, undefined, "plus hors Metricool");
st = ok(await call("state", null, va), "state");
assert.ok(!st.tasks.toManual.includes(x1.id) && !st.tasks.offMc.includes(x1.id));
assert.equal(st.tasks.mcPlaces.free, 0, "plus de place");
assert.ok(!st.tasks.toConnect.includes(x2.id), "x2 attend encore");
step("le promu se connecte à Metricool et sort de « À la main »");

// admin : sortir un compte de Metricool (annule ses posts a venir) ; la VA ne peut pas
assert.equal((await call(`accounts/${x1.id}/offmc`, {}, va)).s, 403, "VA : refusé");
const off = ok(await call(`accounts/${x1.id}/offmc`, {}, awen), "sortir de Metricool");
assert.ok(off.account.offMc && !off.account.blogId);
st = ok(await call("state", null, awen), "state");
assert.ok(st.tasks.offMc.includes(x1.id) && st.tasks.toConnect.includes(x1.id), "place rendue : il est de nouveau proposé (le plus ancien)");
assert.ok(!st.posts.some((p) => p.accountId === x1.id && p.status === "programme"), "aucun post programmé restant");
step("admin : « Sortir de Metricool » annule les posts et rend la place");

// cause racine du 4 nov. : un remplaçant ne reprend jamais une marque déjà tenue par un compte vivant
{
  const s0 = ok(await call("state", null, awen), "state");
  const holder = s0.accounts.find((a) => a.status === "actif" && a.blogId && !a.offMc);
  let dead = s0.accounts.find((a) => a.status === "saute" && !a.replacedBy);
  if (!dead) {
    const y = await newBought("dead");
    dead = ok(await call(`accounts/${y.id}/check`, { status: "saute" }, va), "y sauté");
  }
  if (holder && dead) {
    // on force la situation : le compte mort pointe sur la marque d'un compte vivant
    ok(await call(`accounts/${dead.id}/edit`, { notes: "test" }, awen), "edit");
    await fetch(B + `/__dev/setblog?id=${dead.id}&blogId=${holder.blogId}`);
    ok(await call("settings", { mcSlots: 500 }, awen), "places");
    await call("rotate", {}, va);
    const rp = ok(await call("accounts/create", { pseudo: "off.repl", password: "pw", bought: true, geelarkProfile: "offmc repl" }, va), "remplaçant");
    assert.equal(rp.replaces, dead.id, "remplace le compte mort");
    ok(await call(`accounts/${rp.id}/warmup`, { newPseudo: "chloe.offrepl" }, va), "w");
    ok(await call(`accounts/${rp.id}/setup`, {}, va), "s");
    const cc = ok(await call(`accounts/${rp.id}/mcconnect`, {}, va), "mcconnect remplaçant");
    assert.notEqual(String(cc.blogId), String(holder.blogId), "jamais la marque d'un compte vivant");
    step("remplaçant : jamais la marque d'un compte encore vivant (bug keke / maomi)");
  } else console.log("  (pas de compte mort libre : test du remplaçant sauté)");
}
// bug du 11 nov. : sauter un compte qui partage la marque d'un compte vivant ne doit pas couper le Threads du vivant
{
  const s0 = ok(await call("state", null, awen), "state");
  const holder = s0.accounts.find((a) => a.status === "actif" && a.blogId && !a.offMc);
  const brandOf = async () => ok(await call("metricool/brands", null, awen), "marques").find((b) => String(b.blogId) === String(holder.blogId));
  assert.ok((await brandOf()).threads, "le vivant est connecté avant");
  const tw = await newBought("twin");
  await fetch(B + `/__dev/setblog?id=${tw.id}&blogId=${holder.blogId}`);
  ok(await call(`accounts/${tw.id}/check`, { status: "saute" }, va), "jumeau sauté");
  assert.ok((await brandOf()).threads, "le Threads du compte vivant reste connecté");
  const twa = ok(await call("state", null, awen), "state").accounts.find((a) => a.id === tw.id);
  assert.equal(twa.blogId, null, "le sauté lâche la marque partagée");
  step("sauter un compte à marque partagée ne déconnecte pas le compte vivant (meimei / xiaoyu)");
}
const actions = new Set(ok(await call("state", null, awen), "state").logs.map((l) => l.action));
for (const a of ["manuel_fait", "hors_metricool", "hors_metricool_fini"]) assert.ok(actions.has(a), "log " + a);
console.log("\nTOUT EST VERT ✅");
