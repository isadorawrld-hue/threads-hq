// Coeur du CRM : toutes les routes /api/*.
// Le stockage et le reseau sont injectes (Netlify Blobs en prod, memoire en test).

const enc = new TextEncoder();
const TZ_DEFAULT = "Asia/Taipei";
const MC = "https://app.metricool.com/api";

export const STATUS = {
  warmup: "Warm-up en cours",
  attente_setup: "Attend le setup (J+1)",
  setup_ok: "Setup fait",
  actif: "Actif sur Metricool",
  shadowban: "Shadowban",
  restreint: "Restreint",
  saute: "Sauté",
};
export const STRATEGY = {
  epingle: "Post épinglé avec le lien",
  lien: "Lien direct dans la bio",
  relais: "Relais du post épinglé du compte pivot",
};
const ALIVE = ["warmup", "attente_setup", "setup_ok", "actif", "shadowban", "restreint"];

const DEFAULT_SETTINGS = {
  timezone: TZ_DEFAULT,
  postsPerDay: 3,
  slots: ["08:00", "12:30", "20:30"],
  jitterMin: 25,
  reserveTarget: 3,
  warmupHours: 24,
  proxy: "",
  smsSiteUrl: "",
  geelarkUrl: "https://www.geelark.com/",
  metricoolUrl: "https://app.metricool.com/",
  pinnedPost: "",
  pinnedReply: "",
  model: { name: "Chloé", link: "" },
  tinyDomain: "chauna.live",
  bios: [],
  bioBank: { epingle: [], lien: [], relais: [] },
  strategies: { epingle: 5, lien: 5, relais: 5 },
  hub: { pseudo: "", postUrl: "" },
  links: [],
  groups: [
    { id: "textes", name: "Textes", withPhoto: false, color: "#ffd6e8" },
    { id: "photos", name: "Photos", withPhoto: true, color: "#d6ecff" },
    { id: "villes", name: "Villes", withPhoto: false, color: "#dcf7e3" },
  ],
  videos: {},
  sopExtra: "",
};

// ------------------------------------------------------------ outils
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (msg, status = 400) => json({ error: msg }, status);
const nowIso = () => new Date().toISOString();
const rid = (n = 10) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
};
const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
async function sha(s) {
  return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function parseProxy(p) {
  if (!p) return null;
  const s = p.trim().replace(/^https?:\/\//, "");
  if (s.includes("@")) {
    const [cred, hp] = s.split("@");
    const [user, pass] = cred.split(":");
    const [host, port] = hp.split(":");
    return { host, port, user, pass };
  }
  const [host, port, user, pass] = s.split(":");
  if (!host || !port) return null;
  return { host, port, user: user || "", pass: pass || "" };
}
export function proxyUrl(p) {
  const x = parseProxy(p);
  if (!x) return null;
  const auth = x.user ? `${encodeURIComponent(x.user)}:${encodeURIComponent(x.pass)}@` : "";
  return `http://${auth}${x.host}:${x.port}`;
}
// Date locale "YYYY-MM-DDTHH:mm:00" dans un fuseau, et l'instant UTC correspondant.
function tzParts(date, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute };
}
function localToUtc(y, m, d, h, mi, tz) {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = tzParts(new Date(guess), tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Date.UTC(y, m - 1, d, h, mi);
    guess -= diff;
  }
  return new Date(guess);
}
const pad = (n) => String(n).padStart(2, "0");
export const todayLocal = (tz) => {
  const p = tzParts(new Date(), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

// ------------------------------------------------------------ stockage
async function getSettings(store) {
  const s = (await store.get("settings")) || {};
  return { ...structuredClone(DEFAULT_SETTINGS), ...s };
}
async function saveSettings(store, s) {
  await store.set("settings", s);
}
async function getSecrets(store) {
  return (await store.get("secrets")) || {};
}
async function listJson(store, prefix) {
  const keys = await store.list(prefix);
  const out = await Promise.all(keys.map((k) => store.get(k)));
  return out.filter(Boolean);
}
async function log(store, who, action, details = {}) {
  const at = nowIso();
  const entry = { id: rid(6), at, who: who?.name || "systeme", role: who?.role || "", action, ...details };
  await store.set(`logs/${at}_${entry.id}`, entry);
  return entry;
}

// ------------------------------------------------------------ auth
async function secret(store) {
  let s = await store.get("secret");
  if (!s) {
    s = { v: rid(40) };
    await store.set("secret", s);
  }
  return s.v;
}
async function makeToken(store, user) {
  const payload = b64u(enc.encode(JSON.stringify({ n: user.name, r: user.role, e: Date.now() + 30 * 864e5 })));
  return `${payload}.${await hmac(await secret(store), payload)}`;
}
async function readToken(store, req) {
  const h = req.headers.get("authorization") || "";
  const t = h.replace(/^Bearer\s+/i, "");
  const [payload, sig] = t.split(".");
  if (!payload || !sig) return null;
  if (!safeEq(sig, await hmac(await secret(store), payload))) return null;
  try {
    const o = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (o.e < Date.now()) return null;
    const users = (await store.get("users")) || [];
    const u = users.find((x) => x.name === o.n);
    if (!u) return null;
    return { name: u.name, role: u.role };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ reseau (IP / Metricool)
async function currentIp(env, settings) {
  const purl = proxyUrl(settings.proxy);
  const urls = ["https://ipinfo.io/json", "https://api.ipify.org?format=json"];
  for (const u of urls) {
    try {
      const r = await env.proxyFetch(u, purl, 12000);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.ip) return { ip: j.ip, country: j.country || "", city: j.city || "", org: j.org || "", viaProxy: !!purl };
    } catch {}
  }
  return null;
}
async function mcFetch(env, secrets, path, opts = {}) {
  if (!secrets.mcToken || !secrets.mcUserId) throw new Error("Metricool pas configuré (Réglages).");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${env.mcBase || MC}${path}${sep}userId=${encodeURIComponent(secrets.mcUserId)}`;
  const r = await env.fetch(url, {
    method: opts.method || "GET",
    headers: { "X-Mc-Auth": secrets.mcToken, "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const txt = await r.text();
  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    data = txt;
  }
  if (!r.ok) throw new Error(`Metricool ${r.status} : ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function tinyCreate(env, secrets, settings, pseudo) {
  if (!secrets.tinyToken) throw new Error("TinyURL pas branché (Réglages > Connexions, champ 5).");
  const dest = (settings.model && settings.model.link || "").trim();
  if (!dest) throw new Error("Lien de la modèle manquant (Réglages > Modèle en cours).");
  const domain = (settings.tinyDomain || "tinyurl.com").trim();
  const base = env.tinyBase || "https://api.tinyurl.com";
  const root = pseudo.toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 28) || "link";
  const tries = [root, root + "x", root + "2", root + "-" + rid(3)];
  let last = "";
  for (const alias of tries) {
    const r = await env.fetch(`${base}/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secrets.tinyToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: dest.startsWith("http") ? dest : "https://" + dest, domain, alias, tags: ["threads"] }),
    });
    const t = await r.text();
    let d;
    try { d = JSON.parse(t); } catch { d = { errors: [t.slice(0, 120)] }; }
    if (r.ok && d.data) return { link: d.data.tiny_url || `https://${domain}/${d.data.alias || alias}`, alias: d.data.alias || alias, domain };
    last = (d.errors || []).join(" ") || `HTTP ${r.status}`;
    if (!/alias|available|taken|exist/i.test(last)) break;
  }
  throw new Error("TinyURL : " + last);
}
function brandThreads(b) {
  const nd = b.networksData || b.networks || {};
  const key = Object.keys(nd).find((k) => /threads/i.test(k) && nd[k]);
  const t = key ? nd[key] : b.threads || null;
  if (!t) return null;
  if (typeof t !== "object") return String(t);
  const handle = t.username || t.userName || t.screenName || t.name || t.handle || t.id;
  return handle ? String(handle) : "connecté";
}

// ------------------------------------------------------------ choix des posts
function pickText(texts, account, posts, dayKey) {
  const mine = new Set(posts.filter((p) => p.accountId === account.id).map((p) => p.textId));
  const sameDay = new Set(posts.filter((p) => p.day === dayKey).map((p) => p.textId));
  const usage = {};
  for (const p of posts) usage[p.textId] = (usage[p.textId] || 0) + 1;
  const pool = texts.filter((t) => t.group === account.group && !t.off && !mine.has(t.id));
  const fresh = pool.filter((t) => !sameDay.has(t.id));
  const list = fresh.length ? fresh : pool;
  if (!list.length) return null;
  list.sort((a, b) => (usage[a.id] || 0) - (usage[b.id] || 0) || Math.random() - 0.5);
  return list[0];
}
function pickMedia(media, account, posts) {
  const pool = media.filter((m) => m.group === account.group && m.kind !== "pfp");
  if (!pool.length) return null;
  const mine = new Set(posts.filter((p) => p.accountId === account.id).map((p) => p.mediaId));
  const usage = {};
  for (const p of posts) if (p.mediaId) usage[p.mediaId] = (usage[p.mediaId] || 0) + 1;
  const fresh = pool.filter((m) => !mine.has(m.id));
  const list = fresh.length ? fresh : pool;
  list.sort((a, b) => (usage[a.id] || 0) - (usage[b.id] || 0) || Math.random() - 0.5);
  return list[0];
}

// ------------------------------------------------------------ vue des taches
function computeTasks(accounts, settings, today) {
  const now = Date.now();
  const alive = accounts.filter((a) => ALIVE.includes(a.status));
  const warmupDue = alive.filter((a) => a.status === "warmup");
  const setupReady = alive.filter((a) => a.status === "attente_setup" && new Date(a.setupDueAt).getTime() <= now);
  const setupWaiting = alive.filter((a) => a.status === "attente_setup" && new Date(a.setupDueAt).getTime() > now);
  const toConnect = alive.filter((a) => a.status === "setup_ok");
  const active = alive.filter((a) => a.status === "actif");
  const toCheck = alive.filter((a) => ["actif", "shadowban", "restreint"].includes(a.status) && a.lastCheckDay !== today);
  const toPlan = active.filter((a) => !a.plannedUntil || a.plannedUntil < addDays(today, 2));
  const dead = accounts.filter((a) => a.status === "saute" && !a.replacedBy);
  const reserve = alive.filter((a) => ["warmup", "attente_setup", "setup_ok"].includes(a.status)).length;
  return {
    toCheck: toCheck.map((a) => a.id),
    toReplace: dead.map((a) => a.id),
    warmup: warmupDue.map((a) => a.id),
    setupReady: setupReady.map((a) => a.id),
    setupWaiting: setupWaiting.map((a) => a.id),
    toConnect: toConnect.map((a) => a.id),
    toPlan: toPlan.map((a) => a.id),
    reserve,
    reserveMissing: Math.max(0, (settings.reserveTarget || 0) - reserve),
    active: active.length,
  };
}
function addDays(day, n) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------ routeur
export async function handle(req, env) {
  const store = env.store;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = req.method;
  const body = method === "GET" ? {} : await req.json().catch(() => ({}));

  try {
    // --- public : images pour Metricool / pour la VA
    if (path.startsWith("media/") && method === "GET") {
      const id = path.slice(6).replace(/\.[a-z0-9]+$/i, "");
      const meta = await store.get(`mediameta/${id}`);
      const bin = await store.getBinary(`mediabin/${id}`);
      if (!meta || !bin) return new Response("introuvable", { status: 404 });
      return new Response(bin, { headers: { "content-type": meta.contentType || "image/jpeg", "cache-control": "public, max-age=31536000, immutable", "content-disposition": `inline; filename="${meta.filename || id}"` } });
    }

    // --- connexion
    if (path === "status" && method === "GET") {
      const users = (await store.get("users")) || [];
      return json({ firstRun: users.length === 0 });
    }
    if (path === "login" && method === "POST") {
      const pin = String(body.pin || "").trim();
      if (!/^\d{4,8}$/.test(pin)) return err("Le code doit faire 4 à 8 chiffres.");
      let users = (await store.get("users")) || [];
      if (users.length === 0) {
        const name = String(body.name || "Awen").trim().slice(0, 30) || "Awen";
        users = [{ name, role: "admin", pinHash: await sha("pin:" + pin) }];
        await store.set("users", users);
        await log(store, { name, role: "admin" }, "premier_acces", {});
      }
      const h = await sha("pin:" + pin);
      const u = users.find((x) => safeEq(x.pinHash, h));
      if (!u) {
        await log(store, null, "code_faux", {});
        return err("Code faux.", 401);
      }
      await log(store, u, "connexion", {});
      return json({ token: await makeToken(store, u), user: { name: u.name, role: u.role } });
    }

    const me = await readToken(store, req);
    if (!me) return err("Session expirée, reconnecte-toi.", 401);
    const isAdmin = me.role === "admin";
    const needAdmin = () => {
      if (!isAdmin) throw Object.assign(new Error("Réservé à Awen et Bilot."), { status: 403 });
    };

    // --- etat complet pour l'interface
    if (path === "state" && method === "GET") {
      const settings = await getSettings(store);
      const secrets = await getSecrets(store);
      const accounts = await listJson(store, "accounts/");
      const texts = await listJson(store, "texts/");
      const media = (await listJson(store, "mediameta/")).sort((a, b) => (a.at < b.at ? 1 : -1));
      const posts = await listJson(store, "posts/");
      const today = todayLocal(settings.timezone);
      const out = {
        me,
        today,
        statusLabels: STATUS,
        strategyLabels: STRATEGY,
        settings: { ...settings, proxy: settings.proxy },
        configured: { rotation: !!secrets.rotationUrl, metricool: !!(secrets.mcToken && secrets.mcUserId), mcToken: !!secrets.mcToken, mcUserId: !!secrets.mcUserId, proxy: !!settings.proxy, tiny: !!secrets.tinyToken },
        linkStats: (await store.get("linkstats")) || null,
        lastIp: (await store.get("lastip")) || null,
        accounts: accounts.sort((a, b) => a.num - b.num),
        texts: texts.map((t) => ({ id: t.id, group: t.group, text: t.text, fr: t.fr || "", off: !!t.off })),
        media: media.map((m) => ({ id: m.id, group: m.group, kind: m.kind || "post", filename: m.filename, at: m.at })),
        posts: posts.sort((a, b) => (a.at < b.at ? -1 : 1)),
        tasks: computeTasks(accounts, settings, today),
      };
      if (isAdmin) {
        const logKeys = (await store.list("logs/")).sort().slice(-300);
        out.logs = (await Promise.all(logKeys.map((k) => store.get(k)))).filter(Boolean).reverse();
        out.users = ((await store.get("users")) || []).map((u) => ({ name: u.name, role: u.role }));
        out.alerts = (await store.get("alerts")) || [];
      }
      return json(out);
    }

    // --- IP
    if (path === "ip" && method === "GET") {
      const settings = await getSettings(store);
      const ip = await currentIp(env, settings);
      if (!ip) return err("Impossible de lire l'IP du proxy. Vérifie le proxy dans Réglages.", 502);
      return json(ip);
    }
    if (path === "rotate" && method === "POST") {
      const settings = await getSettings(store);
      const secrets = await getSecrets(store);
      if (!secrets.rotationUrl) return err("Lien de rotation pas configuré (Réglages).");
      const before = await currentIp(env, settings);
      let rotateStatus = null;
      try {
        const r = await env.fetch(secrets.rotationUrl, { headers: { "user-agent": "Mozilla/5.0" } });
        rotateStatus = r.status;
      } catch (e) {
        return err("Le lien de rotation ne répond pas : " + e.message, 502);
      }
      let after = null;
      const deadline = Date.now() + (env.rotateWaitMs ?? 45000);
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, env.rotatePollMs ?? 4000));
        const cur = await currentIp(env, settings);
        if (cur && (!before || cur.ip !== before.ip)) {
          after = cur;
          break;
        }
      }
      if (!after) {
        await log(store, me, "ip_pas_changee", { before: before?.ip || null, rotateStatus });
        return err("L'IP n'a pas changé. Réessaie dans 30 secondes.", 409);
      }
      const used = (await listJson(store, "accounts/")).find((a) => a.ip === after.ip);
      const rec = { ...after, at: nowIso(), by: me.name, usedBy: used ? used.pseudo : null };
      await store.set("lastip", rec);
      await log(store, me, "ip_changee", { before: before?.ip || null, ip: after.ip, country: after.country });
      return json(rec);
    }

    // --- comptes
    if (path === "accounts/create" && method === "POST") {
      const settings = await getSettings(store);
      const lastip = await store.get("lastip");
      const pseudo = String(body.pseudo || "").trim().replace(/^@/, "");
      if (!pseudo) return err("Mets le pseudo du compte.");
      if (!String(body.phone || "").trim()) return err("Mets le numéro utilisé.");
      if (!String(body.password || "").trim()) return err("Mets le mot de passe.");
      const accounts = await listJson(store, "accounts/");
      if (accounts.some((a) => a.pseudo.toLowerCase() === pseudo.toLowerCase() && a.status !== "saute")) return err("Ce pseudo existe déjà dans le CRM.");
      if (!lastip || Date.now() - new Date(lastip.at).getTime() > 15 * 60e3) return err("Change l'IP avant de créer le compte (bouton 🔄).");
      if (accounts.some((a) => a.ip === lastip.ip)) return err("Cette IP a déjà servi pour un autre compte. Change l'IP.");
      // groupe : celui du compte remplace, sinon le groupe le moins rempli
      let replaces = null;
      let group = body.group;
      const dead = accounts.filter((a) => a.status === "saute" && !a.replacedBy).sort((a, b) => (a.deadAt < b.deadAt ? -1 : 1));
      if (dead.length) {
        replaces = dead[0];
        group = replaces.group;
      }
      if (!group || !settings.groups.some((g) => g.id === group)) {
        const alive = accounts.filter((a) => ALIVE.includes(a.status));
        const count = (g) => alive.filter((a) => a.group === g.id).length;
        group = [...settings.groups].sort((a, b) => count(a) - count(b))[0].id;
      }
      // stratégie : celle du compte remplacé, sinon la moins remplie par rapport à la cible
      let strategy = replaces ? replaces.strategy : null;
      if (!strategy || !STRATEGY[strategy]) {
        const target = settings.strategies || { epingle: 5, lien: 5, relais: 5 };
        const alive = accounts.filter((a) => ALIVE.includes(a.status));
        const countS = (k) => alive.filter((a) => a.strategy === k).length;
        strategy = Object.keys(STRATEGY).map((k) => ({ k, gap: (target[k] || 0) - countS(k), ratio: countS(k) / Math.max(1, target[k] || 0) })).sort((a, b) => b.gap - a.gap || a.ratio - b.ratio)[0].k;
      }
      // lien : cree sur TinyURL avec le pseudo ; sinon le prochain lien libre de la liste
      const usedLinks = new Set(accounts.filter((a) => a.status !== "saute").map((a) => a.link));
      let link = (settings.links || []).find((l) => l && !usedLinks.has(l)) || (replaces ? replaces.link : "") || "";
      let linkNote = "";
      let linkAlias = "";
      const secretsC = await getSecrets(store);
      if (strategy !== "relais" && secretsC.tinyToken) {
        try {
          const made = await tinyCreate(env, secretsC, settings, pseudo);
          link = made.link;
          linkAlias = made.alias;
        } catch (e) {
          linkNote = e.message;
        }
      }
      const num = accounts.reduce((m, a) => Math.max(m, a.num || 0), 0) + 1;
      const acc = {
        id: rid(8),
        num,
        pseudo,
        phone: String(body.phone).trim(),
        password: String(body.password).trim(),
        email: String(body.email || "").trim(),
        emailPassword: String(body.emailPassword || "").trim(),
        geelarkProfile: String(body.geelarkProfile || "").trim(),
        group,
        strategy,
        link: strategy === "relais" ? "" : link,
        linkAlias: strategy === "relais" ? "" : linkAlias,
        linkNote,
        status: "warmup",
        createdAt: nowIso(),
        createdBy: me.name,
        ip: lastip.ip,
        ipCountry: lastip.country,
        replaces: replaces ? replaces.id : null,
        history: [{ at: nowIso(), by: me.name, status: "warmup" }],
      };
      await store.set(`accounts/${acc.id}`, acc);
      if (replaces) {
        replaces.replacedBy = acc.id;
        await store.set(`accounts/${replaces.id}`, replaces);
      }
      await log(store, me, "compte_cree", { accountId: acc.id, pseudo, ip: acc.ip, group, strategy, lien: acc.link || null, replaces: replaces?.pseudo || null });
      if (linkNote) await log(store, me, "lien_non_cree", { accountId: acc.id, pseudo, raison: linkNote });
      return json(acc);
    }
    if (path === "accounts/failed" && method === "POST") {
      await log(store, me, "creation_ratee", { phone: String(body.phone || ""), reason: String(body.reason || "").slice(0, 200) });
      return json({ ok: true });
    }
    const accMatch = path.match(/^accounts\/([a-z0-9]+)\/(warmup|setup|metricool|unlink|check|edit|delete|makelink)$/);
    if (accMatch && method === "POST") {
      const [, id, action] = accMatch;
      const acc = await store.get(`accounts/${id}`);
      if (!acc) return err("Compte introuvable.", 404);
      const settings = await getSettings(store);
      const push = (status, extra = {}) => {
        acc.status = status;
        acc.history = [...(acc.history || []), { at: nowIso(), by: me.name, status, ...extra }];
      };
      if (action === "makelink") {
        if (acc.strategy === "relais") return err("Un compte relais n'a pas de lien.");
        const secrets = await getSecrets(store);
        const made = await tinyCreate(env, secrets, settings, acc.pseudo);
        acc.link = made.link;
        acc.linkAlias = made.alias;
        acc.linkNote = "";
        await log(store, me, "lien_cree", { accountId: id, pseudo: acc.pseudo, lien: acc.link });
      } else if (action === "warmup") {
        acc.warmupDoneAt = nowIso();
        acc.setupDueAt = new Date(new Date(acc.createdAt).getTime() + (settings.warmupHours || 24) * 3600e3).toISOString();
        push("attente_setup");
        await log(store, me, "warmup_fait", { accountId: id, pseudo: acc.pseudo });
      } else if (action === "setup") {
        if (acc.status !== "attente_setup") return err("Ce compte n'attend pas de setup.");
        if (new Date(acc.setupDueAt).getTime() > Date.now() && !isAdmin) return err("Trop tôt : attends 24h après la création.");
        acc.setupAt = nowIso();
        acc.bio = String(body.bio || acc.bio || "");
        push("setup_ok");
        await log(store, me, "setup_fait", { accountId: id, pseudo: acc.pseudo });
      } else if (action === "metricool") {
        const blogId = String(body.blogId || "").trim();
        if (!/^\d+$/.test(blogId)) return err("Choisis la marque Metricool.");
        const accounts = await listJson(store, "accounts/");
        const other = accounts.find((a) => a.blogId === blogId && a.id !== id && ALIVE.includes(a.status));
        if (other) return err(`Cette marque est déjà reliée à @${other.pseudo}.`);
        acc.blogId = blogId;
        acc.metricoolAt = nowIso();
        push("actif");
        await log(store, me, "metricool_relie", { accountId: id, pseudo: acc.pseudo, blogId });
      } else if (action === "check") {
        const st = body.status;
        if (!["actif", "shadowban", "restreint", "saute"].includes(st)) return err("Statut inconnu.");
        acc.lastCheckDay = todayLocal(settings.timezone);
        acc.lastCheckAt = nowIso();
        if (body.followers !== undefined && body.followers !== "") acc.followers = Number(body.followers) || 0;
        if (st === "saute") {
          acc.deadAt = nowIso();
          push("saute", { note: String(body.note || "") });
          // on retire ses posts programmes sur Metricool
          const secrets = await getSecrets(store);
          const posts = (await listJson(store, "posts/")).filter((p) => p.accountId === id && p.status === "programme" && new Date(p.at).getTime() > Date.now());
          let removed = 0;
          for (const p of posts) {
            try {
              if (p.mcId && acc.blogId) await mcFetch(env, secrets, `/v2/scheduler/posts/${p.mcId}?blogId=${acc.blogId}`, { method: "DELETE" });
              p.status = "annule";
              await store.set(`posts/${p.id}`, p);
              removed++;
            } catch {}
          }
          await log(store, me, "compte_saute", { accountId: id, pseudo: acc.pseudo, postsAnnules: removed });
        } else {
          if (acc.status !== st) push(st);
          await log(store, me, "check", { accountId: id, pseudo: acc.pseudo, status: st, followers: acc.followers ?? null });
        }
      } else if (action === "unlink") {
        await log(store, me, "metricool_delie", { accountId: id, pseudo: acc.pseudo, blogId: acc.blogId });
        acc.oldBlogId = acc.blogId;
        acc.blogId = null;
        acc.unlinkedAt = nowIso();
      } else if (action === "edit") {
        for (const k of ["pseudo", "phone", "password", "email", "emailPassword", "geelarkProfile", "link", "notes", "bio"]) if (k in body) acc[k] = String(body[k] ?? "").trim();
        if (isAdmin && body.group && settings.groups.some((g) => g.id === body.group)) acc.group = body.group;
        if (isAdmin && body.strategy && STRATEGY[body.strategy]) acc.strategy = body.strategy;
        if (isAdmin && body.status && STATUS[body.status]) push(body.status, { note: "modifié à la main" });
        await log(store, me, "compte_modifie", { accountId: id, pseudo: acc.pseudo, fields: Object.keys(body) });
      } else if (action === "delete") {
        needAdmin();
        await store.delete(`accounts/${id}`);
        await log(store, me, "compte_supprime", { accountId: id, pseudo: acc.pseudo });
        return json({ ok: true });
      }
      await store.set(`accounts/${id}`, acc);
      return json(acc);
    }

    // --- Metricool
    if (path === "metricool/brands" && method === "GET") {
      const secrets = await getSecrets(store);
      const data = await mcFetch(env, secrets, "/v2/settings/brands");
      const list = (Array.isArray(data) ? data : data.data || []).map((b) => ({
        blogId: String(b.id ?? b.blogId),
        label: b.label || b.title || b.description || `Marque ${b.id ?? b.blogId}`,
        threads: brandThreads(b),
        timezone: b.timezone || "",
      }));
      const accounts = await listJson(store, "accounts/");
      for (const b of list) {
        const a = accounts.find((x) => x.blogId === b.blogId && ALIVE.includes(x.status));
        b.linkedTo = a ? a.pseudo : null;
      }
      return json(list);
    }
    if (path === "metricool/health" && method === "POST") {
      const secrets = await getSecrets(store);
      const data = await mcFetch(env, secrets, "/v2/settings/brands");
      const list = Array.isArray(data) ? data : data.data || [];
      const accounts = (await listJson(store, "accounts/")).filter((a) => a.blogId && ["actif", "shadowban", "restreint"].includes(a.status));
      const alerts = [];
      for (const a of accounts) {
        const b = list.find((x) => String(x.id ?? x.blogId) === a.blogId);
        if (!b) alerts.push({ accountId: a.id, pseudo: a.pseudo, msg: "Marque Metricool introuvable" });
        else if (!brandThreads(b)) alerts.push({ accountId: a.id, pseudo: a.pseudo, msg: "Threads déconnecté dans Metricool (compte peut-être sauté)" });
      }
      await store.set("alerts", alerts.map((x) => ({ ...x, at: nowIso() })));
      return json(alerts);
    }
    if (path === "metricool/plan" && method === "POST") {
      const settings = await getSettings(store);
      const secrets = await getSecrets(store);
      const acc = await store.get(`accounts/${body.accountId}`);
      if (!acc) return err("Compte introuvable.", 404);
      if (!acc.blogId) return err("Relie d'abord ce compte à Metricool.");
      const days = Math.min(Math.max(Number(body.days) || 3, 1), 14);
      const tz = settings.timezone || TZ_DEFAULT;
      const texts = await listJson(store, "texts/");
      const media = await listJson(store, "mediameta/");
      const group = settings.groups.find((g) => g.id === acc.group) || {};
      let posts = await listJson(store, "posts/");
      const today = todayLocal(tz);
      const mine = posts.filter((p) => p.accountId === acc.id && p.status === "programme");
      const created = [];
      const problems = [];
      const origin = env.publicOrigin || new URL(req.url).origin;
      for (let i = 0; i < days; i++) {
        const day = addDays(today, i);
        const slots = (settings.slots || []).slice(0, settings.postsPerDay || 3);
        for (const slot of slots) {
          if (mine.some((p) => p.day === day && p.slot === slot)) continue;
          const [hh, mm] = slot.split(":").map(Number);
          const jitter = Math.round((Math.random() * 2 - 1) * (settings.jitterMin || 0));
          let when = localToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), hh, mm, tz);
          when = new Date(when.getTime() + jitter * 60e3);
          if (when.getTime() < Date.now() + 10 * 60e3) continue;
          const text = pickText(texts, acc, posts, day);
          if (!text) {
            problems.push(`Plus de texte libre dans le groupe ${group.name || acc.group}.`);
            break;
          }
          let m = null;
          if (group.withPhoto) {
            m = pickMedia(media, acc, posts);
            if (!m) {
              problems.push(`Pas de photo dans le groupe ${group.name}.`);
              break;
            }
          }
          const lp = tzParts(when, tz);
          const dateTime = `${lp.y}-${pad(lp.m)}-${pad(lp.d)}T${pad(lp.h)}:${pad(lp.mi)}:00`;
          const payload = {
            publicationDate: { dateTime, timezone: tz },
            text: text.text,
            providers: [{ network: "threads" }],
            autoPublish: true,
            draft: false,
            firstCommentText: "",
            shortener: false,
            smartLinkData: { ids: [] },
            descendants: [],
            media: [],
            mediaAltText: [],
            threadsData: {},
          };
          if (m) {
            const publicUrl = `${origin}/api/media/${m.id}.${(m.filename || "x.jpg").split(".").pop()}`;
            const norm = await mcFetch(env, secrets, `/actions/normalize/image/url?url=${encodeURIComponent(publicUrl)}`);
            const normUrl = typeof norm === "string" ? norm : norm.url || norm.data || norm.mediaUrl || publicUrl;
            payload.media = [normUrl];
          }
          let res;
          try {
            res = await mcFetch(env, secrets, `/v2/scheduler/posts?blogId=${acc.blogId}`, { method: "POST", body: payload });
          } catch (e) {
            problems.push(e.message);
            break;
          }
          const mcId = res?.data?.id ?? res?.id ?? null;
          const p = { id: rid(8), accountId: acc.id, pseudo: acc.pseudo, blogId: acc.blogId, textId: text.id, mediaId: m?.id || null, day, slot, at: when.toISOString(), local: dateTime, mcId, status: "programme", by: me.name, createdAt: nowIso() };
          await store.set(`posts/${p.id}`, p);
          posts.push(p);
          mine.push(p);
          created.push(p);
        }
        if (problems.length) break;
      }
      const lastDay = mine.map((p) => p.day).sort().pop() || null;
      if (lastDay) acc.plannedUntil = lastDay;
      await store.set(`accounts/${acc.id}`, acc);
      await log(store, me, "planif", { accountId: acc.id, pseudo: acc.pseudo, posts: created.length, jusquau: lastDay, problemes: problems.slice(0, 3) });
      return json({ created, problems, plannedUntil: lastDay });
    }
    if (path === "metricool/test" && method === "POST") {
      needAdmin();
      const secrets = await getSecrets(store);
      const data = await mcFetch(env, secrets, "/v2/settings/brands");
      const list = Array.isArray(data) ? data : data.data || [];
      return json({ ok: true, brands: list.length, sample: list.slice(0, 2) });
    }


    // --- stats des liens (TinyURL)
    if (path === "links/stats" && method === "POST") {
      const secrets = await getSecrets(store);
      if (!secrets.tinyToken) return err("TinyURL pas encore branché (Réglages > Connexions).");
      const accounts = (await listJson(store, "accounts/")).filter((a) => a.link);
      const base = env.tinyBase || "https://api.tinyurl.com";
      const out = { at: nowIso(), links: {}, errors: [] };
      const parse = (link) => {
        try {
          const u = new URL(link.startsWith("http") ? link : "https://" + link);
          return { domain: u.hostname, alias: u.pathname.replace(/^\/+/, "").split("/")[0] };
        } catch {
          return null;
        }
      };
      const tiny = async (q) => {
        const r = await env.fetch(`${base}${q}`, { headers: { Authorization: `Bearer ${secrets.tinyToken}`, Accept: "application/json" } });
        const t = await r.text();
        let d;
        try { d = JSON.parse(t); } catch { d = t; }
        if (!r.ok) throw new Error(`TinyURL ${r.status} : ${typeof d === "string" ? d.slice(0, 120) : JSON.stringify(d.errors || d).slice(0, 160)}`);
        return d;
      };
      const since = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const count = (d) => {
        const data = d?.data ?? d;
        if (Array.isArray(data)) return data.reduce((n, x) => n + (Number(x.count ?? x.clicks ?? x.hits ?? x.value ?? 0) || 0), 0);
        if (data && typeof data === "object") return Number(data.total ?? data.hits ?? data.clicks ?? data.count ?? 0) || 0;
        return 0;
      };
      const seen = new Set();
      for (const a of accounts) {
        const p = parse(a.link);
        if (!p || !p.alias || seen.has(a.link)) continue;
        seen.add(a.link);
        try {
          const q = (from) => `/analytics/timeline?alias=${encodeURIComponent(p.alias)}&domain=${encodeURIComponent(p.domain)}&from=${from}&to=${today}`;
          const [d7, d30] = await Promise.all([tiny(q(since(7))), tiny(q(since(30)))]);
          out.links[a.link] = { clicks7: count(d7), clicks30: count(d30) };
        } catch (e) {
          out.errors.push(`${a.link} : ${e.message}`);
        }
      }
      await store.set("linkstats", out);
      await log(store, me, "stats_liens", { liens: Object.keys(out.links).length, erreurs: out.errors.length });
      return json(out);
    }

    // --- contenu
    if (path === "texts/bulk" && method === "POST") {
      needAdmin();
      const settings = await getSettings(store);
      const group = body.group;
      if (!settings.groups.some((g) => g.id === group)) return err("Groupe inconnu.");
      const existing = await listJson(store, "texts/");
      const have = new Set(existing.filter((t) => t.group === group).map((t) => t.text.trim()));
      const lines = String(body.lines || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let added = 0;
      for (const l of lines) {
        const [text, fr] = l.split(" || ");
        if (have.has(text.trim())) continue;
        const t = { id: rid(8), group, text: text.trim(), fr: (fr || "").trim(), at: nowIso(), by: me.name };
        await store.set(`texts/${t.id}`, t);
        have.add(t.text);
        added++;
      }
      await log(store, me, "textes_ajoutes", { group, added });
      return json({ added });
    }
    const txtMatch = path.match(/^texts\/([a-z0-9]+)\/(toggle|delete)$/);
    if (txtMatch && method === "POST") {
      needAdmin();
      const t = await store.get(`texts/${txtMatch[1]}`);
      if (!t) return err("Texte introuvable.", 404);
      if (txtMatch[2] === "delete") await store.delete(`texts/${t.id}`);
      else {
        t.off = !t.off;
        await store.set(`texts/${t.id}`, t);
      }
      return json({ ok: true });
    }
    if (path === "media/upload" && method === "POST") {
      needAdmin();
      const settings = await getSettings(store);
      if (!settings.groups.some((g) => g.id === body.group) && body.kind !== "pfp") return err("Groupe inconnu.");
      const m = String(body.dataUrl || "").match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
      if (!m) return err("Image invalide.");
      const bin = Buffer.from(m[2], "base64");
      if (bin.length > 8 * 1024 * 1024) return err("Image trop lourde (8 Mo max).");
      const id = rid(16);
      const meta = { id, group: body.group || "", kind: body.kind === "pfp" ? "pfp" : "post", filename: String(body.filename || `${id}.jpg`).slice(0, 80), contentType: m[1], size: bin.length, at: nowIso(), by: me.name };
      await store.setBinary(`mediabin/${id}`, bin);
      await store.set(`mediameta/${id}`, meta);
      await log(store, me, "photo_ajoutee", { group: meta.group, kind: meta.kind });
      return json(meta);
    }
    const medMatch = path.match(/^media\/([a-z0-9]+)\/delete$/);
    if (medMatch && method === "POST") {
      needAdmin();
      await store.delete(`mediameta/${medMatch[1]}`);
      await store.delete(`mediabin/${medMatch[1]}`);
      return json({ ok: true });
    }

    // --- reglages
    if (path === "settings" && method === "POST") {
      needAdmin();
      const s = await getSettings(store);
      const allowed = ["timezone", "postsPerDay", "slots", "jitterMin", "reserveTarget", "warmupHours", "proxy", "smsSiteUrl", "geelarkUrl", "metricoolUrl", "pinnedPost", "pinnedReply", "model", "bios", "bioBank", "strategies", "hub", "relayText", "tinyDomain", "links", "groups", "videos", "sopExtra"];
      for (const k of allowed) if (k in body) s[k] = body[k];
      if (s.timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: s.timezone });
        } catch {
          return err("Fuseau horaire invalide.");
        }
      }
      s.slots = (s.slots || []).filter((x) => /^\d{2}:\d{2}$/.test(x));
      await saveSettings(store, s);
      await log(store, me, "reglages_modifies", { fields: Object.keys(body).filter((k) => allowed.includes(k)) });
      return json(s);
    }
    if (path === "secrets" && method === "POST") {
      needAdmin();
      const sec = await getSecrets(store);
      if (typeof body.mcUserId === "string") {
        const m = body.mcUserId.match(/userId=(\d+)/) || body.mcUserId.trim().match(/^(\d+)$/);
        if (body.mcUserId.trim() && !m) return err("userId Metricool : mets le nombre (ou colle l'adresse de Metricool).");
        body.mcUserId = m ? m[1] : "";
      }
      for (const k of ["rotationUrl", "mcToken", "mcUserId", "tinyToken"]) if (typeof body[k] === "string" && body[k].trim()) sec[k] = body[k].trim();
      if (body.clear && ["rotationUrl", "mcToken", "mcUserId", "tinyToken"].includes(body.clear)) delete sec[body.clear];
      await store.set("secrets", sec);
      await log(store, me, "secrets_modifies", { fields: Object.keys(body).filter((k) => k !== "clear" && body[k]) });
      return json({ rotation: !!sec.rotationUrl, metricool: !!(sec.mcToken && sec.mcUserId), mcToken: !!sec.mcToken, mcUserId: !!sec.mcUserId, tiny: !!sec.tinyToken });
    }
    if (path === "users" && method === "POST") {
      needAdmin();
      const name = String(body.name || "").trim().slice(0, 30);
      const role = body.role === "admin" ? "admin" : "va";
      if (!name) return err("Mets un prénom.");
      let users = (await store.get("users")) || [];
      if (body.remove) {
        if (name === me.name) return err("Tu ne peux pas te supprimer toi-même.");
        users = users.filter((u) => u.name !== name);
      } else {
        const pin = String(body.pin || "").trim();
        if (!/^\d{4,8}$/.test(pin)) return err("Code de 4 à 8 chiffres.");
        const h = await sha("pin:" + pin);
        if (users.some((u) => u.pinHash === h && u.name !== name)) return err("Ce code est déjà pris, choisis-en un autre.");
        const ex = users.find((u) => u.name === name);
        if (ex) {
          ex.pinHash = h;
          ex.role = role;
        } else users.push({ name, role, pinHash: h });
      }
      await store.set("users", users);
      await log(store, me, body.remove ? "utilisateur_supprime" : "utilisateur_modifie", { name, role });
      return json(users.map((u) => ({ name: u.name, role: u.role })));
    }

    return err("Route inconnue : " + path, 404);
  } catch (e) {
    return err(e.message || "Erreur", e.status || 500);
  }
}
