// Parcours navigateur des branchements du 8 nov. (après dev/test-api.mjs, même serveur) :
// IP grillée rechangée toute seule, scan anti-nudité réel (NSFWJS) à l'envoi et après coup, taux du jour en compta.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const B = process.env.BASE || "http://localhost:8788";
const OUT = process.env.OUT || "/home/claude/shots";
mkdirSync(OUT, { recursive: true });
const FIX = new URL("./fixtures/paysage.jpg", import.meta.url).pathname;
const browser = await chromium.launch();
const errors = [];
async function page() {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !/404|ERR_TUNNEL/.test(m.text()) && errors.push("console " + m.text()));
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const tab = async (p, id) => {
  if (!(await p.locator(`[data-tab="${id}"]:visible`).count())) await p.click(`.nav[data-members~="${id}"] >> visible=true`);
  await p.click(`[data-tab="${id}"]:visible >> nth=0`);
};
const waitToast = (p, re, timeout = 20000) => p.waitForFunction((r) => new RegExp(r).test(document.querySelector("#toast").textContent), re.source, { timeout }).catch(async (e) => { console.log("TOAST =", await p.$eval("#toast", (x) => x.textContent)); throw e; });
async function login(p, name, pass) {
  await p.goto(B);
  await p.fill("#lg-name", name);
  await p.fill("#lg-pass", pass);
  await p.click("#loginform button[type=submit]");
  await p.waitForSelector(".bar");
}
const api = async (path, body, tok) => (await fetch(B + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: body ? JSON.stringify(body) : undefined })).json();
const awenTok = (await api("login", { name: "Awen", password: "lune-rouge-4321" })).token;
await api("settings", { ipProfile: "fr" }, awenTok);

// ---- VA : 2 IP de datacenter d'affilée, le CRM rechange tout seul
const v = await page();
await login(v, "VA", "nuage-vert-1111");
await tab(v, "create");
await fetch(B + "/__dev/ipq?v=hosting&n=2");
await v.click('main [data-act="rotate"]');
await waitToast(v, /2 IP grillée\(s\) sautée\(s\)/);
assert.equal((await (await fetch(B + "/__ipq")).json()).left, 0, "les 2 IP grillées ont été lues");
await v.waitForSelector("main .alert.c-green");
assert.match(await v.textContent("main .alert.c-green"), /ip résidentielle, SFR/);
await shot(v, "pa-01-ip-propre");
// 3 IP grillées de suite : on garde la 3e, message clair, étape suivante bloquée
await fetch(B + "/__dev/ipq?v=hosting&n=3");
await v.click('main [data-act="rotate"]');
await waitToast(v, /3 fois de suite/);
await v.waitForSelector("main .alert.c-red");
assert.match(await v.textContent("main .alert.c-red"), /datacenter/);
assert.equal(await v.isDisabled('main [data-act="wizNext"]'), true, "pas d'étape suivante sur une IP de datacenter");
await shot(v, "pa-02-ip-grillee");
console.log("✓ IP grillée : rechangée toute seule, bloquée si ça persiste");

// ---- admin : scan anti-nudité
const a = await page();
await login(a, "Awen", "lune-rouge-4321");
await tab(a, "content");
await a.waitForSelector(".nscard");
const grp = await a.$eval("input[data-upload]:not([data-upload='__pfp'])", (x) => x.dataset.upload);
await a.click(`summary:has-text("Photos (")`);
// 1. vrai scan NSFWJS sur un paysage : ok, pas d'étiquette
await a.setInputFiles(`input[data-upload="${grp}"]`, FIX);
await waitToast(a, /1 photo\(s\) ajoutée\(s\)$/, 90000);
let media = (await api("state", null, awenTok)).media;
const real = media.find((m) => m.group === grp);
assert.equal(real.nsfwV, "ok", "paysage scanné par le vrai modèle : ok");
// 2. photo jugée nue (faux scan) : bloquée, étiquette, puis autorisée
await a.evaluate(() => (window.__nsfwFake = () => ({ porn: 0.93, hentai: 0.01, sexy: 0.04 })));
await a.setInputFiles(`input[data-upload="${grp}"]`, FIX);
await waitToast(a, /bloquée\(s\) pour nudité/);
await a.click(`summary:has-text("Photos (")`).catch(() => {});
await a.waitForSelector(".thumbs figure.blocked .nsb.bloquee");
await shot(a, "pa-03-photo-bloquee");
await a.click('.thumbs figure.blocked [data-act="nsfwAllow"]');
await waitToast(a, /Photo autorisée/);
media = (await api("state", null, awenTok)).media;
assert.equal(media.filter((m) => m.nsfwV === "bloquee" && m.nsfwOk).length, 1);
// 3. photo envoyée sans scan : bouton « Scanner », vrai modèle
await a.evaluate(() => delete window.__nsfwFake);
const b64 = (await import("node:fs")).readFileSync(FIX).toString("base64");
await api("media/upload", { group: grp, dataUrl: "data:image/jpeg;base64," + b64, filename: "sans-scan.jpg" }, awenTok);
await a.reload();
await a.waitForSelector(".bar");
await tab(a, "content");
await a.waitForSelector('[data-act="nsfwScanAll"]');
const todo = Number((await a.textContent('[data-act="nsfwScanAll"]')).match(/Scanner (\d+) photo/)[1]);
assert.ok(todo >= 1, "la photo sans scan est comptée");
await a.click('[data-act="nsfwScanAll"]');
await waitToast(a, new RegExp(`^${todo} photo\\(s\\) scannée\\(s\\)`), 90000);
media = (await api("state", null, awenTok)).media;
assert.equal(media.filter((m) => !m.nsfwV).length, 0, "plus aucune photo pas scannée");
await shot(a, "pa-04-scan-fait");
console.log("✓ scan anti-nudité : vrai modèle à l'envoi, blocage, autoriser, scan après coup");

// ---- compta : taux du jour
await api("compta/settings", { auto: true }, awenTok);
await tab(a, "compta");
await a.waitForSelector("main .lead");
assert.match(await a.textContent("main .lead"), /1 \$ = 0,8969 €, taux du jour du 08\/11\/2026/);
await a.fill("[data-cusd]", "0,95");
await a.click('[data-act="cRate"]');
await waitToast(a, /Taux fixé à la main/);
assert.match(await a.textContent("main .lead"), /0,95 €, fixé à la main/);
await a.click('[data-act="cRateAuto"]');
await waitToast(a, /Taux du jour remis/);
assert.match(await a.textContent("main .lead"), /0,8969/);
await shot(a, "pa-05-compta-taux");
console.log("✓ compta : taux du jour, à la main, retour au taux du jour");

await browser.close();
if (errors.length) {
  console.log("ERREURS NAVIGATEUR :\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\nPARCOURS PUBLIC-APIS VERT ✅");
