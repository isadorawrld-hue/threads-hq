// Parcours complet dans un vrai navigateur (Playwright) + captures.
import { chromium } from "playwright";
const B = process.env.BASE || "http://localhost:8788";
const OUT = process.env.OUT || "/home/claude/shots";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
async function page(w = 1280, h = 860) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push("console " + m.text()));
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
async function pin(p, code) {
  for (const d of code) await p.click(`[data-pin="${d}"]`);
  await p.click('[data-pin="go"]');
}
const tab = (p, id) => p.click(`.nav[data-tab="${id}"] >> visible=true`);
const waitToast = (p, re) => p.waitForFunction((r) => new RegExp(r).test(document.querySelector("#toast").textContent), re.source, { timeout: 15000 });

// ---- admin : premier acces + reglages
const a = await page();
await a.goto(B);
await a.waitForSelector(".keypad");
await shot(a, "01-login-first");
await pin(a, "4321");
await a.waitForSelector(".bar");
await tab(a, "settings");
await a.fill('[data-sec="rotationUrl"]', "https://rotate.test/x");
await a.fill('[data-sec="mcToken"]', "TOKEN_TEST");
await a.fill('[data-sec="mcUserId"]', "https://app.metricool.com/evolution/web?blogId=1&userId=42");
await a.fill('[data-sec="proxy"]', "http://user:pass@proxy.test:8000");
await a.fill('[data-st="socksPort"]', "17157");
await a.click('[data-act="saveSecrets"]');
await waitToast(a, /Enregistré/);
await a.waitForFunction(() => document.querySelectorAll(".health .tag.ok").length === 3);
await a.fill('[data-st="smsSiteUrl"]', "https://sms.test");
await a.click('[data-act="saveSettings"]');
await waitToast(a, /Réglages enregistrés/);
await a.click('[data-act="testMc"]');
await waitToast(a, /Metricool OK : 3/);
await a.click('[data-act="testIp"]');
await waitToast(a, /Proxy OK/);
await a.fill('[data-u="name"]', "VA");
await a.fill('[data-u="pin"]', "1111");
await a.click('[data-act="saveUser"]');
await waitToast(a, /Accès enregistré/);
await shot(a, "02-settings");
// contenu
await tab(a, "content");
await a.click('[data-act="seed"]');
await waitToast(a, /42 texte/);
await a.selectOption("[data-seedgroup]", "photos");
await a.click('[data-act="seed"]');
await waitToast(a, /42 texte.*Photos/);
await a.selectOption("[data-seedgroup]", "villes");
await a.click('[data-act="seed"]');
await waitToast(a, /42 texte.*Villes/);
await a.fill('[data-set="links"]', "https://tinyurl.com/tw1\nhttps://tinyurl.com/tw2");
for (const k of ["epingle", "lien", "relais"]) await a.fill(`[data-bank="${k}"]`, `Chloé 🦋\n${k} 1\n\nChloé 🌙\n${k} 2`);
await a.fill('[data-set="warmupTargets"]', "https://www.threads.com/@niche_a\n@niche_b\nniche_c\nniche_d\nniche_e\nniche_f");
await a.fill('[data-set="pinnedPost"]', "想認識我更多？點我主頁的連結 💌");
await a.click('[data-act="saveContent"]');
await waitToast(a, /Enregistré/);
// photos (fichier genere)
const { writeFileSync } = await import("node:fs");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
writeFileSync("/tmp/p1.png", png);
await a.click("summary:has-text('Photos')");
await a.setInputFiles('[data-upload="photos"]', "/tmp/p1.png");
await waitToast(a, /1 photo/);
await a.setInputFiles('[data-upload="__pfp"]', "/tmp/p1.png");
await waitToast(a, /1 photo/);
await shot(a, "03-content");

// ---- VA sur mobile
const v = await page(390, 844);
v.on("pageerror", (e) => console.log("  [page error]", e.message));
v.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text()); });
await v.goto(B);
await pin(v, "1111");
await v.waitForSelector(".bar");
await shot(v, "04-va-today");
// bouton ? : ouvre l'explication pas a pas
await v.click(".hint .qbtn");
await v.waitForSelector("#modal:not(.hidden) .helpsteps");
await shot(v, "04b-aide");
await v.click(".modal-x");
await tab(v, "create");
await v.click('main [data-act="rotate"]');
await v.waitForSelector(".alert.c-green");
await shot(v, "05-create-ip");
await v.click('[data-act="wizNext"]');
await v.waitForFunction(() => /Socks5/.test(document.querySelector("main").textContent) && /17157/.test(document.querySelector("main").textContent));
await shot(v, "06-create-geelark");
// en pleine creation, le bouton IP du haut previent au lieu de changer l'IP
const ipBefore = await v.textContent(".ipnow b");
await v.click('header [data-act="rotateGuard"]');
await v.waitForSelector("#modal:not(.hidden) [data-act=\"rotateForce\"]");
if (!/Création en cours/.test(await v.textContent(".ipnow small"))) throw new Error("indicateur création absent");
await shot(v, "06b-ip-garde");
await v.click('#modal [data-act="closeModal"]');
if ((await v.textContent(".ipnow b")) !== ipBefore) throw new Error("l'IP a changé alors qu'on l'a gardée");
await v.fill('[data-f="geelarkProfile"]', "profil 1");
await v.click('[data-act="wizNext"]');
await v.fill('[data-f="phone"]', "+886 912 345 678");
await v.click('[data-act="wizNext"]');
// pseudo propose par la banque : Utiliser remplit le champ, Un autre en change
const sug1 = await v.textContent(".pseudosug b");
if (!/c\.?hloe/.test(sug1)) throw new Error("pas de pseudo proposé : " + sug1);
await v.click('[data-act="otherPseudo"]');
const sug2 = await v.textContent(".pseudosug b");
if (sug2 === sug1) throw new Error("« Un autre » ne change pas le pseudo");
await v.click('[data-act="usePseudo"]');
if ((await v.inputValue('[data-f="pseudo"]')) !== sug2) throw new Error("« Utiliser » ne remplit pas le pseudo");
await shot(v, "06g-pseudo-banque");
await v.fill('[data-f="pseudo"]', "taipei_lily");
await v.click('[data-act="genPass"]');
await v.click('[data-act="wizNext"]');
await shot(v, "07-create-works");
// d'abord un echec
await v.click('[data-act="wizFail"]');
await v.click('[data-act="wizFailSend"]');
await waitToast(v, /Noté/);
// l'admin branche Hero SMS
await tab(a, "settings");
await a.fill('[data-sec="heroToken"]', "HERO_TEST");
await a.click('[data-act="saveSecrets"]');
await waitToast(a, /Enregistré/);
// on refait, cette fois le numero vient de Hero SMS
await v.reload();
await v.waitForSelector(".bar");
await tab(v, "create");
await v.click('main [data-act="rotate"]');
await waitToast(v, /Nouvelle IP/);
await v.click('[data-act="wizNext"]');
await v.fill('[data-f="geelarkProfile"]', "profil 2");
await v.click('[data-act="wizNext"]');
await v.waitForSelector('[data-act="wizMode"][data-v="phone"]');
await v.click('[data-act="wizMode"][data-v="phone"]');
await v.waitForSelector('[data-act="smsBuy"]');
await v.waitForFunction(() => /934 dispo/.test(document.body.textContent));
await shot(v, "06b-sms-choix");
await v.click('[data-act="smsBuy"][data-v="78"]');
await waitToast(v, /Numéro pris/);
await v.waitForSelector("[data-smswait]");
await shot(v, "06c-sms-attente");
await fetch(`${B}/__dev/sms?code=482913`);
await v.waitForFunction(() => /482913/.test(document.body.textContent), null, { timeout: 15000 });
await shot(v, "06d-sms-code");
await v.click('[data-act="wizNext"]');
await v.waitForFunction(() => /482913/.test(document.body.textContent));
await v.fill('[data-f="pseudo"]', "taipei_lily");
await v.click('[data-act="genPass"]');
await v.click('[data-act="wizNext"]');
await v.click('[data-act="wizCreate"]');
await v.waitForSelector(".timer");
await v.waitForFunction(() => /Suis ces 5 comptes/.test(document.body.textContent) && /niche_a|niche_b|niche_c/.test(document.body.textContent) && !/threads\.com\/@niche/.test(document.querySelector("main").textContent));
await shot(v, "08-warmup");
await v.click('[data-act="warmupDone"]');
await waitToast(v, /Coche/);
for (const c of await v.$$('[data-wcheck] input')) await c.check();
await v.click('[data-act="warmupDone"]');
await waitToast(v, /Warm-up validé/);

// ---- onglet Numéro : prendre un numéro puis se faire rembourser
await tab(v, "numero");
await v.waitForFunction(() => /934 dispo/.test(document.body.textContent));
await shot(v, "06e-numero");
await v.click('[data-act="smsBuy"][data-v="78"]');
await waitToast(v, /Numéro pris/);
await v.waitForSelector("[data-smswait]");
await v.click('[data-act="smsCancel"]');
await waitToast(v, /Remboursé/);
await v.waitForSelector('[data-act="smsBuy"][data-v="78"]');
await v.waitForFunction(() => /Remboursé/.test(document.querySelector("main").textContent));
await shot(v, "06f-numero-rembourse");
await tab(v, "setup");

// ---- la VA enchaîne direct sur le setup (ouvert automatiquement)
await v.waitForSelector("[data-setupbio]");
await shot(v, "09-setup");
for (const c of await v.$$("[data-scheck] input")) await c.check();
await v.click('[data-act="setupDone"]');
await waitToast(v, /Setup fini/);

// ---- apres le setup : onglet Metricool ouvert, marque creee, lien de connexion affiche
await v.waitForSelector('[data-act="mcVerify"]');
await shot(v, "10-metricool");
const mcLink = await v.$eval('[data-act="mcVerify"]', (el) => el.closest(".card").querySelector(".copyline .v").textContent);
const blogId = mcLink.replace("https://f.mtr.cool/TEST", "");
await v.click('[data-act="mcVerify"]');
await waitToast(v, /pas encore connecté/);
await fetch(`${B}/__dev/connect?blogId=${blogId}&username=taipei_lily`);
await v.click('[data-act="mcVerify"]');
await waitToast(v, /post\(s\) programmé/);
await v.waitForSelector(".mnav .nav.on");
await shot(v, "11-metricool-active");
// planning 14 jours : remplir, puis ouvrir le detail d'un jour
await tab(v, "planning");
await v.waitForSelector("table.plan");
await v.click('[data-act="planAll"]');
await waitToast(v, /post\(s\) programmé/);
await v.waitForSelector("table.plan td.pc .pd");
await shot(v, "11b-planning");
await v.click("table.plan td.pc[data-act=dayPosts] >> nth=3");
await v.waitForSelector("#modal:not(.hidden)");
await shot(v, "11c-planning-jour");
await v.click(".modal-x");
await tab(v, "metricool");
await v.click('[data-act="manual"]');
await v.waitForSelector("#modal:not(.hidden)");
await shot(v, "12-manual");
await v.click(".modal-x");

// ---- check du matin + saute
await tab(v, "check");
await shot(v, "13-check");
await v.click('[data-act="dead"]');
await v.click('[data-act="deadConfirm"]');
await waitToast(v, /Créer pour le remplacer/);
await tab(v, "today");
await shot(v, "14-today-after-dead");
// le compte saute passe en priorite n° 1
const first = await v.$eval(".task.first b", (el) => el.textContent);
if (!/Remplacer 1 compte/.test(first)) errors.push("priorité 1 attendue : remplacer, vu : " + first);
await tab(v, "accounts");
await v.click('[data-filter="tous"]');
await shot(v, "15-accounts");
await tab(v, "stats");
await shot(v, "15b-stats");
await tab(v, "sop");
await shot(v, "16-sop");

// ---- dashboard admin
await a.reload();
await a.waitForSelector(".bar");
await tab(a, "dash");
await a.click('[data-act="health"]');
await a.waitForTimeout(800);
await shot(a, "17-dash");

// ---- stock de comptes achetes : Awen glisse le fichier, la VA prend un compte, tout se remplit (2FA comprise)
await a.reload();
await a.waitForSelector(".bar");
await tab(a, "settings");
await a.setInputFiles("#stockFiles", { name: "1000002.txt", mimeType: "text/plain", buffer: Buffer.from("Заказ: 1000002\nhttps://darkstore.contact\n\nbought_lily\tAchat123!\tJBSW Y3DP EHPK 3PXP\nbought_rose\tRose456!\tGEZD GNBV GY3T QOJQ\n") });
await a.click('[data-act="stockImport"]');
await waitToast(a, /2 compte\(s\) ajouté/);
await a.waitForFunction(() => /2 en stock/.test(document.querySelector("main").textContent));
await shot(a, "18a-stock-import");

await v.reload();
await v.waitForSelector(".bar");
await tab(v, "create");
// stock non vide : « J'ai déjà un compte » choisi tout seul
await v.waitForFunction(() => /Connecter un compte existant/.test(document.querySelector("main").textContent) && /Étape 1 sur 4/.test(document.querySelector("main").textContent));
await v.click('main [data-act="rotate"]');
await waitToast(v, /Nouvelle IP/);
await v.waitForSelector(".alert.c-green");
await v.click('[data-act="wizNext"]');
await v.fill('[data-f="geelarkProfile"]', "profil achat 1");
await v.click('[data-act="wizNext"]');
// etape 3 : compte pris dans le stock tout seul
await v.waitForFunction(() => /pris dans le stock/.test(document.querySelector("main").textContent), null, { timeout: 10000 });
if ((await v.inputValue('[data-f="pseudo"]')) !== "bought_lily") throw new Error("identifiant pas rempli");
if ((await v.inputValue('[data-f="password"]')) !== "Achat123!") throw new Error("mot de passe pas rempli");
await v.waitForFunction(() => /^\d{6}$/.test(document.querySelector('[data-totp="__wiz"]').textContent), null, { timeout: 5000 });
const wizCode = await v.textContent('[data-totp="__wiz"]');
const expCode = await v.evaluate(() => totpCodeForTest("JBSWY3DPEHPK3PXP"));
if (wizCode !== expCode) throw new Error(`code 2FA ${wizCode} attendu ${expCode}`);
await shot(v, "18-achat-connexion");
// cle abimee a la main : refusee
await v.fill('[data-f="totp"]', "pas une clé !!");
await v.click('[data-act="wizNext"]');
await waitToast(v, /Clé 2FA invalide/);
await v.fill('[data-f="totp"]', "JBSWY3DPEHPK3PXP");
await v.click('[data-act="wizNext"]');
await v.waitForFunction(() => /Tu es connectée/.test(document.querySelector("main").textContent) && /^\d{6}$/.test(document.querySelector('[data-totp="__wiz"]').textContent));
await shot(v, "19-achat-confirme");
await v.click('[data-act="wizCreate"]');
await v.waitForSelector(".timer");
const bought = await (await fetch(`${B}/__dev/acc?pseudo=bought_lily`)).json();
if (!bought || !bought.bought || bought.totp !== "JBSWY3DPEHPK3PXP" || bought.password !== "Achat123!" || bought.phone || bought.geelarkProfile !== "profil achat 1") throw new Error("compte acheté mal enregistré : " + JSON.stringify(bought));
await a.reload();
await a.waitForSelector(".bar");
await tab(a, "settings");
await a.waitForFunction(() => /1 en stock/.test(document.querySelector("main").textContent) && /1 utilisés/.test(document.querySelector("main").textContent));

await browser.close();
if (errors.length) {
  console.log("ERREURS NAVIGATEUR :\n" + errors.join("\n"));
  process.exit(1);
}
console.log("UI OK ✅ captures dans " + OUT);
