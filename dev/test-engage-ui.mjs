// A lancer juste apres test-api (donnees du test) : pages Engagement, Stats, Comptes, Aujourd'hui, en admin et en VA.
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
// admin : stats montre la comparaison
const a = await login("4321");
await tab(a, "stats");
const statsTxt = await a.textContent("main, #app, body");
assert.ok(/Test engagement · jour 1/.test(statsTxt), "bloc test sur Stats");
assert.ok(/Témoins/.test(statsTxt));
await a.screenshot({ path: "/home/claude/shots/20-stats-engage.png", fullPage: true });
await tab(a, "accounts");
assert.ok((await a.$$('[data-act="engageToggle"]')).length > 0, "bouton admin sur les cartes");
assert.ok(/Test engagement/.test(await a.textContent("body")));
// VA : nav, tache du jour, page, bouton Fait
const v = await login("1111");
const nav = await v.textContent("body");
assert.ok(/Engagement \(test\)/.test(nav), "onglet visible pour la VA");
assert.ok(/Engagement du jour/.test(nav), "tâche sur Aujourd'hui");
assert.equal((await v.$$('[data-act="engageToggle"]')).length, 0);
await tab(v, "engage");
const before = (await v.$$('[data-act="engaged"]')).length;
assert.ok(before >= 1, "comptes à faire");
await v.screenshot({ path: "/home/claude/shots/21-engage.png", fullPage: true });
const id = await v.getAttribute('[data-act="engaged"]', "data-id");
await v.fill(`[data-efollowers="${id}"]`, "77");
await v.click(`[data-act="engaged"][data-id="${id}"]`);
await v.waitForTimeout(1200);
assert.equal((await v.$$('[data-act="engaged"]')).length, before - 1, "un de moins à faire");
assert.ok(/Déjà faits aujourd'hui/.test(await v.textContent("body")));
await tab(v, "accounts");
assert.equal((await v.$$('[data-act="engageToggle"]')).length, 0, "VA ne peut pas changer le test");
await tab(v, "stats");
assert.ok(/Test engagement/.test(await v.textContent("body")), "VA voit la comparaison");
assert.equal((await v.$$('[data-act="engagePick"]')).length, 0, "VA ne peut pas tirer");
assert.deepEqual(errs, [], "erreurs JS");
console.log("ENGAGEMENT UI OK ✅");
await br.close();
