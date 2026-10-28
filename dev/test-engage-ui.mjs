// A lancer juste apres test-api (memes donnees) : pseudos violets (warm-up quotidien), pop-up 2 s, notes, droits admin/VA.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const B = process.env.BASE || "http://localhost:8788";
const br = await chromium.launch();
const errs = [];
async function login(pin) {
  const p = await br.newPage({ viewport: { width: 1400, height: 1000 } });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(B);
  for (const d of pin) await p.click(`[data-pin="${d}"]`);
  await p.click('[data-pin="go"]');
  await p.waitForTimeout(1500);
  return p;
}
const tab = async (p, t) => { await p.evaluate((t) => document.querySelector(`[data-tab="${t}"]`).click(), t); await p.waitForTimeout(500); };
// admin : bouton violet au hasard + bascule sur les cartes
const a = await login("4321");
await tab(a, "accounts");
assert.ok(/Pseudos violets \(warm-up tous les jours\) : \d\/5/.test(await a.textContent("body")), "compteur violets");
assert.ok((await a.$$('[data-act="engageToggle"]')).length > 0, "bascule admin");
const id = await a.getAttribute('[data-act="engageToggle"][data-v="1"]', "data-id");
await a.click(`[data-act="engageToggle"][data-id="${id}"]`);
await a.waitForTimeout(1200);
assert.ok(await a.$(`.ps-warm[data-id="${id}"]`), "pseudo violet après bascule");
// notes
await a.click(`[data-act="edit"][data-id="${id}"]`);
await a.fill('[data-ed="notes"]', "Email de secours : test@mail.com. Demande de vérif le 28/10");
await a.click('[data-act="saveEdit"]');
await a.waitForTimeout(1200);
assert.ok(/Demande de vérif le 28\/10/.test(await a.textContent("body")), "note visible sur la carte");
await a.screenshot({ path: "/home/claude/shots/22-comptes-violets.png", fullPage: true });
// VA : pas d'onglet, pop-up a l'ouverture, pseudos violets, clic = pop-up
const v = await login("1111");
const pop = await v.$eval("#warmpop", (e) => ({ show: e.classList.contains("show"), t: e.textContent }));
assert.ok(pop.show && /Warm-up du jour/.test(pop.t), "pop-up du jour à l'ouverture");
await v.screenshot({ path: "/home/claude/shots/23-today-popup.png" });
await v.waitForTimeout(2300);
assert.equal(await v.$eval("#warmpop", (e) => e.classList.contains("show")), false, "pop-up disparait après 2 s");
assert.ok(!/Engagement \(test\)/.test(await v.textContent("nav, .sidebar, body")), "plus d'onglet engagement");
assert.ok(/Pseudos violets = warm-up 10 min tous les jours/.test(await v.textContent("body")), "rappel sur Aujourd'hui");
await v.reload(); await v.waitForTimeout(1500);
assert.equal(await v.$eval("#warmpop", (e) => e.classList.contains("show")).catch(() => false), false, "une seule fois par jour");
await tab(v, "accounts");
assert.equal((await v.$$('[data-act="engageToggle"]')).length, 0, "VA ne change pas les violets");
assert.equal((await v.$$('[data-act="engagePick"]')).length, 0);
await v.click(".ps-warm");
await v.waitForTimeout(200);
assert.ok(/à warm-up aujourd'hui/.test(await v.$eval("#warmpop", (e) => e.textContent)), "clic pseudo violet = pop-up");
await v.screenshot({ path: "/home/claude/shots/24-comptes-va.png" });
for (const t of ["check", "metricool", "planning", "stats"]) { await tab(v, t); }
assert.deepEqual(errs, [], "erreurs JS");
console.log("VIOLETS UI OK ✅");
await br.close();
