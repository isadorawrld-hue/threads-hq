// Test du coffre-fort contre le serveur local, apres dev/test-api.mjs (Awen 4321, Bilot 5555, VA 1111).
import assert from "node:assert/strict";
const B = process.env.BASE || "http://localhost:8788";
async function call(path, body, t) {
  const r = await fetch(B + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => null), raw: "" };
}
const LOGINS = { "4321": ["Awen", "lune-rouge-4321"], "5555": ["Bilot", "soleil-bleu-5555"], "1111": ["VA", "nuage-vert-1111"] };
const login = async (k) => (await call("login", { name: LOGINS[k][0], password: LOGINS[k][1] })).j.token;
const awen = await login("4321");
const bilot = await login("5555");
const va = await login("1111");
const PW = "Mdp-Tres-Secret-9876";
// cle 2FA tiree au hasard : les cles fixes des autres tests sont deja dans l'etat (comptes)
const KEY = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[x % 32]).join("");

assert.equal((await call("vault", null, va)).s, 403, "la VA ne voit pas le coffre");
assert.equal((await call("vault/save", { title: "x" }, va)).s, 403);
assert.equal((await call("state", null, va)).j.vault, undefined);
console.log("✓ VA bloquée");

assert.equal((await call("vault/save", { title: " " }, bilot)).s, 400, "nom obligatoire");
let r = await call("vault/save", { title: "GeeLark", login: "awen@test.fr", password: PW, twofa: KEY.toLowerCase().replace(/(.{4})/g, "$1 ").trim(), url: "geelark.com", note: "codes de secours 1111" }, bilot);
assert.equal(r.s, 200);
const g = r.j.entries.find((e) => e.title === "GeeLark");
assert.ok(g.hasPassword && g.hasTwofa && g.hasNote);
assert.ok(!JSON.stringify(r.j).includes(PW), "le mot de passe ne sort jamais dans la liste");
const st = await (await fetch(B + "/api/state", { headers: { authorization: "Bearer " + awen } })).text();
assert.ok(!st.includes(PW) && !st.includes("codes de secours") && !st.includes(KEY), "rien en clair dans l'état");
console.log("✓ ajout, rien en clair dans la liste ni l'état");

r = await call("vault/reveal", { id: g.id, field: "password" }, awen);
assert.equal(r.j.value, PW, "Awen voit l'accès partagé");
assert.equal((await call("vault/reveal", { id: g.id, field: "twofa" }, awen)).j.value, KEY, "clé 2FA nettoyée");
assert.equal((await call("vault/reveal", { id: g.id, field: "nope" }, awen)).s, 404);
console.log("✓ affichage à la demande, clé 2FA nettoyée");

r = await call("vault/save", { id: g.id, title: "GeeLark", login: "awen@test.fr", url: "geelark.com" }, awen);
assert.equal((await call("vault/reveal", { id: g.id, field: "password" }, awen)).j.value, PW, "champ vide = on garde");
r = await call("vault/save", { id: g.id, title: "GeeLark", password: "nouveau" }, awen);
assert.equal((await call("vault/reveal", { id: g.id, field: "password" }, bilot)).j.value, "nouveau");
console.log("✓ modification (champ secret vide = gardé)");

r = await call("vault/save", { title: "Banque perso", password: "perso123", private: true }, bilot);
const p = r.j.entries.find((e) => e.title === "Banque perso");
assert.ok(p.private);
assert.ok(!(await call("vault", null, awen)).j.entries.some((e) => e.id === p.id), "privé invisible pour l'autre");
assert.equal((await call("vault/reveal", { id: p.id, field: "password" }, awen)).s, 404);
assert.equal((await call("vault/delete", { id: p.id }, awen)).s, 404);
assert.equal((await call("vault/reveal", { id: p.id, field: "password" }, bilot)).j.value, "perso123");
console.log("✓ entrée privée réservée à son auteur");

r = await call("vault/delete", { id: g.id }, awen);
assert.ok(!r.j.entries.some((e) => e.id === g.id));
const logs = (await call("state", null, bilot)).j.logs;
assert.ok(logs.some((l) => l.action === "coffre_vu" && l.who === "Awen" && l.champ === "mot de passe"), "affichage noté au journal");
assert.ok(!JSON.stringify(logs).includes(PW), "jamais de secret dans le journal");
console.log("✓ suppression, journal sans secret");
