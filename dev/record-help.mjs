// Enregistre les mini videos d'aide (cote CRM) dans public/help/<cle>.webm.
// Serveur neuf obligatoire : FAKE_IP=HK node dev/server.mjs, puis node dev/record-help.mjs
// Une seule session navigateur filmee, decoupee ensuite en clips avec ffmpeg.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";

const B = process.env.BASE || "http://localhost:8788";
const OUT = new URL("../public/help/", import.meta.url).pathname;
const TMP = process.env.TMP_DIR || "/tmp/help-rec";
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

async function call(path, body, tok) {
  const r = await fetch(B + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + (tok || "") }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status >= 300) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}

// ---- donnees de depart (fictives, neutres)
const admin = (await call("login", { pin: "4321", name: "Manager" })).token;
await call("users", { name: "VA", pin: "1111", role: "va" }, admin);
await call("secrets", { rotationUrl: "https://rotate.test/x", mcToken: "TOKEN_TEST", mcUserId: "42", heroToken: "HERO_TEST" }, admin);
await call("settings", {
  proxy: "proxy.test:8000:user:pass",
  bioBank: { epingle: ["Lily · 21\nTaipei girl, say hi in my pinned post"], lien: ["Lily · 21\nTap the link"], relais: ["Lily · 21"] },
  hub: { pseudo: "lily_main", postUrl: "" },
  pinnedPost: "Want to know me better? Tap the link on my profile",
  pinnedReply: "{lien}",
  links: ["https://tinyurl.com/lily-a", "https://tinyurl.com/lily-b", "https://tinyurl.com/lily-c", "https://tinyurl.com/lily-d"],
  reserveTarget: 3,
}, admin);
{
  const { readFileSync } = await import("node:fs");
  const list = JSON.parse(readFileSync(new URL("../public/seed-textes.json", import.meta.url)));
  const st = await call("state", null, admin);
  const g = st.settings.groups.find((x) => !x.withPhoto) || st.settings.groups[0];
  await call("texts/bulk", { group: g.id, lines: list.map((x) => `${x.text} || ${x.fr}`).join("\n") }, admin);
}
const va = (await call("login", { pin: "1111" })).token;
async function makeActive(pseudo) {
  await call("rotate", {}, va);
  const a = await call("accounts/create", { pseudo, phone: "+852 9" + Math.floor(1e6 + Math.random() * 8e6), password: "Pw" + pseudo }, va);
  await call(`accounts/${a.id}/warmup`, {}, va);
  await call(`accounts/${a.id}/setup`, { bio: "bio" }, va);
  const c = await call(`accounts/${a.id}/mcconnect`, {}, va);
  const blogId = c.blogId || (await call("state", null, va)).accounts.find((x) => x.id === a.id).blogId;
  await fetch(`${B}/__dev/connect?blogId=${blogId}&username=${pseudo}`);
  await call(`accounts/${a.id}/mcverify`, {}, va);
  return { ...a, blogId };
}
const accA = await makeActive("mei.daily");
const accB = await makeActive("yuna.tw");

// ---- navigateur filme
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 }, recordVideo: { dir: TMP, size: { width: 1100, height: 720 } }, permissions: ["clipboard-read", "clipboard-write"] });
const p = await ctx.newPage();
const t0 = Date.now();
const marks = [];
const start = (k) => marks.push({ k, from: (Date.now() - t0) / 1000 });
const stop = () => (marks[marks.length - 1].to = (Date.now() - t0) / 1000);
const wait = (ms) => p.waitForTimeout(ms);

// legende en bas + curseur visible
async function overlay() {
  await p.evaluate(() => {
    if (document.getElementById("cap")) return;
    const st = document.createElement("style");
    st.textContent = `#cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:80%;background:rgba(10,10,10,.88);color:#fff;font:600 20px/1.35 system-ui,sans-serif;padding:12px 20px;border-radius:10px;z-index:99;text-align:center;transition:opacity .2s}
#cap:empty{opacity:0}#cur{position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(37,69,245,.35);border:2px solid #2545f5;z-index:100;pointer-events:none;transform:translate(-50%,-50%);transition:left .5s ease,top .5s ease}
#cur.tap{background:rgba(37,69,245,.8)}`;
    document.head.appendChild(st);
    const c = document.createElement("div"); c.id = "cap"; document.body.appendChild(c);
    const k = document.createElement("div"); k.id = "cur"; k.style.left = "550px"; k.style.top = "360px"; document.body.appendChild(k);
  });
}
async function say(text, ms = 1800) {
  await overlay();
  await p.evaluate((t) => (document.getElementById("cap").textContent = t), text);
  await wait(ms);
}
async function point(sel) {
  await overlay();
  const el = p.locator(sel).filter({ visible: true }).first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await p.evaluate(([x, y]) => { const c = document.getElementById("cur"); c.style.left = x + "px"; c.style.top = y + "px"; }, [b.x + b.width / 2, b.y + b.height / 2]);
  await wait(650);
  return el;
}
async function tap(sel, after = 900) {
  const el = await point(sel);
  await p.evaluate(() => document.getElementById("cur").classList.add("tap"));
  await el.click();
  await wait(150);
  await p.evaluate(() => document.getElementById("cur")?.classList.remove("tap"));
  await wait(after);
}
async function typeIn(sel, text) {
  await point(sel);
  await p.locator(sel).first().fill("");
  await p.locator(sel).first().pressSequentially(text, { delay: 60 });
  await wait(400);
}
const tab = (id) => tap(`.nav[data-tab="${id}"]`, 1100);
const cleanToast = () => p.evaluate(() => { const t = document.querySelector("#toast"); if (t) t.className = ""; });

// login
await p.goto(B);
for (const d of "1111") await p.click(`[data-pin="${d}"]`);
await p.click('[data-pin="go"]');
await p.waitForSelector(".bar");
await wait(600);

// 1. ta journee
start("today");
await say("Ta page d'accueil : les tâches sont triées par importance.", 2600);
await point(".task.first");
await say("La n° 1 est toujours la plus urgente. Fais-la d'abord.", 2600);
await point(".hint .qbtn");
await say("Tu bloques ? Le bouton « ? » explique pas à pas.", 2400);
stop();

// 2. IP
await tab("create");
start("rotation");
await say("Avant chaque compte : une IP neuve.", 2000);
await tap('main [data-act="rotate"]', 400);
await say("Clique « Changer l'IP » et attends.", 1000);
await p.waitForSelector("main .alert.c-green");
await point("main .alert.c-green");
await say("IP en vert : c'est bon. Étape suivante.", 2200);
await tap('[data-act="wizNext"]', 600);
stop();

// 3. GeeLark (cote CRM : le proxy a copier)
start("geelark");
await say("Dans GeeLark : nouveau profil. Le proxy se copie d'ici.", 2600);
for (const k of ["Hôte", "Port", "Utilisateur", "Mot de passe"]) {
  await tap(`.copyline:has(.k:text-is("${k}")) [data-act="copy"]`, 500);
  await say(`Copie « ${k} », colle-le dans GeeLark.`, 1300);
  await cleanToast();
}
await typeIn('[data-f="geelarkProfile"]', "profil 12");
await say("Note le nom du profil GeeLark. Puis étape suivante.", 2000);
await tap('[data-act="wizNext"]', 800);
stop();

// 4. numero + code SMS
start("numero");
await p.waitForFunction(() => /dispo/.test(document.body.textContent), null, { timeout: 15000 });
await say("Clique « Numéro Hong Kong ».", 1500);
await tap('[data-act="smsBuy"][data-v="14"]', 1200);
await point('.copyline:has(.k:text-matches("Sans indicatif")) [data-act="copy"]');
await say("Dans Instagram : indicatif +852, puis colle ce numéro.", 2600);
await say("Le code SMS arrive ici tout seul.", 1500);
await fetch(`${B}/__dev/sms?code=482913`);
await p.waitForFunction(() => /482913/.test(document.body.textContent), null, { timeout: 15000 });
await cleanToast();
await tap('main .alert.c-green [data-act="copy"]', 500);
await say("Copie le code, colle-le dans Instagram.", 2200);
await cleanToast();
await tap('[data-act="wizNext"]', 800);
stop();

// 5. compte Instagram + Threads
start("compte");
await say("Note le pseudo choisi dans Instagram.", 1600);
await typeIn('[data-f="pseudo"]', "lily.tw");
await tap('[data-act="genPass"]', 500);
await say("« Générer » : utilise CE mot de passe dans Instagram.", 2400);
await tap('[data-act="wizNext"]', 800);
await say("Tu vois le fil Threads sans blocage ? Le compte marche.", 2400);
await tap('[data-act="wizCreate"]', 1200);
stop();

// 6. warm-up (cote CRM)
start("warmup");
await p.waitForSelector("[data-wcheck]");
await cleanToast();
await say("Warm-up : même téléphone, même IP, dans la niche.", 2400);
for (const c of await p.$$("[data-wcheck] input")) { await c.check(); await wait(350); }
await say("Coche chaque point, puis « Warm-up fini ».", 1800);
await tap('[data-act="warmupDone"]', 1200);
stop();

// 7. setup
start("setup");
await p.waitForSelector("[data-setupbio]");
await cleanToast();
await say("Setup : la carte grise dit la stratégie du compte.", 2400);
await tap('[data-act="copyBio"]', 500);
await say("Copie la bio, colle-la dans Threads telle quelle.", 2000);
await cleanToast();
const linkBtn = p.locator('.card:has(.stepnum:text-matches("Lien")) [data-act="copy"]');
if (await linkBtn.count()) { await tap('.card:has(.stepnum:text-matches("Lien")) [data-act="copy"]', 500); await say("Le lien se copie aussi d'ici.", 1600); await cleanToast(); }
for (const c of await p.$$("[data-scheck] input")) { await c.check(); await wait(350); }
await say("Coche ce que tu as fait, puis « Setup fini ».", 1800);
await tap('[data-act="setupDone"]', 1500);
stop();

// 8. Metricool
start("metricool");
await p.waitForSelector('[data-act="mcVerify"]');
await cleanToast();
const card = '.card.acc:has([data-act="mcVerify"])';
await tap(`${card} .copyline [data-act="copy"]`, 500);
await say("Copie le lien. Ouvre-le dans le navigateur du téléphone GeeLark.", 2800);
await cleanToast();
await say("Connect a Threads account, Continue with Instagram, accepte tout.", 2800);
const link = await p.locator(`${card} .copyline .v`).first().textContent();
await fetch(`${B}/__dev/connect?blogId=${link.replace(/.*TEST/, "")}&username=lily.tw`);
await tap('[data-act="mcVerify"]', 1800);
await say("Le CRM vérifie et programme 3 jours de posts tout seul.", 2600);
stop();

// 9. reconnecter (Threads deconnecte d'une marque)
await fetch(`${B}/__dev/connect?blogId=${accA.blogId}&username=`);
await call("metricool/health", {}, admin);
await p.reload();
await p.waitForSelector(".bar");
await tab("today");
start("reconnect");
await say("Un compte ne poste plus : il passe en n° 1.", 2400);
await tap(".task.first .btn", 1200);
await say("Ouvre son profil : il vit encore ? Clique « Reconnecter ».", 2600);
await tap('.card.urgent [data-act="mcConnect"]', 1500);
await cleanToast();
await say("Même chose qu'une connexion : le lien dans le téléphone GeeLark du compte.", 3000);
await fetch(`${B}/__dev/connect?blogId=${accA.blogId}&username=${accA.pseudo.replace("@", "")}`);
await tap(`.card.acc:has([data-act="mcVerify"]) [data-act="mcVerify"]`, 1800);
await say("Reconnecté : les posts repartent.", 2200);
stop();

// 10. check du matin + 11. remplacement
await tab("check");
start("check");
await say("Chaque matin : ouvre chaque profil.", 2000);
await point('[data-act="check"][data-st="actif"]');
await say("Il marche et ses posts sortent : OK.", 2000);
await point('[data-act="check"][data-st="shadowban"]');
await say("Ses posts ne se voient plus d'un autre compte : Shadowban.", 2400);
await point('[data-act="dead"]');
await say("Suspendu ou vérification impossible : Sauté.", 2200);
stop();
start("remplacement");
await tap('[data-act="dead"]', 900);
await say("Le CRM annule ses posts et libère sa marque Metricool.", 2600);
await tap('[data-act="deadConfirm"]', 1200);
await cleanToast();
await tab("today");
await say("Remplacer passe en n° 1. On le fait tout de suite.", 2400);
await tap(".task.first .btn", 1200);
await say("Le nouveau compte reprend sa place, sa marque et son lien.", 2800);
stop();

await ctx.close();
await browser.close();

// ---- decoupe en clips, compresses
const raw = readdirSync(TMP).find((f) => f.endsWith(".webm"));
for (const m of marks) {
  const out = `${OUT}${m.k}.webm`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(Math.max(0, m.from - 0.2)), "-to", String(m.to + 0.3), "-i", `${TMP}/${raw}`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "42", "-row-mt", "1", "-an", out]);
  console.log("clip", m.k, (m.to - m.from).toFixed(1) + " s");
}
console.log("OK : " + marks.map((m) => m.k).join(", "));
