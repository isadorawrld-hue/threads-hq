// Test de la compta (onglet admin) contre le serveur local, apres dev/test-api.mjs (Awen 4321, Bilot 5555, VA 1111).
import assert from "node:assert/strict";
const B = process.env.BASE || "http://localhost:8788";
async function call(path, body, t) {
  const r = await fetch(B + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}
const login = async (pin) => (await call("login", { pin })).j.token;
const awen = await login("4321");
const bilot = await login("5555");
const va = await login("1111");

assert.equal((await call("compta", null, va)).s, 403, "la VA ne voit pas la compta");
assert.equal((await call("compta/entry", { kind: "depense", date: "2026-11-02", amount: "10", label: "x", paidBy: "Awen" }, va)).s, 403);
assert.equal((await call("state", null, va)).j.compta, undefined, "pas de compta dans l'état de la VA");
console.log("✓ VA bloquée");

assert.equal((await call("compta/entry", { kind: "depense", date: "nope", amount: "10", label: "x", paidBy: "Awen" }, awen)).s, 400);
assert.equal((await call("compta/entry", { kind: "depense", date: "2026-11-02", amount: "-3", label: "x", paidBy: "Awen" }, awen)).s, 400);
assert.equal((await call("compta/entry", { kind: "depense", date: "2026-11-02", amount: "3", label: "", paidBy: "Awen" }, awen)).s, 400);
assert.equal((await call("compta/entry", { kind: "depense", date: "2026-11-02", amount: "3", label: "x", paidBy: "Pierre" }, awen)).s, 400);
console.log("✓ saisies invalides refusées");

let r = await call("compta/entry", { kind: "depense", date: "2026-10-15", amount: "100", currency: "EUR", cat: "Paie VA", label: "paie Sandra", paidBy: "Awen", monthly: true }, awen);
assert.equal(r.s, 200);
r = await call("compta/entry", { kind: "depense", date: "2026-11-01", amount: "50,5", currency: "USD", cat: "Metricool et outils", label: "Metricool", paidBy: "Bilot" }, bilot);
r = await call("compta/entry", { kind: "gain", date: "2026-11-02", amount: "40", cat: "OnlyChat", label: "OnlyChat", paidBy: "Bilot" }, bilot);
assert.equal(r.j.entries.length, 3);
assert.equal(r.j.entries[0].date, "2026-11-02", "plus récent d'abord");
const met = r.j.entries.find((e) => e.label === "Metricool");
assert.equal(met.amountCents, 5050);
assert.equal(met.currency, "USD");
assert.equal(r.j.entries.find((e) => e.kind === "gain").monthly, false);
console.log("✓ ajout dépenses et gain (virgule, dollars)");

r = await call("compta/entry", { id: met.id, kind: "depense", date: "2026-11-01", amount: "60", currency: "USD", cat: "Metricool et outils", label: "Metricool", paidBy: "Bilot", forWho: "Bilot" }, awen);
assert.equal(r.j.entries.length, 3);
const met2 = r.j.entries.find((e) => e.id === met.id);
assert.equal(met2.amountCents, 6000);
assert.equal(met2.forWho, "Bilot");
assert.equal(met2.by, "Bilot", "l'auteur d'origine est gardé");
console.log("✓ modification");

assert.equal((await call("compta/settings", { usdRate: "abc" }, awen)).s, 400);
r = await call("compta/settings", { usdRate: "0,9" }, awen);
assert.equal(r.j.usdRate, 0.9);
r = await call("compta/delete", { id: met.id }, awen);
assert.equal(r.j.entries.length, 2);
assert.equal((await call("compta/delete", { id: met.id }, awen)).s, 404);
const st = (await call("state", null, bilot)).j;
assert.equal(st.compta.entries.length, 2, "Bilot voit les mêmes lignes");
assert.ok(st.logs.some((l) => l.action === "compta_ajout"), "journal");
console.log("✓ taux, suppression, partage entre admins, journal");
