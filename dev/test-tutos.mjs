// Verifie les tutos : chaque section SOP et chaque bouton ? pointe vers une video qui existe, la bonne, et qui se charge.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const B = process.env.BASE || "http://localhost:8788";
const PIN = process.env.PIN || "4321";
const br = await chromium.launch();
const p = await br.newPage();
const bad = [];
p.on("response", (r) => { if (/\/help\//.test(r.url()) && r.status() >= 400) bad.push(r.status() + " " + r.url()); });
await p.goto(B);
for (const d of PIN) await p.click(`[data-pin="${d}"]`);
await p.click('[data-pin="go"]');
await p.waitForTimeout(2000);
await p.evaluate(() => [...document.querySelectorAll("a,button")].find((e) => /^\s*Guides \(SOP\)\s*$/.test(e.textContent)).click());
await p.waitForTimeout(800);
const want = {
  complet: "creation.mp4", rotation: "geelark.mp4", numero: "numero.mp4", creation: "compte.mp4", warmup: "warmup.mp4",
  strategies: null, setup: "setup.mp4", metricool: "metricool.mp4", planning: "planning.mp4", engage: null, check: "check.webm", remplacement: "remplacement.webm",
};
const sops = await p.evaluate(() => [...document.querySelectorAll("details.sop")].map((d) => ({ k: d.dataset.sop, t: d.querySelector("summary").textContent.trim(), v: d.querySelector("video")?.getAttribute("src") || null })));
assert.deepEqual(sops.map((s) => s.k), Object.keys(want), "ordre des sections");
for (const s of sops) {
  const f = s.v ? s.v.split("/").pop().split("#")[0] : null;
  assert.equal(f, want[s.k], `section ${s.k} (${s.t}) -> ${f}`);
}
// une seule video longue : le tuto complet, une seule fois
assert.equal(sops.filter((s) => s.v && s.v.includes("creation.mp4")).length, 1, "tuto complet une seule fois");
// chaque video se charge vraiment (metadata)
const loaded = await p.evaluate(async () => {
  const out = {};
  for (const d of document.querySelectorAll("details.sop")) {
    const v = d.querySelector("video");
    if (!v) continue;
    d.open = true;
    v.preload = "auto"; v.load();
    await new Promise((r) => { if (v.readyState >= 1) return r(); v.addEventListener("loadedmetadata", r, { once: true }); v.addEventListener("error", r, { once: true }); setTimeout(r, 8000); });
    out[d.dataset.sop] = { ok: v.readyState >= 1 && !v.error, dur: Math.round(v.duration || 0) };
  }
  return out;
});
for (const [k, r] of Object.entries(loaded)) assert.ok(r.ok && r.dur > 3, `video ${k} ne se charge pas ${JSON.stringify(r)}`);
// boutons ? : on ouvre chaque page, on clique chaque ?, la video de l'aide doit exister
const helps = {};
const tabs = await p.evaluate(() => [...document.querySelectorAll("nav [data-tab], [data-tab]")].map((e) => e.dataset.tab).filter((v, i, a) => a.indexOf(v) === i));
for (const t of tabs) {
  await p.evaluate((t) => document.querySelector(`[data-tab="${t}"]`)?.click(), t);
  await p.waitForTimeout(400);
  const ks = await p.evaluate(() => [...document.querySelectorAll('.qbtn[data-k]')].map((b) => b.dataset.k));
  for (const k of ks) {
    if (helps[k]) continue;
    const v = await p.evaluate(async (k) => {
      document.querySelector(`.qbtn[data-k="${k}"]`).click();
      await new Promise((r) => setTimeout(r, 200));
      const src = document.querySelector("#modal-body video")?.getAttribute("src") || null;
      document.querySelector("#modal").classList.add("hidden");
      if (!src) return [null, 0];
      const r = await fetch(src.split("#")[0], { method: "HEAD" });
      return [src, r.status];
    }, k);
    helps[k] = v;
  }
}
for (const [k, [v, st]] of Object.entries(helps)) if (v) assert.equal(st, 200, `aide ? ${k} -> ${v}`);
assert.ok(Object.keys(helps).length >= 5, "aides trouvées : " + Object.keys(helps).join(","));
assert.deepEqual(bad, [], "fichiers d'aide en erreur");
console.log("sections:", sops.map((s) => `${s.k}=${s.v ? s.v.split("/").pop() : "texte"}`).join(" | "));
console.log("durees:", JSON.stringify(loaded));
console.log("aides ?:", Object.entries(helps).map(([k, [v]]) => `${k}=${v ? v.split("/").pop() : "pas de video"}`).join(" | "));
console.log("TUTOS OK ✅");
await br.close();
