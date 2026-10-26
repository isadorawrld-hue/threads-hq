// Threads HQ : interface du CRM (VA + admin). Aucune dependance.

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");

const S = {
  token: localStorage.getItem("hq_token") || "",
  data: null,
  tab: localStorage.getItem("hq_tab") || "today",
  filter: "vivants",
  search: "",
  wiz: null, // assistant de creation
  setup: null, // assistant de setup
  pin: "",
  firstRun: false,
  busy: false,
  brands: null,
  logFilter: "",
};
let timerInt = null;

// ------------------------------------------------------------ API
async function api(path, body, method) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "content-type": "application/json", authorization: "Bearer " + S.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "login") {
    logout();
    throw new Error(j.error || "Reconnecte-toi.");
  }
  if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
  return j;
}
async function refresh() {
  S.data = await api("state");
  render();
}
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (bad ? " err" : "");
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = "toast"), bad ? 4500 : 2200);
}
async function run(btn, fn) {
  if (S.busy) return;
  S.busy = true;
  const old = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> ' + (btn.dataset.wait || "Patiente...");
  }
  try {
    await fn();
  } catch (e) {
    toast(e.message, true);
  } finally {
    S.busy = false;
    if (btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
}
function copy(text) {
  navigator.clipboard.writeText(text).then(
    () => toast("Copié"),
    () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Copié");
    }
  );
}
function logout() {
  S.token = "";
  S.data = null;
  localStorage.removeItem("hq_token");
  render();
}
function modal(html) {
  $("#modal-body").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
}

// ------------------------------------------------------------ helpers d'affichage
const isAdmin = () => S.data?.me?.role === "admin";
const acc = (id) => S.data.accounts.find((a) => a.id === id);
const group = (id) => S.data.settings.groups.find((g) => g.id === id) || { name: id || "?", color: "#eee" };
const statusColor = { warmup: "c-yellow", attente_setup: "c-blue", setup_ok: "c-violet", actif: "c-green", shadowban: "c-pink", restreint: "c-pink", saute: "c-red" };
const statusEmoji = {};
const pill = (st) => `<span class="status st-${esc(st)}"><i></i>${esc(S.data.statusLabels[st] || st)}</span>`;
const gpill = (g) => `<span class="grp"><i style="background:${esc(group(g).color)}"></i>${esc(group(g).name)}</span>`;
function ago(iso) {
  if (!iso) return "jamais";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) {
    const m = -s / 60;
    return m < 60 ? `dans ${Math.ceil(m)} min` : `dans ${Math.ceil(m / 60)} h`;
  }
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const copyLine = (k, v, secret) =>
  `<div class="copyline"><span class="k">${esc(k)}</span><span class="v">${v ? esc(secret ? "••••••••" : v) : '<span class="muted">vide</span>'}</span>${v ? `<button class="btn sm light" data-act="copy" data-v="${esc(v)}">Copier</button>` : ""}</div>`;
function videoEmbed(url) {
  if (!url) return '<div class="novid">Vidéo bientôt ici</div>';
  let src = null;
  let m;
  if ((m = url.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{6,})/))) src = `https://www.youtube.com/embed/${m[1]}`;
  else if ((m = url.match(/loom\.com\/share\/([\w]+)/))) src = `https://www.loom.com/embed/${m[1]}`;
  else if ((m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/))) src = `https://drive.google.com/file/d/${m[1]}/preview`;
  if (!src) return `<p><a class="btn light" href="${esc(url)}" target="_blank" rel="noopener">▶️ Ouvrir la vidéo</a></p>`;
  return `<div class="video"><iframe src="${esc(src)}" allowfullscreen allow="autoplay; encrypted-media"></iframe></div>`;
}
const freshIp = () => {
  const ip = S.data.lastIp;
  return ip && Date.now() - new Date(ip.at).getTime() < 15 * 60e3 ? ip : null;
};
const threadsUrl = (p) => `https://www.threads.com/@${encodeURIComponent(p)}`;

// ------------------------------------------------------------ SOP (textes par defaut)
const SOP = {
  rotation: {
    t: "Changer l'IP",
    steps: ["Avant chaque compte, clique sur « Changer l'IP ».", "Attends que la nouvelle IP s'affiche.", "Jamais 2 comptes sur la même IP. Le CRM bloque si tu oublies."],
  },
  creation: {
    t: "Créer un compte",
    steps: ["Change l'IP.", "GeeLark : nouveau profil, 1 profil = 1 compte. Mets le proxy (infos à copier dans le CRM).", "Prends un numéro sur le site SMS.", "Crée le compte Instagram avec ce numéro, puis active Threads.", "Le compte marche : clique « Oui, il marche ». Sinon : « Non », et on recommence avec une nouvelle IP."],
  },
  warmup: {
    t: "Warm-up (jour 0)",
    steps: ["15 à 20 min de scroll sur Instagram + Threads.", "10 à 20 likes, 5 à 10 follows dans la niche.", "ZÉRO lien, zéro post, zéro changement de profil.", "Doucement : pas de rafale, comme une vraie personne."],
  },
  setup: {
    t: "Setup (24h après)",
    steps: ["Change l'IP et ouvre le profil GeeLark du compte.", "Photo de profil.", "Bio.", "Lien Telegram du compte.", "Post épinglé.", "Clique Setup fini."],
  },
  metricool: {
    t: "Metricool",
    steps: ["Dans Metricool : crée une marque au nom du compte (@pseudo).", "Connecte Threads DEPUIS le profil GeeLark du compte (même IP).", "Reviens dans le CRM, onglet Metricool, choisis la marque et clique Relier.", "Clique Planifier : le CRM remplit les posts tout seul."],
  },
  check: {
    t: "Check du matin",
    steps: ["Pour chaque compte : ouvre son profil.", "Le compte marche et ses posts sortent : OK.", "Les posts ne se voient plus depuis un autre compte : Shadowban.", "Message « action limitée » : Restreint.", "Compte suspendu / supprimé / demande de vérification impossible : Sauté."],
  },
  remplacement: {
    t: "Remplacer un compte sauté",
    steps: ["Dans Metricool : ouvre la marque du compte sauté, déconnecte Threads.", "Dans le CRM, clique Créer : le nouveau compte prend automatiquement la place du mort (même groupe).", "Quand il arrive à l'étape Metricool, relie-le à la marque libérée."],
  },
};
const sopBlock = (key, open) => {
  const s = SOP[key];
  const v = S.data.settings.videos?.[key];
  return `<details class="card sop" ${open ? "open" : ""}><summary><b>${s.t}</b> ${v ? "" : ""}</summary>${videoEmbed(v)}<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>`;
};

// ------------------------------------------------------------ rendu principal
const ICONS = {
  today: '<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  create: '<path d="M12 5v14M5 12h14"/>',
  warmup: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  setup: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  metricool: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  accounts: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  sop: '<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5"/>',
  dash: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  content: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
};
const icon = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ""}</svg>`;

function render() {
  clearInterval(timerInt);
  if (!S.token || !S.data) return renderLogin();
  const t = S.data.tasks;
  const groups = [
    ["Travail du jour", [
      ["today", "Aujourd'hui", 0],
      ["create", "Créer un compte", t.toReplace.length + t.reserveMissing],
      ["warmup", "Warm-up", t.warmup.length],
      ["setup", "Setup", t.setupReady.length],
      ["metricool", "Metricool", t.toConnect.length + t.toPlan.length],
      ["check", "Check du matin", t.toCheck.length],
    ]],
    ["Suivi", [
      ["accounts", "Comptes", 0],
      ["sop", "Guides (SOP)", 0],
    ]],
  ];
  if (isAdmin())
    groups.push(["Admin", [
      ["dash", "Dashboard", (S.data.alerts || []).length],
      ["content", "Contenu", 0],
      ["settings", "Réglages", S.data.configured.rotation && S.data.configured.metricool && S.data.configured.proxy ? 0 : 1],
    ]]);
  const all = groups.flatMap((g) => g[1]);
  if (!all.some((x) => x[0] === S.tab)) S.tab = "today";
  const ip = S.data.lastIp;
  const fresh = freshIp();
  const navBtn = ([id, l, c]) => `<button class="nav ${S.tab === id ? "on" : ""}" data-tab="${id}">${icon(id)}<span>${l}</span>${c ? `<em>${c}</em>` : ""}</button>`;
  app.innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="logo"><span class="mark">TH</span><div><b>Threads HQ</b><small>Sensual Aura</small></div></div>
      ${groups.map(([title, items]) => `<div class="navgroup"><div class="navtitle">${title}</div>${items.map(navBtn).join("")}</div>`).join("")}
      <div class="me"><span>${esc(S.data.me.name)}</span><button class="link" data-act="logout">Se déconnecter</button></div>
    </aside>
    <div class="body">
      <header class="bar">
        <div class="ipnow ${fresh ? "fresh" : ""}"><i></i><div><b>${ip ? esc(ip.ip) : "Aucune IP"}</b><small>${ip ? `${esc(ip.country || "")}, changée ${ago(ip.at)}` : "Change l'IP avant chaque compte"}</small></div></div>
        <button class="btn accent" data-act="rotate" data-wait="Changement de l'IP...">${icon("rotate")}Changer l'IP</button>
      </header>
      <nav class="mnav">${all.map(navBtn).join("")}</nav>
      <main>${VIEWS[S.tab]()}</main>
    </div>
  </div>`;
  afterRender();
}

function renderLogin() {
  app.innerHTML = `<div class="login"><div class="login-card">
    <span class="mark big">TH</span><h1>Threads HQ</h1>
    <p class="muted">${S.firstRun ? "Premier accès : choisis ton code (4 à 8 chiffres). Tu seras admin." : "Entre ton code d'accès"}</p>
    ${S.firstRun ? '<input id="firstname" placeholder="Ton prénom" value="Awen" />' : ""}
    <div class="pin-dots">${[0, 1, 2, 3, 4, 5].map((i) => `<span class="${i < S.pin.length ? "on" : ""}"></span>`).join("")}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-pin="${n}">${n}</button>`).join("")}<button data-pin="del" class="k-del">Effacer</button><button data-pin="0">0</button><button class="k-go" data-pin="go">Entrer</button></div>
  </div></div>`;
}

// ------------------------------------------------------------ vues
const VIEWS = {
  today() {
    const t = S.data.tasks;
    const cards = [];
    const conf = S.data.configured;
    if (isAdmin() && (!conf.rotation || !conf.metricool || !conf.proxy))
      cards.push(task("", "c-red", "Réglages à finir", `${!conf.proxy ? "Proxy · " : ""}${!conf.rotation ? "Lien de rotation · " : ""}${!conf.metricool ? "Metricool" : ""}`, "settings", "Ouvrir"));
    if (t.toCheck.length) cards.push(task("", "c-yellow", `Check du matin : ${t.toCheck.length} compte(s)`, "Regarde si chaque compte marche encore.", "check", "Commencer"));
    if (t.toReplace.length) cards.push(task("", "c-red", `${t.toReplace.length} compte(s) sauté(s) à remplacer`, "Crée un nouveau compte : il prend la place du mort.", "create", "Remplacer"));
    if (t.warmup.length) cards.push(task("", "c-yellow", `${t.warmup.length} warm-up à finir`, "Termine le warm-up des comptes créés.", "warmup", "Ouvrir"));
    if (t.setupReady.length) cards.push(task("", "c-blue", `${t.setupReady.length} compte(s) prêt(s) pour le setup`, "Photo, bio, lien, post épinglé.", "setup", "Faire le setup"));
    if (t.toConnect.length) cards.push(task("", "c-violet", `${t.toConnect.length} compte(s) à mettre sur Metricool`, "Relie le compte puis planifie.", "metricool", "Relier"));
    if (t.toPlan.length) cards.push(task("", "c-green", `${t.toPlan.length} compte(s) à planifier`, "1 clic : le CRM programme les posts.", "metricool", "Planifier"));
    if (t.reserveMissing) cards.push(task("", "c-pink", `Crée ${t.reserveMissing} compte(s) de réserve`, `Objectif : ${S.data.settings.reserveTarget} comptes d'avance si un compte saute.`, "create", "Créer"));
    const waiting = t.setupWaiting.length ? `<p class="muted">${t.setupWaiting.length} compte(s) en attente des 24h avant le setup.</p>` : "";
    return `<h2>Bonjour ${esc(S.data.me.name)}</h2><p class="lead">Voici ce qu'il reste à faire aujourd'hui, dans l'ordre.</p>
      <div class="stats">${stat("c-green", t.active, "comptes actifs")}${stat("c-violet", t.reserve, "en réserve")}${stat("c-yellow", t.toCheck.length, "à checker")}${stat("c-red", t.toReplace.length, "à remplacer")}</div>
      ${cards.length ? `<div class="card list">${cards.join("")}</div>` : '<div class="card done-all"><b>Tout est à jour.</b><span>Si tu as le temps, crée un compte de réserve.</span></div>'}${waiting}`;
  },

  create() {
    const w = S.wiz || (S.wiz = { step: 1, f: {} });
    const t = S.data.tasks;
    const replacing = t.toReplace.length ? acc(t.toReplace[0]) : null;
    const ip = freshIp();
    const ipUsed = ip && S.data.accounts.some((a) => a.ip === ip.ip);
    const bar = `<div class="steps">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= w.step ? "on" : ""}"></span>`).join("")}</div>`;
    const head = `<h2>Créer un compte</h2>${replacing ? `<div class="alert c-red">Ce compte remplace <b>@${esc(replacing.pseudo)}</b> (groupe ${esc(group(replacing.group).name)}).</div>` : ""}${bar}`;
    const nav = (canNext, label = "Étape suivante") =>
      `<div class="row" style="margin-top:16px">${w.step > 1 ? '<button class="btn ghost" data-act="wizBack">Retour</button>' : ""}<div class="spacer"></div><button class="btn" data-act="wizNext" ${canNext ? "" : "disabled"}>${label}</button></div>`;
    const proxy = parseProxy(S.data.settings.proxy);
    if (w.step === 1)
      return `${head}<div class="card"><div class="stepnum">Étape 1 sur 5</div><h3>Change l'IP</h3>
        <p>Clique sur le bouton, puis attends que la nouvelle IP s'affiche.</p>
        <button class="btn big rot" data-act="rotate" data-wait="Changement de l'IP...">Changer l'IP</button>
        ${ip ? `<div class="alert ${ipUsed ? "c-red" : "c-green"}">${ipUsed ? "Cette IP a déjà servi. Rechange-la." : `Nouvelle IP : <b>${esc(ip.ip)}</b> ${esc(ip.country)} (${ago(ip.at)})`}</div>` : '<div class="alert c-yellow">Pas encore d\'IP fraîche.</div>'}
        ${nav(ip && !ipUsed)}</div>${sopBlock("rotation")}`;
    if (w.step === 2)
      return `${head}<div class="card"><div class="stepnum">Étape 2 sur 5</div><h3>Nouveau profil GeeLark</h3>
        <ol><li>Ouvre GeeLark.</li><li>Crée un <b>nouveau profil</b> (1 profil = 1 compte).</li><li>Mets le proxy avec les infos ci-dessous (type HTTP).</li></ol>
        <a class="btn light" href="${esc(S.data.settings.geelarkUrl)}" target="_blank" rel="noopener">Ouvrir GeeLark</a>
        ${proxy ? copyLine("Hôte", proxy.host) + copyLine("Port", proxy.port) + copyLine("Utilisateur", proxy.user) + copyLine("Mot de passe", proxy.pass) : '<div class="alert c-red">Proxy pas encore réglé (demande à Awen).</div>'}
        <label class="f">Nom du profil GeeLark <small>(facultatif)</small></label><input data-f="geelarkProfile" value="${esc(w.f.geelarkProfile || "")}" placeholder="ex : profil 12" />
        ${videoEmbed(S.data.settings.videos?.creation)}${nav(true)}</div>`;
    if (w.step === 3)
      return `${head}<div class="card"><div class="stepnum">Étape 3 sur 5</div><h3>Prends un numéro</h3>
        ${S.data.settings.smsSiteUrl ? `<a class="btn light" href="${esc(S.data.settings.smsSiteUrl)}" target="_blank" rel="noopener">Ouvrir le site SMS</a>` : '<div class="alert c-yellow">Lien du site SMS pas encore réglé.</div>'}
        <label class="f">Numéro utilisé</label><input data-f="phone" inputmode="tel" value="${esc(w.f.phone || "")}" placeholder="+33 6 12 34 56 78" />
        ${nav(true)}</div>`;
    if (w.step === 4)
      return `${head}<div class="card"><div class="stepnum">Étape 4 sur 5</div><h3>Crée le compte Instagram puis Threads</h3>
        <label class="f">Pseudo</label><input data-f="pseudo" value="${esc(w.f.pseudo || "")}" placeholder="pseudo sans @" autocapitalize="off" />
        <label class="f">Mot de passe <button class="btn sm light" data-act="genPass">Générer</button></label><input data-f="password" value="${esc(w.f.password || "")}" autocapitalize="off" />
        <label class="f">Email <small>(facultatif)</small></label><input data-f="email" value="${esc(w.f.email || "")}" autocapitalize="off" />
        <label class="f">Mot de passe email <small>(facultatif)</small></label><input data-f="emailPassword" value="${esc(w.f.emailPassword || "")}" autocapitalize="off" />
        ${nav(true)}</div>`;
    if (w.step === 5)
      return `${head}<div class="card"><div class="stepnum">Étape 5 sur 5</div><h3>Le compte marche ?</h3>
        <p>Tu arrives sur le fil Threads, sans blocage, sans demande de vérif ? Alors il marche.</p>
        ${copyLine("Pseudo", w.f.pseudo)}${copyLine("Numéro", w.f.phone)}
        <div class="row" style="margin-top:14px"><button class="btn big ok" data-act="wizCreate" data-wait="Enregistrement...">Oui, il marche</button></div>
        <div class="row" style="margin-top:10px"><button class="btn big bad" data-act="wizFail">Non, ça n'a pas marché</button></div>
        <div class="row" style="margin-top:10px"><button class="btn ghost" data-act="wizBack">Retour</button></div></div>`;
    if (w.step === 6) {
      const a = acc(w.createdId);
      return `<h2>Warm-up de @${esc(a?.pseudo || "")}</h2>${warmupCard(a, true)}`;
    }
    return "";
  },

  warmup() {
    const list = S.data.tasks.warmup.map(acc).filter(Boolean);
    return `<h2>Warm-up</h2><p class="lead">Les comptes qui viennent d'être créés. Fais le warm-up puis valide.</p>
      ${list.length ? list.map((a) => warmupCard(a, false)).join("") : '<div class="card done-all"><b>Aucun warm-up en cours.</b></div>'}${sopBlock("warmup")}`;
  },

  setup() {
    const ready = S.data.tasks.setupReady.map(acc).filter(Boolean);
    const waiting = S.data.tasks.setupWaiting.map(acc).filter(Boolean);
    if (S.setup && acc(S.setup.id)?.status === "attente_setup") return setupWizard(acc(S.setup.id));
    S.setup = null;
    return `<h2>Setup (24h après)</h2><p class="lead">Photo, bio, lien, post épinglé.</p>
      ${ready.length ? `<div class="grid">${ready.map((a) => `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div>${gpill(a.group)}<button class="btn" data-act="startSetup" data-id="${a.id}">Faire le setup</button></div>`).join("")}</div>` : '<div class="card done-all"><b>Aucun setup prêt pour l\'instant.</b></div>'}
      ${waiting.length ? `<h3>Pas encore (attendre 24h)</h3><div class="grid">${waiting.map((a) => `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div><span class="muted">Setup possible ${ago(a.setupDueAt)}</span>${isAdmin() ? `<button class="btn sm ghost" data-act="startSetup" data-id="${a.id}">Forcer (admin)</button>` : ""}</div>`).join("")}</div>` : ""}
      ${sopBlock("setup")}`;
  },

  metricool() {
    const toConnect = S.data.tasks.toConnect.map(acc).filter(Boolean);
    const active = S.data.accounts.filter((a) => ["actif", "shadowban", "restreint"].includes(a.status));
    const now = Date.now();
    const upcoming = (id) => S.data.posts.filter((p) => p.accountId === id && p.status === "programme" && new Date(p.at).getTime() > now);
    const brandOpts = (S.brands || []).filter((b) => !b.linkedTo);
    return `<h2>Metricool</h2><p class="lead">Relie les comptes, puis 1 clic pour planifier.</p>
      ${!S.data.configured.metricool ? '<div class="alert c-red">Metricool pas encore branché (Réglages, admin).</div>' : ""}
      <h3>À relier (${toConnect.length})</h3>
      ${toConnect.length ? `<div class="card"><ol><li>Dans Metricool, crée une marque au nom du compte.</li><li>Connecte Threads <b>depuis le profil GeeLark du compte</b>.</li><li>Clique "Charger mes marques", choisis-la, clique Relier.</li></ol>
        <div class="row"><a class="btn light" href="${esc(S.data.settings.metricoolUrl)}" target="_blank" rel="noopener">Ouvrir Metricool</a><button class="btn" data-act="loadBrands" data-wait="Chargement...">Charger mes marques</button></div></div>
        <div class="grid">${toConnect.map((a) => `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div>${gpill(a.group)}
          ${S.brands ? `<select data-brand="${a.id}"><option value="">Choisis la marque...</option>${brandOpts.map((b) => `<option value="${esc(b.blogId)}">${esc(b.label || "sans nom")} ${b.threads ? "(Threads connecté : " + esc(b.threads) + ")" : "(Threads non connecté)"}</option>`).join("")}</select><button class="btn" data-act="link" data-id="${a.id}" data-wait="Liaison...">Relier</button>` : '<span class="muted">Clique d\'abord sur "Charger mes marques".</span>'}</div>`).join("")}</div>` : '<div class="card muted">Rien à relier.</div>'}
      <h3>Comptes actifs (${active.length})</h3>
      ${active.length ? `<div class="card"><button class="btn big ok" data-act="planAll" data-wait="Planification de tous les comptes...">Planifier TOUS les comptes (3 jours)</button></div>` : ""}
      <div class="grid">${active.map((a) => {
        const up = upcoming(a.id);
        return `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div><div class="row">${gpill(a.group)}${pill(a.status)}</div>
          <span class="muted">${up.length} post(s) programmé(s)${a.plannedUntil ? ` · jusqu'au ${esc(a.plannedUntil)}` : ""}</span>
          ${up.slice(0, 3).map((p) => `<span class="muted">${esc(p.local.replace("T", " ").slice(0, 16))}</span>`).join("")}
          <div class="row"><button class="btn sm" data-act="plan" data-id="${a.id}" data-days="3" data-wait="...">+3 jours</button><button class="btn sm light" data-act="plan" data-id="${a.id}" data-days="7" data-wait="...">+7 jours</button><button class="btn sm ghost" data-act="manual" data-id="${a.id}">Post à la main</button></div></div>`;
      }).join("")}</div>${sopBlock("metricool")}`;
  },

  check() {
    const list = S.data.tasks.toCheck.map(acc).filter(Boolean);
    return `<h2>Check du matin</h2><p class="lead">Ouvre chaque profil. Choisis le bon bouton.</p>
      ${list.length ? list.map((a) => `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span><div class="spacer"></div>${pill(a.status)}</div>
        <div class="row"><a class="btn light" href="${threadsUrl(a.pseudo)}" target="_blank" rel="noopener">Ouvrir le profil</a><input type="number" min="0" placeholder="Followers (facultatif)" data-followers="${a.id}" style="max-width:220px" /></div>
        <div class="row"><button class="btn ok" data-act="check" data-st="actif" data-id="${a.id}">OK</button><button class="btn warn" data-act="check" data-st="shadowban" data-id="${a.id}">Shadowban</button><button class="btn warn" data-act="check" data-st="restreint" data-id="${a.id}">Restreint</button><button class="btn bad" data-act="dead" data-id="${a.id}">Sauté</button></div></div>`).join("") : '<div class="card done-all"><b>Check du jour terminé. Bravo.</b></div>'}
      ${sopBlock("check")}${sopBlock("remplacement")}`;
  },

  accounts() {
    const f = S.filter;
    const q = S.search.toLowerCase();
    let list = S.data.accounts;
    if (f === "vivants") list = list.filter((a) => a.status !== "saute");
    else if (f !== "tous") list = list.filter((a) => a.status === f);
    if (q) list = list.filter((a) => [a.pseudo, a.phone, a.email, a.ip, String(a.num)].some((x) => String(x || "").toLowerCase().includes(q)));
    const chips = [["vivants", "Vivants"], ["tous", "Tous"], ...Object.entries(S.data.statusLabels)];
    return `<h2>Comptes</h2>
      <div class="chips">${chips.map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-filter="${k}">${esc(l)} <b>${k === "vivants" ? S.data.accounts.filter((a) => a.status !== "saute").length : k === "tous" ? S.data.accounts.length : S.data.accounts.filter((a) => a.status === k).length}</b></button>`).join("")}</div>
      <input placeholder="Chercher (pseudo, numéro, IP...)" data-search value="${esc(S.search)}" style="margin-bottom:14px" />
      <div class="grid">${list.map((a) => `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div>
        <div class="row">${pill(a.status)}${gpill(a.group)}</div>
        <span class="muted">Créé ${ago(a.createdAt)} par ${esc(a.createdBy)} · IP ${esc(a.ip || "?")}</span>
        ${a.replaces ? `<span class="muted">Remplace @${esc(acc(a.replaces)?.pseudo || "?")}</span>` : ""}${a.replacedBy ? `<span class="muted">Remplacé par @${esc(acc(a.replacedBy)?.pseudo || "?")}</span>` : ""}
        <div class="row"><button class="btn sm light" data-act="copy" data-v="${esc(a.pseudo)}">Pseudo</button><button class="btn sm light" data-act="copy" data-v="${esc(a.password)}">Mot de passe</button><button class="btn sm light" data-act="copy" data-v="${esc(a.phone)}">Numéro</button><a class="btn sm light" href="${threadsUrl(a.pseudo)}" target="_blank" rel="noopener">Profil</a><button class="btn sm ghost" data-act="edit" data-id="${a.id}"></button></div></div>`).join("") || '<div class="card muted">Aucun compte ici.</div>'}</div>`;
  },

  sop() {
    return `<h2>SOP</h2><p class="lead">Tout ce qu'il faut savoir. Regarde la vidéo, suis les étapes.</p>${Object.keys(SOP).map((k, i) => sopBlock(k, i === 0)).join("")}
      ${S.data.settings.sopExtra ? `<div class="card sop"><b>Règles en plus</b><div style="white-space:pre-wrap;margin-top:8px">${esc(S.data.settings.sopExtra)}</div></div>` : ""}`;
  },

  dash() {
    const A = S.data.accounts;
    const since = Date.now() - 7 * 864e5;
    const created7 = A.filter((a) => new Date(a.createdAt).getTime() > since).length;
    const dead7 = A.filter((a) => a.deadAt && new Date(a.deadAt).getTime() > since).length;
    const total = A.length;
    const dead = A.filter((a) => a.status === "saute").length;
    const survival = total ? Math.round(((total - dead) / total) * 100) : 0;
    const fails7 = (S.data.logs || []).filter((l) => l.action === "creation_ratee" && new Date(l.at).getTime() > since).length;
    const upcoming = S.data.posts.filter((p) => p.status === "programme" && new Date(p.at).getTime() > Date.now()).length;
    const logs = (S.data.logs || []).filter((l) => !S.logFilter || l.action === S.logFilter || l.who === S.logFilter);
    const actions = [...new Set((S.data.logs || []).map((l) => l.action))];
    const alerts = S.data.alerts || [];
    return `<h2>Dashboard</h2>
      <div class="stats">${stat("c-green", S.data.tasks.active, "actifs")}${stat("c-violet", S.data.tasks.reserve, "en réserve")}${stat("c-blue", created7, "créés (7j)")}${stat("c-red", dead7, "sautés (7j)")}${stat("c-yellow", survival + "%", "taux de survie")}${stat("c-pink", fails7, "créations ratées (7j)")}${stat("c-blue", upcoming, "posts programmés")}</div>
      <div class="card"><div class="row"><b>Santé Metricool</b><div class="spacer"></div><button class="btn sm" data-act="health" data-wait="Vérification...">Vérifier maintenant</button></div>
        ${alerts.length ? alerts.map((x) => `<div class="alert c-red">@${esc(x.pseudo)} : ${esc(x.msg)}</div>`).join("") : '<p class="muted">Aucune alerte.</p>'}</div>
      <div class="card"><div class="row"><b>Logs</b><div class="spacer"></div><select data-logfilter style="max-width:240px"><option value="">Tout</option>${actions.map((a) => `<option value="${esc(a)}" ${S.logFilter === a ? "selected" : ""}>${esc(LOGS[a] || a)}</option>`).join("")}</select></div>
        <div style="overflow:auto"><table class="tbl"><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détails</th></tr>${logs.slice(0, 200).map((l) => `<tr><td>${fmt(l.at)}</td><td>${esc(l.who)}</td><td>${esc(LOGS[l.action] || l.action)}</td><td class="muted">${esc(logDetails(l))}</td></tr>`).join("")}</table></div></div>`;
  },

  content() {
    const st = S.data.settings;
    const usedLinks = new Map(S.data.accounts.filter((a) => a.status !== "saute" && a.link).map((a) => [a.link, a.pseudo]));
    const pfps = S.data.media.filter((m) => m.kind === "pfp");
    return `<h2>Contenu</h2><p class="lead">Textes, photos, bios, liens. Le CRM pioche dedans tout seul.</p>
      <div class="card"><b>Les 42 textes de Bilot</b> <span class="muted">(déjà postés et validés)</span><div class="row" style="margin-top:10px"><select data-seedgroup style="max-width:220px">${st.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select><button class="btn" data-act="seed" data-wait="Import...">Importer dans ce groupe</button></div></div>
      ${st.groups.map((g) => {
        const texts = S.data.texts.filter((t) => t.group === g.id);
        const photos = S.data.media.filter((m) => m.group === g.id && m.kind !== "pfp");
        return `<div class="card"><h3 style="margin-top:0"><span class="pill" style="background:${esc(g.color)}">${esc(g.name)}</span> ${texts.filter((t) => !t.off).length} textes${g.withPhoto ? ` · ${photos.length} photos` : ""}</h3>
          <details><summary>Ajouter des textes</summary><p class="muted">Un texte par ligne. Option : <code>texte || traduction</code></p><textarea data-bulk="${g.id}"></textarea><button class="btn" data-act="bulk" data-g="${g.id}">Ajouter</button></details>
          ${g.withPhoto ? `<details><summary>Photos (${photos.length})</summary><input type="file" accept="image/*" multiple data-upload="${g.id}" /><div class="thumbs" style="margin-top:10px">${photos.map((m) => `<figure><img loading="lazy" src="/api/media/${m.id}" /><button class="btn sm bad" data-act="delMedia" data-id="${m.id}"></button></figure>`).join("")}</div></details>` : ""}
          <details><summary>Voir les textes</summary>${texts.map((t) => `<div class="textline ${t.off ? "off" : ""}"><div class="x">${esc(t.text)}${t.fr ? `<div class="muted">${esc(t.fr)}</div>` : ""}</div><button class="btn sm light" data-act="toggleText" data-id="${t.id}">${t.off ? "Activer" : "Pause"}</button><button class="btn sm ghost" data-act="delText" data-id="${t.id}"></button></div>`).join("") || '<p class="muted">Aucun texte.</p>'}</details></div>`;
      }).join("")}
      <div class="card"><h3 style="margin-top:0">Photos de profil (${pfps.length})</h3><input type="file" accept="image/*" multiple data-upload="__pfp" /><div class="thumbs" style="margin-top:10px">${pfps.map((m) => `<figure><img loading="lazy" src="/api/media/${m.id}" /><button class="btn sm bad" data-act="delMedia" data-id="${m.id}"></button></figure>`).join("")}</div></div>
      <div class="card"><h3 style="margin-top:0">Bios</h3><p class="muted">Une bio par ligne. Le CRM en propose une au hasard au setup.</p><textarea data-set="bios">${esc((st.bios || []).join("\n"))}</textarea>
        <h3>Post épinglé</h3><textarea data-set="pinnedPost">${esc(st.pinnedPost || "")}</textarea>
        <h3>Liens (un par compte)</h3><p class="muted">Un lien TinyURL par ligne. Chaque nouveau compte prend le prochain lien libre.</p><textarea data-set="links">${esc((st.links || []).join("\n"))}</textarea>
        <p class="muted">${(st.links || []).map((l) => (usedLinks.has(l) ? `${esc(l)} @${esc(usedLinks.get(l))}` : `${esc(l)} libre`)).join("<br>")}</p>
        <button class="btn" data-act="saveContent" data-wait="...">Enregistrer</button></div>`;
  },

  settings() {
    const st = S.data.settings;
    const c = S.data.configured;
    const vids = Object.keys(SOP);
    return `<h2>Réglages</h2>
      <div class="card"><h3 style="margin-top:0">Connexions <small class="muted">(cachées après enregistrement, c'est normal)</small></h3>
        <div class="health">${[["Rotation IP", c.rotation], ["Metricool", c.metricool], ["Proxy", c.proxy]].map(([l, ok]) => `<span class="tag ${ok ? "ok" : "miss"}">${l}</span>`).join("")}</div>
        <label class="f">1. Lien de rotation IP ${c.rotation ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'}</label><input type="password" data-sec="rotationUrl" placeholder="${c.rotation ? "enregistré (colle un autre lien pour le remplacer)" : "colle le ROTATION LINK du proxy"}" autocomplete="off" />
        <label class="f">2. Token API Metricool ${c.mcToken ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(Metricool Paramètres du compte onglet API Copier)</small></label><input type="password" data-sec="mcToken" placeholder="${c.mcToken ? "enregistré (colle un autre token pour le remplacer)" : "colle le token"}" autocomplete="off" />
        <label class="f">3. userId Metricool ${c.mcUserId ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(le nombre, ou colle simplement l'adresse de Metricool)</small></label><input data-sec="mcUserId" placeholder="${c.mcUserId ? "enregistré" : "ex : 5978155 ou https://app.metricool.com/...userId=..."}" autocomplete="off" />
        <label class="f">4. Proxy ${c.proxy ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(ip:port:user:pass ou la ligne HTTP copiée)</small></label><input type="password" data-sec="proxy" placeholder="${c.proxy ? "enregistré (colle un autre proxy pour le remplacer)" : "hote:port:user:pass"}" autocomplete="off" />
        <div class="row" style="margin-top:12px"><button class="btn" data-act="saveSecrets" data-wait="...">Enregistrer les connexions</button><button class="btn light" data-act="testMc" data-wait="Test...">Tester Metricool</button><button class="btn light" data-act="testIp" data-wait="Test...">Tester le proxy</button></div></div>
      <div class="card"><h3 style="margin-top:0">Liens</h3>
        <label class="f">Site SMS</label><input data-st="smsSiteUrl" value="${esc(st.smsSiteUrl)}" />
        <label class="f">Lien GeeLark</label><input data-st="geelarkUrl" value="${esc(st.geelarkUrl)}" />
        <label class="f">Lien Metricool</label><input data-st="metricoolUrl" value="${esc(st.metricoolUrl)}" /></div>
      <div class="card"><h3 style="margin-top:0">Planification</h3>
        <label class="f">Fuseau horaire de la cible <small>(Asia/Taipei = Taïwan, Singapour, Hong Kong)</small></label><input data-st="timezone" value="${esc(st.timezone)}" />
        <label class="f">Posts par jour et par compte</label><input type="number" min="1" max="10" data-st="postsPerDay" value="${esc(st.postsPerDay)}" />
        <label class="f">Créneaux <small>(HH:MM séparés par des virgules)</small></label><input data-st="slots" value="${esc((st.slots || []).join(", "))}" />
        <label class="f">Décalage aléatoire (± minutes)</label><input type="number" min="0" max="120" data-st="jitterMin" value="${esc(st.jitterMin)}" />
        <label class="f">Comptes de réserve visés</label><input type="number" min="0" max="50" data-st="reserveTarget" value="${esc(st.reserveTarget)}" />
        <label class="f">Heures entre création et setup</label><input type="number" min="0" max="168" data-st="warmupHours" value="${esc(st.warmupHours)}" /></div>
      <div class="card"><h3 style="margin-top:0">Groupes</h3><p class="muted">Un groupe par ligne : <code>id | Nom | photo(oui/non) | couleur</code></p>
        <textarea data-st="groups">${esc(st.groups.map((g) => `${g.id} | ${g.name} | ${g.withPhoto ? "oui" : "non"} | ${g.color}`).join("\n"))}</textarea></div>
      <div class="card"><h3 style="margin-top:0">Vidéos des SOP</h3><p class="muted">Lien YouTube, Loom ou Google Drive.</p>
        ${vids.map((k) => `<label class="f">${esc(SOP[k].t)}</label><input data-vid="${k}" value="${esc(st.videos?.[k] || "")}" />`).join("")}
        <label class="f">Règles en plus (affichées dans SOP)</label><textarea data-st="sopExtra">${esc(st.sopExtra || "")}</textarea>
        <div class="row" style="margin-top:12px"><button class="btn" data-act="saveSettings" data-wait="...">Enregistrer les réglages</button></div></div>
      <div class="card"><h3 style="margin-top:0">Accès</h3>
        ${(S.data.users || []).map((u) => `<div class="row" style="margin:6px 0"><b>${esc(u.name)}</b><span class="pill ${u.role === "admin" ? "c-violet" : "c-blue"}">${u.role === "admin" ? "Admin" : "VA"}</span>${u.name !== S.data.me.name ? `<button class="btn sm ghost" data-act="delUser" data-name="${esc(u.name)}">Retirer</button>` : ""}</div>`).join("")}
        <div class="row" style="margin-top:10px"><input data-u="name" placeholder="Prénom" style="max-width:180px" /><input data-u="pin" placeholder="Code (4-8 chiffres)" inputmode="numeric" style="max-width:180px" /><select data-u="role" style="max-width:140px"><option value="va">VA</option><option value="admin">Admin</option></select><button class="btn" data-act="saveUser">Ajouter / changer le code</button></div></div>`;
  },
};

// ------------------------------------------------------------ journal lisible
const LOGS = {
  premier_acces: "Premier accès", connexion: "Connexion", code_faux: "Code faux", ip_changee: "IP changée", ip_pas_changee: "IP pas changée",
  compte_cree: "Compte créé", creation_ratee: "Création ratée", warmup_fait: "Warm-up fait", setup_fait: "Setup fait", metricool_relie: "Relié à Metricool",
  metricool_delie: "Délié de Metricool", planif: "Posts planifiés", check: "Check", compte_saute: "Compte sauté", compte_modifie: "Compte modifié",
  compte_supprime: "Compte supprimé", textes_ajoutes: "Textes ajoutés", photo_ajoutee: "Photo ajoutée", reglages_modifies: "Réglages modifiés",
  secrets_modifies: "Connexions modifiées", utilisateur_modifie: "Accès modifié", utilisateur_supprime: "Accès retiré",
};
function logDetails(l) {
  const out = [];
  if (l.pseudo) out.push("@" + l.pseudo);
  if (l.ip) out.push((l.before ? `${l.before} > ` : "IP ") + l.ip + (l.country ? ` (${l.country})` : ""));
  if (l.status) out.push(S.data.statusLabels[l.status] || l.status);
  if (l.followers != null) out.push(`${l.followers} followers`);
  if (l.posts != null) out.push(`${l.posts} post(s)` + (l.jusquau ? ` jusqu'au ${l.jusquau}` : ""));
  if (l.problemes?.length) out.push("Souci : " + l.problemes[0]);
  if (l.postsAnnules != null) out.push(`${l.postsAnnules} post(s) annulé(s)`);
  if (l.group) out.push("Groupe " + group(l.group).name);
  if (l.replaces) out.push("remplace @" + l.replaces);
  if (l.phone) out.push(l.phone);
  if (l.reason) out.push(l.reason);
  if (l.added != null) out.push(`${l.added} ajouté(s)`);
  if (l.blogId) out.push("marque " + l.blogId);
  if (l.name) out.push(l.name);
  return out.join(", ");
}

// ------------------------------------------------------------ petits blocs
function task(emo, color, title, desc, tab, btn) {
  return `<div class="task"><span class="dot ${color}"></span><div class="task-text"><b>${esc(title)}</b><span>${esc(desc)}</span></div><button class="btn sm" data-tab="${tab}">${esc(btn)}</button></div>`;
}
function stat(color, n, label) {
  return `<div class="stat"><b>${esc(n)}</b><span><i class="dot ${color}"></i>${esc(label)}</span></div>`;
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
  return host && port ? { host, port, user: user || "", pass: pass || "" } : null;
}
function warmupCard(a, withTimer) {
  if (!a) return "";
  return `<div class="card"><div class="head row"><span class="num">#${a.num}</span><b>@${esc(a.pseudo)}</b>${gpill(a.group)}</div>
    <div class="timer" data-timer="${a.id}">15:00</div><div class="row"><button class="btn light" data-act="startTimer" data-id="${a.id}">▶️ Lancer le chrono 15 min</button></div>
    <div class="checklist" data-wcheck="${a.id}">${SOP.warmup.steps.map((s) => `<label><input type="checkbox" /> ${esc(s)}</label>`).join("")}</div>
    <button class="btn big ok" data-act="warmupDone" data-id="${a.id}" data-wait="...">Warm-up fini</button>
    ${withTimer ? '<div class="row" style="margin-top:10px"><button class="btn ghost" data-act="wizReset">Créer un autre compte</button></div>' : ""}</div>`;
}
function setupWizard(a) {
  const st = S.data.settings;
  const s = S.setup;
  if (!s.bio) s.bio = (st.bios || [])[Math.floor(Math.random() * (st.bios || []).length)] || "";
  const pfps = S.data.media.filter((m) => m.kind === "pfp");
  if (!s.pfp && pfps.length) s.pfp = pfps[Math.floor(Math.random() * pfps.length)].id;
  const ip = freshIp();
  return `<h2>Setup de @${esc(a.pseudo)}</h2>
    <div class="card"><div class="stepnum">1. IP + connexion</div>
      <button class="btn rot" data-act="rotate" data-wait="Changement...">Changer l'IP</button> ${ip ? `<span class="pill c-green">${esc(ip.ip)}</span>` : '<span class="pill c-yellow">IP pas fraîche</span>'}
      <p>Ouvre le profil GeeLark <b>${esc(a.geelarkProfile || "du compte")}</b>.</p>${copyLine("Pseudo", a.pseudo)}${copyLine("Mot de passe", a.password)}</div>
    <div class="card"><div class="stepnum">2. Photo de profil</div>
      ${s.pfp ? `<div class="thumbs" style="max-width:220px"><figure><img src="/api/media/${s.pfp}" /></figure></div><div class="row" style="margin-top:8px"><a class="btn light" href="/api/media/${s.pfp}" download>Télécharger</a><button class="btn ghost" data-act="otherPfp">Une autre</button></div>` : '<p class="muted">Pas de photo de profil dans le CRM : utilise celle donnée par Awen / Bilot.</p>'}</div>
    <div class="card"><div class="stepnum">3. Bio</div><textarea data-setupbio>${esc(s.bio)}</textarea><div class="row"><button class="btn light" data-act="copyBio">Copier la bio</button>${(st.bios || []).length > 1 ? '<button class="btn ghost" data-act="otherBio">Une autre</button>' : ""}</div></div>
    <div class="card"><div class="stepnum">4. Lien</div>${a.link ? copyLine("Lien", a.link) : '<div class="alert c-red">Pas de lien pour ce compte. Demande à Awen / Bilot d\'ajouter des liens (onglet Contenu).</div>'}</div>
    <div class="card"><div class="stepnum">5. Post épinglé</div>${st.pinnedPost ? `<div style="white-space:pre-wrap" class="copyline"><span class="v">${esc(st.pinnedPost)}</span><button class="btn sm light" data-act="copy" data-v="${esc(st.pinnedPost)}">Copier</button></div><p class="muted">Publie-le puis épingle-le (••• Épingler).</p>` : '<p class="muted">Modèle de post épinglé pas encore fourni.</p>'}</div>
    <div class="card"><div class="checklist" data-scheck>${["Photo de profil mise", "Bio mise", "Lien mis", "Post épinglé publié et épinglé"].map((x) => `<label><input type="checkbox" /> ${x}</label>`).join("")}</div>
      <button class="btn big ok" data-act="setupDone" data-id="${a.id}" data-wait="...">Setup fini</button><div class="row" style="margin-top:10px"><button class="btn ghost" data-act="setupCancel">Retour à la liste</button></div></div>`;
}
function genPass() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const n = new Uint8Array(12);
  crypto.getRandomValues(n);
  return Array.from(n, (x) => a[x % a.length]).join("") + "!" + (10 + (n[0] % 89));
}
async function compress(file) {
  const img = await createImageBitmap(file);
  const max = 1600;
  const r = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * r);
  c.height = Math.round(img.height * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

// ------------------------------------------------------------ apres rendu
function afterRender() {
  // remettre les chronos en route
  document.querySelectorAll("[data-timer]").forEach((el) => {
    const end = Number(sessionStorage.getItem("timer_" + el.dataset.timer) || 0);
    if (end) tick(el, end);
  });
}
function tick(el, end) {
  const draw = () => {
    const s = Math.max(0, Math.round((end - Date.now()) / 1000));
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    if (!s) {
      el.textContent = "00:00";
      clearInterval(timerInt);
    }
  };
  draw();
  clearInterval(timerInt);
  timerInt = setInterval(draw, 1000);
}

// ------------------------------------------------------------ actions
const ACT = {
  copy: (b) => copy(b.dataset.v),
  closeModal,
  logout,
  async rotate(b) {
    await run(b, async () => {
      const r = await api("rotate", {});
      S.data.lastIp = r;
      toast(`Nouvelle IP ${r.ip} ${r.country || ""}`);
      if (r.usedBy) toast(`IP déjà vue sur @${r.usedBy}, rechange-la`, true);
      await refresh();
    });
  },
  wizNext() {
    const w = S.wiz;
    readWizFields();
    if (w.step === 3 && !w.f.phone) return toast("Mets le numéro.", true);
    if (w.step === 4 && (!w.f.pseudo || !w.f.password)) return toast("Mets le pseudo et le mot de passe.", true);
    w.step++;
    render();
  },
  wizBack() {
    readWizFields();
    S.wiz.step = Math.max(1, S.wiz.step - 1);
    render();
  },
  wizReset() {
    S.wiz = { step: 1, f: {} };
    render();
  },
  genPass() {
    readWizFields();
    S.wiz.f.password = genPass();
    render();
  },
  async wizCreate(b) {
    await run(b, async () => {
      const a = await api("accounts/create", S.wiz.f);
      toast(`@${a.pseudo} enregistré`);
      S.wiz = { step: 6, f: {}, createdId: a.id };
      await refresh();
    });
  },
  wizFail() {
    modal(`<h3>Ça n'a pas marché ?</h3><p>Pas grave. On note et on recommence avec une nouvelle IP.</p>
      <label class="f">Pourquoi ?</label><select id="failwhy"><option>Numéro refusé</option><option>Code SMS jamais reçu</option><option>Compte bloqué direct</option><option>Demande de vérification</option><option>Autre</option></select>
      <button class="btn big bad" style="margin-top:14px" data-act="wizFailSend">Noter et recommencer</button>`);
  },
  async wizFailSend(b) {
    await run(b, async () => {
      await api("accounts/failed", { phone: S.wiz.f.phone, reason: $("#failwhy").value });
      closeModal();
      S.wiz = { step: 1, f: { geelarkProfile: S.wiz.f.geelarkProfile } };
      toast("Noté. Change l'IP et on recommence");
      await refresh();
    });
  },
  startTimer(b) {
    const end = Date.now() + 15 * 60e3;
    sessionStorage.setItem("timer_" + b.dataset.id, end);
    tick($(`[data-timer="${b.dataset.id}"]`), end);
  },
  async warmupDone(b) {
    const boxes = [...document.querySelectorAll(`[data-wcheck="${b.dataset.id}"] input`)];
    if (boxes.some((x) => !x.checked)) return toast("Coche toutes les cases d'abord.", true);
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/warmup`, {});
      sessionStorage.removeItem("timer_" + b.dataset.id);
      toast("Warm-up validé. Setup dans 24h.");
      if (S.wiz?.step === 6) S.wiz = { step: 1, f: {} };
      await refresh();
    });
  },
  startSetup(b) {
    S.setup = { id: b.dataset.id };
    S.tab = "setup";
    render();
  },
  setupCancel() {
    S.setup = null;
    render();
  },
  otherPfp() {
    const pfps = S.data.media.filter((m) => m.kind === "pfp");
    S.setup.pfp = pfps[Math.floor(Math.random() * pfps.length)]?.id;
    render();
  },
  otherBio() {
    const bios = S.data.settings.bios || [];
    S.setup.bio = bios[Math.floor(Math.random() * bios.length)] || "";
    render();
  },
  copyBio() {
    copy($("[data-setupbio]").value);
  },
  async setupDone(b) {
    if ([...document.querySelectorAll("[data-scheck] input")].some((x) => !x.checked)) return toast("Coche toutes les cases d'abord.", true);
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/setup`, { bio: $("[data-setupbio]").value });
      S.setup = null;
      toast("Setup fini ! Prochaine étape : Metricool.");
      await refresh();
    });
  },
  async loadBrands(b) {
    await run(b, async () => {
      S.brands = await api("metricool/brands");
      toast(`${S.brands.length} marque(s) trouvée(s)`);
      render();
    });
  },
  async link(b) {
    const blogId = $(`[data-brand="${b.dataset.id}"]`).value;
    if (!blogId) return toast("Choisis la marque.", true);
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/metricool`, { blogId });
      toast("Relié ! Je planifie 3 jours...");
      const r = await api("metricool/plan", { accountId: b.dataset.id, days: 3 });
      toast(`${r.created.length} post(s) programmé(s)` + (r.problems.length ? " · " + r.problems[0] : ""), !!r.problems.length);
      S.brands = null;
      await refresh();
    });
  },
  async plan(b) {
    await run(b, async () => {
      const r = await api("metricool/plan", { accountId: b.dataset.id, days: Number(b.dataset.days) || 3 });
      toast(`${r.created.length} post(s) programmé(s)` + (r.problems.length ? " · " + r.problems[0] : ""), !!r.problems.length);
      await refresh();
    });
  },
  async planAll(b) {
    await run(b, async () => {
      let n = 0;
      const probs = [];
      for (const a of S.data.accounts.filter((x) => x.status === "actif" && x.blogId)) {
        try {
          const r = await api("metricool/plan", { accountId: a.id, days: 3 });
          n += r.created.length;
          if (r.problems.length) probs.push(`@${a.pseudo} : ${r.problems[0]}`);
        } catch (e) {
          probs.push(`@${a.pseudo} : ${e.message}`);
        }
      }
      toast(`${n} post(s) programmé(s)` + (probs.length ? ` · ${probs.length} souci(s)` : ""), !!probs.length);
      if (probs.length) modal(`<h3>Soucis de planification</h3>${probs.map((p) => `<div class="alert c-red">${esc(p)}</div>`).join("")}`);
      await refresh();
    });
  },
  manual(b) {
    const a = acc(b.dataset.id);
    const texts = S.data.texts.filter((t) => t.group === a.group && !t.off);
    const used = new Set(S.data.posts.filter((p) => p.accountId === a.id).map((p) => p.textId));
    const t = texts.find((x) => !used.has(x.id)) || texts[0];
    const photos = S.data.media.filter((m) => m.group === a.group && m.kind !== "pfp");
    const m = group(a.group).withPhoto ? photos[Math.floor(Math.random() * photos.length)] : null;
    modal(`<h3>Post à la main pour @${esc(a.pseudo)}</h3><p class="muted">Si Metricool bloque : copie, colle dans Metricool, programme.</p>
      ${t ? `<div class="copyline"><span class="v" style="white-space:pre-wrap">${esc(t.text)}</span><button class="btn sm light" data-act="copy" data-v="${esc(t.text)}">Copier</button></div>${t.fr ? `<p class="muted">${esc(t.fr)}</p>` : ""}` : '<p class="muted">Plus de texte libre.</p>'}
      ${m ? `<div class="thumbs" style="max-width:220px"><figure><img src="/api/media/${m.id}" /></figure></div><a class="btn light" href="/api/media/${m.id}" download>Télécharger la photo</a>` : ""}`);
  },
  async check(b) {
    const followers = $(`[data-followers="${b.dataset.id}"]`)?.value;
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/check`, { status: b.dataset.st, followers });
      toast("Noté");
      await refresh();
    });
  },
  dead(b) {
    const a = acc(b.dataset.id);
    modal(`<h3>@${esc(a.pseudo)} a sauté ?</h3><ol><li>Le CRM annule ses posts programmés.</li><li><b>Dans Metricool</b> : ouvre la marque <b>${esc(a.pseudo)}</b> et déconnecte Threads.</li><li>Crée un nouveau compte : il prendra sa place automatiquement.</li></ol>
      ${videoEmbed(S.data.settings.videos?.remplacement)}<label class="f">Note <small>(facultatif)</small></label><input id="deadnote" placeholder="ex : suspendu, demande de selfie..." />
      <button class="btn big bad" style="margin-top:14px" data-act="deadConfirm" data-id="${a.id}" data-wait="...">Oui, il a sauté</button>`);
  },
  async deadConfirm(b) {
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/check`, { status: "saute", note: $("#deadnote").value });
      closeModal();
      toast("Noté. Va dans Créer pour le remplacer.");
      S.wiz = { step: 1, f: {} };
      await refresh();
    });
  },
  edit(b) {
    const a = acc(b.dataset.id);
    const fields = [["pseudo", "Pseudo"], ["password", "Mot de passe"], ["phone", "Numéro"], ["email", "Email"], ["emailPassword", "Mot de passe email"], ["geelarkProfile", "Profil GeeLark"], ["link", "Lien"], ["notes", "Notes"]];
    modal(`<h3>@${esc(a.pseudo)}</h3>${fields.map(([k, l]) => `<label class="f">${l}</label><input data-ed="${k}" value="${esc(a[k] || "")}" />`).join("")}
      ${isAdmin() ? `<label class="f">Groupe</label><select data-ed="group">${S.data.settings.groups.map((g) => `<option value="${g.id}" ${g.id === a.group ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
      <label class="f">Statut</label><select data-ed="status">${Object.entries(S.data.statusLabels).map(([k, l]) => `<option value="${k}" ${k === a.status ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
      <p class="muted">IP de création : ${esc(a.ip || "?")} · Marque Metricool : ${esc(a.blogId || "aucune")}</p>
      <div class="row" style="margin-top:14px"><button class="btn" data-act="saveEdit" data-id="${a.id}" data-wait="...">Enregistrer</button>${a.blogId ? `<button class="btn light" data-act="unlink" data-id="${a.id}">Délier Metricool</button>` : ""}${isAdmin() ? `<div class="spacer"></div><button class="btn sm bad" data-act="delAcc" data-id="${a.id}">Supprimer</button>` : ""}</div>`);
  },
  async saveEdit(b) {
    const body = {};
    document.querySelectorAll("[data-ed]").forEach((el) => (body[el.dataset.ed] = el.value));
    const a = acc(b.dataset.id);
    if (body.status === a.status) delete body.status;
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/edit`, body);
      closeModal();
      toast("Enregistré");
      await refresh();
    });
  },
  async unlink(b) {
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/unlink`, {});
      closeModal();
      toast("Délié de Metricool");
      await refresh();
    });
  },
  async delAcc(b) {
    if (!confirmTwice(b)) return;
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/delete`, {});
      closeModal();
      toast("Supprimé");
      await refresh();
    });
  },
  async health(b) {
    await run(b, async () => {
      const r = await api("metricool/health", {});
      toast(r.length ? `${r.length} alerte(s)` : "Tout est connecté", !!r.length);
      await refresh();
    });
  },
  async bulk(b) {
    const g = b.dataset.g;
    const lines = $(`[data-bulk="${g}"]`).value;
    await run(b, async () => {
      const r = await api("texts/bulk", { group: g, lines });
      toast(`${r.added} texte(s) ajouté(s)`);
      await refresh();
    });
  },
  async seed(b) {
    const g = $("[data-seedgroup]").value;
    await run(b, async () => {
      const list = await (await fetch("/seed-textes.json")).json();
      const r = await api("texts/bulk", { group: g, lines: list.map((x) => `${x.text} || ${x.fr}`).join("\n") });
      toast(`${r.added} texte(s) importé(s) dans ${group(g).name}`);
      await refresh();
    });
  },
  async toggleText(b) {
    await run(b, async () => {
      await api(`texts/${b.dataset.id}/toggle`, {});
      await refresh();
    });
  },
  async delText(b) {
    if (!confirmTwice(b)) return;
    await run(b, async () => {
      await api(`texts/${b.dataset.id}/delete`, {});
      await refresh();
    });
  },
  async delMedia(b) {
    if (!confirmTwice(b)) return;
    await run(b, async () => {
      await api(`media/${b.dataset.id}/delete`, {});
      await refresh();
    });
  },
  async saveContent(b) {
    const lines = (k) => $(`[data-set="${k}"]`).value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    await run(b, async () => {
      await api("settings", { bios: lines("bios"), links: lines("links"), pinnedPost: $('[data-set="pinnedPost"]').value.trim() });
      toast("Enregistré");
      await refresh();
    });
  },
  async saveSecrets(b) {
    const body = {};
    document.querySelectorAll("[data-sec]").forEach((el) => el.value.trim() && (body[el.dataset.sec] = el.value.trim()));
    if (!Object.keys(body).length) return toast("Rien à enregistrer.", true);
    await run(b, async () => {
      const proxy = body.proxy;
      delete body.proxy;
      if (proxy) await api("settings", { proxy });
      if (Object.keys(body).length) await api("secrets", body);
      toast("Enregistré (caché pour la sécurité)");
      await refresh();
    });
  },
  async testMc(b) {
    await run(b, async () => {
      const r = await api("metricool/test", {});
      toast(`Metricool OK : ${r.brands} marque(s)`);
    });
  },
  async testIp(b) {
    await run(b, async () => {
      const r = await api("ip");
      toast(`Proxy OK : ${r.ip} ${r.country} ${r.city}`);
    });
  },
  async saveSettings(b) {
    const v = (k) => $(`[data-st="${k}"]`).value;
    const groups = v("groups").split(/\r?\n/).map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]).map(([id, name, photo, color]) => ({ id: id.toLowerCase().replace(/[^a-z0-9_-]/g, ""), name: name || id, withPhoto: /^o|^y|^1|^t/i.test(photo || ""), color: color || "#eee" }));
    if (!groups.length) return toast("Il faut au moins un groupe.", true);
    const videos = {};
    document.querySelectorAll("[data-vid]").forEach((el) => (videos[el.dataset.vid] = el.value.trim()));
    const body = {
      smsSiteUrl: v("smsSiteUrl").trim(),
      geelarkUrl: v("geelarkUrl").trim(),
      metricoolUrl: v("metricoolUrl").trim(),
      timezone: v("timezone").trim(),
      postsPerDay: Number(v("postsPerDay")) || 3,
      slots: v("slots").split(",").map((x) => x.trim().padStart(5, "0")).filter(Boolean),
      jitterMin: Number(v("jitterMin")) || 0,
      reserveTarget: Number(v("reserveTarget")) || 0,
      warmupHours: Number(v("warmupHours")),
      groups,
      videos,
      sopExtra: v("sopExtra"),
    };
    await run(b, async () => {
      await api("settings", body);
      toast("Réglages enregistrés");
      await refresh();
    });
  },
  async saveUser(b) {
    const v = (k) => $(`[data-u="${k}"]`).value.trim();
    await run(b, async () => {
      await api("users", { name: v("name"), pin: v("pin"), role: v("role") });
      toast("Accès enregistré");
      await refresh();
    });
  },
  async delUser(b) {
    if (!confirmTwice(b)) return;
    await run(b, async () => {
      await api("users", { name: b.dataset.name, remove: true });
      await refresh();
    });
  },
};
function confirmTwice(b) {
  if (b.dataset.armed) return true;
  b.dataset.armed = "1";
  const old = b.textContent;
  b.textContent = "Sûr ?";
  setTimeout(() => {
    delete b.dataset.armed;
    if (document.body.contains(b)) b.textContent = old;
  }, 3000);
  return false;
}
function readWizFields() {
  document.querySelectorAll("[data-f]").forEach((el) => (S.wiz.f[el.dataset.f] = el.value.trim()));
}

// ------------------------------------------------------------ evenements
document.addEventListener("click", async (e) => {
  const pinB = e.target.closest("[data-pin]");
  if (pinB) return onPin(pinB.dataset.pin);
  const tabB = e.target.closest("[data-tab]");
  if (tabB) {
    S.tab = tabB.dataset.tab;
    localStorage.setItem("hq_tab", S.tab);
    window.scrollTo(0, 0);
    return render();
  }
  const fB = e.target.closest("[data-filter]");
  if (fB) {
    S.filter = fB.dataset.filter;
    return render();
  }
  const a = e.target.closest("[data-act]");
  if (a && ACT[a.dataset.act]) {
    e.preventDefault();
    ACT[a.dataset.act](a);
  }
  if (e.target.id === "modal") closeModal();
});
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-search]")) {
    S.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = $("[data-search]");
    el.focus();
    el.setSelectionRange(pos, pos);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.matches("[data-logfilter]")) {
    S.logFilter = e.target.value;
    return render();
  }
  if (e.target.matches("[data-upload]")) {
    const g = e.target.dataset.upload;
    const files = [...e.target.files];
    toast(`Envoi de ${files.length} photo(s)...`);
    let ok = 0;
    for (const f of files) {
      try {
        const dataUrl = await compress(f);
        await api("media/upload", g === "__pfp" ? { kind: "pfp", dataUrl, filename: f.name } : { group: g, dataUrl, filename: f.name });
        ok++;
      } catch (err) {
        toast(`${f.name} : ${err.message}`, true);
      }
    }
    toast(`${ok} photo(s) ajoutée(s)`);
    await refresh();
  }
});
document.addEventListener("keydown", (e) => {
  if (!S.data && /^\d$/.test(e.key)) onPin(e.key);
  if (!S.data && e.key === "Backspace") onPin("del");
  if (!S.data && e.key === "Enter") onPin("go");
  if (e.key === "Escape") closeModal();
});
async function onPin(k) {
  if (k === "del") S.pin = S.pin.slice(0, -1);
  else if (k === "go") {
    try {
      const name = $("#firstname")?.value;
      const r = await api("login", { pin: S.pin, name });
      S.token = r.token;
      localStorage.setItem("hq_token", r.token);
      S.pin = "";
      await refresh();
      return;
    } catch (e) {
      S.pin = "";
      toast(e.message, true);
    }
  } else if (S.pin.length < 8) S.pin += k;
  renderLogin();
}

// ------------------------------------------------------------ demarrage
(async () => {
  try {
    if (S.token) await refresh();
    else {
      S.firstRun = (await api("status")).firstRun;
      render();
    }
  } catch {
    try {
      S.firstRun = (await api("status")).firstRun;
    } catch {}
    render();
  }
  // rafraichit les compteurs chaque minute, mais jamais au milieu d'un assistant ou d'une saisie
  setInterval(() => {
    const working = ["create", "warmup", "setup", "content", "settings"].includes(S.tab) || S.setup;
    if (S.token && S.data && !S.busy && !working && $("#modal").classList.contains("hidden") && !document.activeElement?.matches("input,textarea,select")) refresh().catch(() => {});
  }, 60000);
})();
