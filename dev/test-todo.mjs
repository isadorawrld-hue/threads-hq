// Teste la liste « À faire » des admins (API + écran). À lancer après dev/test-api.mjs, sur le même serveur.
import { chromium } from "playwright";
const B = "http://localhost:8788";
const ok = (c, m) => { if (!c) { console.error("✗", m); process.exit(1); } };
const login = async (name, password) => (await (await fetch(B + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password }) })).json()).token;
const call = async (tok, path, body) => { const r = await fetch(B + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const awen = await login("Awen", "lune-rouge-4321");
const bilot = await login("Bilot", "soleil-bleu-5555");
const va = await login("VA", "nuage-vert-1111");

ok((await call(va, "todo")).status === 403, "la VA n'a pas accès");
ok((await call(va, "todo/save", { text: "x", who: "Tous" })).status === 403, "la VA ne peut pas ajouter");
ok((await call(awen, "todo/save", { text: "  ", who: "Tous" })).status === 400, "texte vide refusé");
ok((await call(awen, "todo/save", { text: "x", who: "VA" })).status === 400, "une VA n'est pas un admin");
ok((await call(awen, "todo/save", { text: "x", who: "Tous", due: "2026-13-40" })).status === 400, "date invalide refusée");
console.log("✓ accès et saisies invalides");

let r = await call(awen, "todo/save", { text: "Payer Sandra", who: "Bilot", due: "2026-01-02" });
ok(r.status === 200 && r.data.todos.some((x) => x.text === "Payer Sandra"), "ajout " + JSON.stringify(r));
await call(bilot, "todo/save", { text: "Acheter 10 comptes", who: "Tous" });
r = await call(bilot, "todo");
ok(r.data.todos.length === 2 && r.data.todos[0].text === "Payer Sandra", "partagé entre admins, échéance en premier");
const id = r.data.todos[0].id;
r = await call(bilot, "todo/save", { id, text: "Payer Sandra (semaine 44)", who: "Bilot", due: "2026-01-02" });
ok(r.data.todos.find((x) => x.id === id).text.includes("semaine 44"), "modification");
r = await call(bilot, "todo/done", { id, done: true });
const d = r.data.todos.find((x) => x.id === id);
ok(d.done && d.doneBy === "Bilot" && r.data.todos[r.data.todos.length - 1].id === id, "fait, rangé en bas");
const st = await call(awen, "state");
ok(Array.isArray(st.data.todos) && st.data.todos.length === 2, "dans l'état admin");
ok(!("todos" in (await call(va, "state")).data), "pas dans l'état de la VA");
console.log("✓ ajout, modification, fait, partage");

// écran
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(B);
await p.evaluate((t) => { localStorage.setItem("hq_token", t); localStorage.setItem("hq_tab", "today"); }, awen);
await p.goto(B);
await p.waitForSelector("text=à faire entre admins");
await p.click('.nav[data-tab="todo"] >> visible=true');
await p.fill('[data-t="text"]', "Créer VAULT_SECRET dans Netlify");
await p.selectOption('[data-t="who"]', "Awen");
await p.press('[data-t="text"]', "Enter");
await p.waitForSelector(".todo >> text=Créer VAULT_SECRET");
await p.locator(".todo", { hasText: "Créer VAULT_SECRET" }).locator("input[type=checkbox]").click();
await p.waitForSelector("details >> text=Déjà fait");
await p.click('[data-act="tFilter"][data-f="all"]');
await p.waitForSelector(".todo >> text=Acheter 10 comptes");
ok(!errs.length, "pas d'erreur JS : " + errs.join(", "));
await br.close();
const del = await call(awen, "todo/delete", { id });
ok(!del.data.todos.some((x) => x.id === id), "suppression");
console.log("✓ écran : ajout avec Entrée, coché, filtre, suppression");
