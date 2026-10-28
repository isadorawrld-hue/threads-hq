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
  if (S.busy) return toast("Patiente, une action est en cours...", true);
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
const spill = (k) => k ? `<span class="pill">${esc((S.data.strategyLabels || {})[k] || k)}</span>` : "";
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
// traduction FR sous chaque texte chinois montre a la VA (remplie par afterRender via /api/tr, cache dans S.tr)
const HAN = /[\u3400-\u9fff]/;
const frSlot = (t) => (HAN.test(t || "") ? `<div class="frtr" data-fr="${esc(t)}"><span class="frk">FR</span><span class="frv">${esc(S.tr?.[t] || "traduction...")}</span></div>` : "");
function videoEmbed(url) {
  if (!url) return '<div class="novid">Vidéo bientôt ici</div>';
  // tutos .mp4 : avec le son (voix FR), image de titre affichee avant lecture (#t=1)
  if (/\.mp4$/i.test(url)) return `<div class="video"><video src="${esc(url)}#t=1" controls playsinline preload="metadata"></video></div>`;
  if (/\.webm$/i.test(url)) return `<div class="video"><video src="${esc(url)}" controls muted playsinline preload="metadata"></video></div>`;
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
  complet: {
    t: "Tuto complet : créer un compte de A à Z (7 min)",
    steps: ["Les 7 tutos ci-dessous, à la suite.", "Regarde-le une fois en entier.", "Ensuite, utilise les tutos courts (ou le bouton ? de chaque étape) quand tu bloques."],
  },
  rotation: {
    t: "1. Changer l'IP + nouveau téléphone GeeLark",
    steps: ["Clique « Changer l'IP ».", "Attends la nouvelle IP en vert, puis « Étape suivante ».", "GeeLark : nouveau profil (1 profil = 1 compte).", "Copie hôte, port, utilisateur, mot de passe depuis le CRM.", "Type Socks5, puis « Check proxy » : IP en France.", "Advanced settings : Location et Cloud phone language sur « Based on IP ».", "Clique « Create », puis « Start ».", "Note le nom du profil dans le CRM, puis « Étape suivante »."],
  },
  numero: {
    t: "2. Prendre un numéro",
    steps: ["Clique le gros bouton « Numéro France ».", "Ouvre l'appli Threads, touche « Utiliser un numéro de mobile ».", "Copie le numéro complet dans le CRM.", "Colle-le AVEC le +33 : Threads ne le rajoute pas tout seul.", "Le code SMS arrive tout seul dans le CRM. Copie-le dans Threads.", "Pas de code après 3 min : bouton rouge « Pas de code : rembourser », puis reprends un numéro (USA si la France bloque).", "Jamais 2 comptes sur le même numéro."],
  },
  creation: {
    t: "3. Créer le compte",
    steps: ["Mot de passe du compte (retiens-le).", "Date de naissance : plus de 21 ans. Puis le nom.", "Profil public, accepte les conditions, autorise les notifications.", "CRM étape 4 : écris le pseudo (le lien se crée tout seul) et le mot de passe.", "Tu vois le fil Threads sans blocage : « Oui, il marche ». Sinon : « Non », et on recommence avec une nouvelle IP."],
  },
  warmup: {
    t: "4. Warm-up (10 min)",
    steps: ["Juste après la création, dans le même téléphone.", "Clique « Lancer le chrono 10 min » dès le début.", "Scrolle Threads, like 5 à 10 posts, abonne-toi à 3 à 5 comptes de la niche.", "Un commentaire ? Écris-le dans Google Traduction en chinois traditionnel.", "Pendant ces 10 min : zéro post, zéro lien, zéro changement de profil.", "Chrono fini : coche les cases, « Warm-up fini »."],
  },
  strategies: {
    t: "Les 3 stratégies de setup",
    steps: ["Chaque compte a une stratégie, écrite sur sa carte. Suis celle-là, pas une autre.", "Post épinglé : pas de lien dans la bio. Le lien est dans la réponse au post épinglé.", "Lien dans la bio : le lien va dans le champ Lien du profil.", "Relais : aucun lien. Tu cites le post épinglé du compte pivot et tu épingles ta citation.", "Pourquoi : si un compte saute, on ne perd jamais le lien. Et Threads voit 3 profils différents, pas 15 clones."],
  },
  setup: {
    t: "5. Setup du profil",
    steps: ["Même téléphone, même IP : ne change pas l'IP.", "Photo : « Télécharger » dans le CRM, puis « Upload » dans GeeLark, puis Modifier le profil.", "Bio : « Copier la bio », colle-la, Terminé.", "Post épinglé : publie la partie 1, puis colle la partie 2 (le lien) en réponse juste en dessous.", "Coche les cases, « Setup fini »."],
  },
  metricool: {
    t: "6. Connecter Metricool",
    steps: ["Copie le lien Metricool dans le CRM.", "Ouvre-le dans Chrome du téléphone GeeLark du compte. Jamais sur ton PC.", "Touche « Connect a Threads account », autorise les cookies.", "« Connexion », puis pseudo et mot de passe du CRM (boutons Copier).", "Accepte tout. Reviens dans le CRM : « J'ai connecté Threads ». Le CRM programme 3 jours de posts tout seul."],
  },
  planning: {
    t: "7. Le planning",
    steps: ["Onglet Planning : un point = un post. Bleu prévu, vert publié, rouge erreur, orange en retard.", "Case rose = jour vide : clique « Remplir 14 jours pour tous ».", "« +3 jours » / « +7 jours » : ajoutent des posts après le dernier jour prévu.", "Clique un jour pour voir ses textes et leur traduction.", "Colonne Textes en rouge : il manque des textes, préviens ton manager."],
  },
  engage: {
    t: "Engagement (test sur 5 comptes)",
    steps: ["Seulement les 5 comptes marqués « Test engagement ». Les autres : on n'y touche pas.", "Allume le téléphone GeeLark du compte (le sien, jamais un autre).", "10 minutes sur Threads, pas plus.", "Like 3 à 4 posts d'autres modèles de la niche. Maximum 4.", "Commente 3 à 4 posts d'autres modèles, en chinois traditionnel (Google Traduction), court et gentil. Maximum 4.", "Suis 2 personnes maximum.", "Ne publie rien : les posts partent tout seuls avec Metricool. Pas de spam.", "Éteins le téléphone. Dans le CRM : note les followers et clique « Fait (10 min) »."],
  },
  check: {
    t: "Check du matin",
    steps: ["Pour chaque compte : ouvre son profil.", "Le compte marche et ses posts sortent : OK.", "Les posts ne se voient plus depuis un autre compte : Shadowban.", "Message « action limitée » : Restreint.", "Compte suspendu / supprimé / demande de vérification impossible : Sauté."],
  },
  remplacement: {
    t: "Remplacer un compte sauté",
    steps: ["Quand tu cliques Sauté, le CRM libère sa marque Metricool tout seul.", "Clique Créer : le nouveau compte prend la place du mort (même groupe, même stratégie, même lien).", "À l'étape Metricool, il reprend la marque libérée : tu connectes juste Threads."],
  },
};
// ------------------------------------------------------------ aide en direct (indice + bouton ?)
// hint : une phrase toujours visible. more : le pas a pas du bouton ?. trap : l'erreur a eviter.
// La video vient de Reglages (lien), sinon du tuto filme (HELP_TUTOS, .mp4), sinon de la mini video /help/<cle>.webm (HELP_VIDEOS).
const HELP = {
  today: {
    t: "Ta journée",
    hint: "Fais la tâche n° 1, puis la suivante. Rien à retenir.",
    more: ["Les tâches sont triées toutes seules, avec une règle simple.", "D'abord : un compte qui ne poste plus (sauté, remplaçant pas fini, Metricool déconnecté, posts bientôt finis).", "Ensuite : finir les comptes commencés, le plus proche de poster d'abord (Metricool, puis setup, puis warm-up).", "Enfin : préparer la suite (comptes de réserve).", "Clique le bouton de la tâche n° 1, fais-la, reviens ici."],
  },
  rotation: {
    t: "Changer l'IP",
    hint: "Clique « Changer l'IP » et attends l'IP en vert.",
    more: ["1 compte = 1 IP. Toujours une nouvelle IP avant de créer un compte.", "Clique « Changer l'IP » en haut de l'écran.", "Vert : IP neuve, tu peux continuer.", "Rouge : cette IP a déjà servi, reclique.", "L'IP reste valable 15 min. Au-delà, rechange-la."],
    trap: "Créer le compte plus de 15 min après le changement d'IP. Le CRM bloque.",
  },
  geelark: {
    t: "Nouveau téléphone GeeLark",
    hint: "Nouveau profil GeeLark, colle le proxy du CRM, allume le téléphone.",
    more: ["Ouvre l'appli GeeLark sur le PC.", "Crée un nouveau profil (jamais un ancien).", "Onglet Proxy : le type indiqué par le CRM (Socks5), puis le port du CRM. Mauvais port = test rouge.", "Colle hôte, port, utilisateur, mot de passe avec les boutons Copier du CRM.", "Teste le proxy (« Check proxy »).", "Advanced settings : Location et Cloud phone language sur « Based on IP ».", "Create, puis Start pour allumer le téléphone.", "Note le nom du profil dans le CRM."],
    trap: "Réutiliser un ancien profil. 1 profil = 1 compte, toujours.",
  },
  numero: {
    t: "Prendre un numéro",
    hint: "Clique le gros bouton (France). Le code SMS arrive ici tout seul.",
    more: ["Clique le gros bouton (France, même pays que le proxy).", "Pas de code en 3 min : rembourse, puis prends USA.", "Dans Threads, touche « Utiliser un numéro de mobile ».", "Colle le numéro complet, AVEC l'indicatif (+33 pour la France) : Threads ne le rajoute pas tout seul.", "Le code s'affiche dans le CRM en 5 à 60 s. Copie-le dans Threads.", "Rien après 3 min : « Pas de code : rembourser », puis reprends un numéro."],
    trap: "Utiliser 2 fois le même numéro.",
  },
  compte: {
    t: "Créer le compte Threads",
    hint: "Crée le compte Threads avec ce numéro, puis note pseudo et mot de passe ici.",
    more: ["Dans le téléphone GeeLark : ouvre Threads, « Utiliser un numéro de mobile ».", "Colle le numéro, puis le code SMS.", "Mot de passe : clique « Générer » dans le CRM et copie-le (ou note ici celui que tu as tapé).", "Date de naissance : plus de 21 ans.", "Profil public, accepte les conditions, autorise les notifications.", "Note le pseudo et le mot de passe dans le CRM."],
    trap: "Taper un autre mot de passe que celui du CRM. On perd le compte.",
  },
  marche: {
    t: "Le compte marche ?",
    hint: "Fil Threads sans blocage ? Clique « Oui, il marche ».",
    more: ["Oui : tu vois le fil Threads, aucune demande de vérification.", "Non : demande de selfie, compte suspendu, code refusé.", "Si non : clique « Non ». Nouvelle IP, nouveau profil, on recommence."],
  },
  warmup: {
    t: "Warm-up",
    hint: "Scrolle et like dans la niche jusqu'à ce que le fil montre la niche.",
    more: ["Même téléphone, même IP, juste après la création.", "Ouvre les comptes de la niche, abonne-toi à 3 à 5, like leurs posts.", "Scrolle le fil « Pour toi » comme une vraie personne.", "Fini quand le fil montre surtout des posts de la niche.", "Pendant le warm-up : zéro post, zéro lien, zéro changement de profil."],
  },
  setup: {
    t: "Setup du profil",
    hint: "Photo, bio, puis fais ce que dit la stratégie du compte.",
    more: ["Même téléphone, même IP que le warm-up.", "Photo de profil : télécharge celle du CRM.", "Bio : bouton « Copier la bio », colle-la telle quelle.", "Lien, post épinglé ou relais : suis la carte de la stratégie, pas une autre.", "Coche les cases, clique « Setup fini »."],
  },
  metricool: {
    t: "Connecter à Metricool",
    hint: "Ouvre le lien dans le téléphone GeeLark, connecte Threads, reviens cliquer.",
    more: ["Clique « Connecter à Metricool » : le CRM donne un lien.", "Copie le lien, ouvre-le dans le navigateur du téléphone GeeLark du compte. Jamais sur le PC.", "Touche « Connect a Threads account », accepte les cookies.", "Connecte-toi avec le pseudo et le mot de passe du CRM (boutons Copier), accepte tout.", "Reviens, clique « J'ai connecté Threads » : le CRM programme 3 jours de posts tout seul."],
    trap: "Ouvrir le lien sur le PC : mauvaise IP, le compte peut sauter.",
  },
  reconnect: {
    t: "Reconnecter à Metricool",
    hint: "Threads s'est déconnecté : regarde si le compte vit encore, puis reconnecte.",
    more: ["Ouvre le profil Threads du compte.", "Le compte a sauté (suspendu, introuvable) : clique « Il a sauté ». Le CRM le remplacera.", "Le compte marche : clique « Reconnecter », puis fais comme une connexion Metricool normale, dans le téléphone GeeLark du compte.", "À la fin, « J'ai connecté Threads » : les posts repartent tout seuls."],
  },
  engage: {
    t: "Engagement (test)",
    hint: "10 min par compte test : 3-4 likes, 3-4 commentaires, 2 abonnements max. Rien à publier.",
    more: ["Seulement les 5 comptes du test.", "Téléphone GeeLark du compte, jamais un autre.", "10 minutes, pas plus.", "3 à 4 likes maximum sur des posts d'autres modèles.", "3 à 4 commentaires maximum, en chinois traditionnel (Google Traduction).", "2 abonnements maximum.", "Rien à publier : Metricool s'en occupe.", "Note les followers, clique « Fait (10 min) », éteins le téléphone."],
    trap: "Spammer (plus de 4 likes, 4 commentaires ou 2 abonnements) : le compte risque de sauter et le test ne veut plus rien dire.",
  },
  check: {
    t: "Check du matin",
    hint: "Ouvre chaque profil, clique le bouton qui correspond.",
    more: ["OK : le compte marche, ses posts sortent.", "Shadowban : ses posts ne se voient plus depuis un autre compte.", "Restreint : message « action limitée ».", "Sauté : suspendu, supprimé, ou vérification impossible.", "Note les followers si tu peux."],
  },
  planning: {
    t: "Le planning",
    hint: "Un point = un post. Une case rose = un jour vide : remplis-le.",
    more: ["Bleu : prévu. Vert : publié. Rouge : erreur. Orange : en retard.", "Clique un jour pour voir ses textes, avec la traduction.", "« Remplir 14 jours pour tous » : deux semaines prévues pour chaque compte en un clic.", "Sur la page Metricool, « +3 jours » et « +7 jours » ajoutent des posts après le dernier jour déjà prévu.", "Colonne Textes en rouge : il manque des textes, préviens ton manager."],
  },
  remplacement: {
    t: "Remplacer un compte sauté",
    hint: "Crée le nouveau compte jusqu'au bout : il reprend la place du mort.",
    more: ["Le CRM a déjà annulé les posts du compte mort et libéré sa marque Metricool.", "Crée le nouveau compte comme d'habitude : IP, téléphone, numéro, compte, warm-up, setup.", "À l'étape Metricool, il reprend la marque du mort : tu connectes juste Threads.", "Il garde le même groupe, la même stratégie, le même lien. Les posts repartent dès la connexion."],
  },
};
// Tutos filmes (vraie creation d'un compte, voix FR) : /help/<fichier>.mp4. Les autres cles gardent leur mini video .webm.
const HELP_TUTOS = { complet: "creation", rotation: "geelark", geelark: "geelark", numero: "numero", creation: "compte", compte: "compte", marche: "compte", warmup: "warmup", setup: "setup", metricool: "metricool", planning: "planning" };
const HELP_VIDEOS = ["today", "reconnect", "check", "remplacement"];
const tutoVideo = (k) => S.data.settings.videos?.[k] || (HELP_TUTOS[k] ? `/help/${HELP_TUTOS[k]}.mp4` : "");
const hint = (k) => (HELP[k] ? `<div class="hint"><span class="hint-k">Indice</span><span class="hint-t">${esc(HELP[k].hint)}</span><button class="qbtn" data-act="help" data-k="${k}" aria-label="Plus d'aide">?</button></div>` : "");
const helpVideo = (k) => tutoVideo(k) || (HELP_VIDEOS.includes(k) ? `/help/${k}.webm` : "");

const sopBlock = (key, open) => {
  const s = SOP[key];
  const v = helpVideo(key);
  const isOpen = S.sopOpen ? S.sopOpen.has(key) : open;
  return `<details class="card sop" data-sop="${key}" ${isOpen ? "open" : ""}><summary><b>${s.t}</b> ${v ? "" : ""}</summary>${v ? videoEmbed(v) : ""}<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>`;
};

// ------------------------------------------------------------ rendu principal
const ICONS = {
  today: '<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  create: '<path d="M12 5v14M5 12h14"/>',
  numero: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  warmup: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  setup: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  metricool: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  engage: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  accounts: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  sop: '<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5"/>',
  dash: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  stats: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  planning: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
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
      ["numero", "Numéro", S.data.sms && S.data.sms.status === "attente" ? 1 : 0],
      ["create", "Créer un compte", t.toReplace.length + t.reserveMissing],
      ["warmup", "Warm-up", t.warmup.length],
      ["setup", "Setup", t.setupReady.length],
      ["metricool", "Metricool", t.toConnect.length + t.toPlan.length],
      ["check", "Check du matin", t.toCheck.length],
      ...(S.data.accounts.some((a) => a.engage && a.status !== "saute") ? [["engage", "Engagement (test)", (t.toEngage || []).length]] : []),
    ]],
    ["Suivi", [
      ["accounts", "Comptes", 0],
      ["planning", "Planning", (t.postErrors || []).length + (t.postLate || []).length],
      ["stats", "Stats", 0],
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
      <div class="logo"><span class="mark">TH</span><div><b>Threads HQ</b></div></div>
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
    const stt = S.data.settings;
    const miss = [!conf.proxy && "Proxy", !conf.rotation && "Lien de rotation", !conf.metricool && "Metricool", !conf.sms && "Hero SMS", !conf.tiny && "TinyURL", !(stt.model && stt.model.link) && `Lien de ${stt.model?.name || "la modèle"}`, !(stt.hub && stt.hub.pseudo) && "Compte pivot (Contenu)", !(stt.warmupTargets || []).length && "Comptes à suivre au warm-up (Contenu)"].filter(Boolean);
    const lowBios = Object.entries(stt.bioBank || {}).filter(([, v]) => (v || []).length < 20).map(([k, v]) => `${(S.data.strategyLabels || {})[k] || k} : ${(v || []).length}`);
    if (isAdmin() && lowBios.length) cards.push(task("", "c-red", "Bios bientôt épuisées", lowBios.join(" · ") + " (chaque bio ne sert qu'une fois)", "content", "Ajouter"));
    if (isAdmin() && miss.length) cards.push(task("", "c-red", "Réglages à finir", miss.join(" · "), "settings", "Ouvrir"));
    // ordre de priorite : d'abord que chaque compte poste (remplacer, reconnecter), puis le reste
    // regle : 1) ce qui empeche un compte de poster, 2) finir ce qui est commence (le plus proche de poster d'abord), 3) preparer la suite
    const pri = [];
    const inPipe = (ids) => ids.map(acc).filter(Boolean);
    const stepOf = { setup_ok: ["metricool", "Connecter à Metricool"], attente_setup: ["setup", "Faire le setup"], warmup: ["warmup", "Finir le warm-up"] };
    const subs = [...inPipe(t.toConnect), ...inPipe(t.setupReady), ...inPipe(t.warmup)].filter((a) => a.replaces);
    const notSub = (ids) => inPipe(ids).filter((a) => !a.replaces).length;
    if (subs.length) {
      const [tab, btn] = stepOf[subs[0].status];
      pri.push(["c-red", `Finir le remplaçant @${subs[0].pseudo}${subs.length > 1 ? ` (+${subs.length - 1})` : ""}`, "Il remplace un compte sauté : va jusqu'à Metricool, les posts repartent dès la connexion.", tab, btn]);
    }
    if (t.toReplace.length) pri.push(["c-red", `Remplacer ${t.toReplace.length} compte(s) sauté(s)`, "Un compte sauté ne poste plus. Crée le remplaçant tout de suite : il reprend sa place et sa marque Metricool.", "create", "Remplacer"]);
    const notOut = (t.postErrors || []).length + (t.postLate || []).length;
    if (notOut) pri.push(["c-red", `${notOut} post(s) pas sorti(s)`, "Erreur Metricool ou post en retard. Regarde le planning : souvent un compte à reconnecter.", "planning", "Voir"]);
    if ((t.toReconnect || []).length) pri.push(["c-red", `Reconnecter ${t.toReconnect.length} compte(s) à Metricool`, "Threads s'est déconnecté : ses posts ne sortent plus. 2 min pour le reconnecter.", "metricool", "Reconnecter"]);
    if (t.toPlan.length) pri.push(["c-green", `Planifier ${t.toPlan.length} compte(s)`, "Moins de 2 jours de posts devant lui. 1 clic.", "metricool", "Planifier"]);
    if (t.toCheck.length) pri.push(["c-yellow", `Check du matin : ${t.toCheck.length} compte(s)`, "Repère vite les comptes qui ont sauté.", "check", "Commencer"]);
    if ((t.toEngage || []).length) pri.push(["c-blue", `Engagement du jour : ${t.toEngage.length} compte(s) test`, "10 min par compte : répondre, liker, commenter. Rien à publier.", "engage", "Commencer"]);
    if (notSub(t.toConnect)) pri.push(["c-violet", `Connecter ${notSub(t.toConnect)} compte(s) à Metricool`, "Setup fini mais pas encore branché : il ne poste pas encore.", "metricool", "Connecter"]);
    if (notSub(t.setupReady)) pri.push(["c-blue", `Setup de ${notSub(t.setupReady)} compte(s)`, "Photo, bio, puis lien ou post épinglé selon la stratégie.", "setup", "Faire le setup"]);
    if (notSub(t.warmup)) pri.push(["c-yellow", `Warm-up de ${notSub(t.warmup)} compte(s)`, "Finis le warm-up, puis le setup dans la foulée.", "warmup", "Ouvrir"]);
    if (t.reserveMissing) pri.push(["c-pink", `Créer ${t.reserveMissing} compte(s) de réserve`, `Objectif : ${S.data.settings.reserveTarget} comptes d'avance si un compte saute.`, "create", "Créer"]);
    pri.forEach(([c, title, desc, tab, btn], i) => cards.push(task(i + 1, c, title, desc, tab, btn, i === 0)));
    const waiting = "";
    return `<h2>Bonjour ${esc(S.data.me.name)}</h2><p class="lead">Fais les tâches dans l'ordre, de haut en bas.</p>${hint("today")}
      <div class="stats">${stat("c-green", t.active, "comptes actifs")}${stat("c-violet", t.reserve, "en réserve")}${stat("c-yellow", t.toCheck.length, "à checker")}${stat("c-red", t.toReplace.length, "à remplacer")}</div>
      ${cards.length ? `<div class="card list">${cards.join("")}</div>` : '<div class="card done-all"><b>Tout est à jour.</b><span>Si tu as le temps, crée un compte de réserve.</span></div>'}${waiting}`;
  },

  numero() {
    const cur = S.data.sms && S.data.sms.status === "attente" ? S.data.sms : null;
    const lab = { attente: ["c-yellow", "En cours"], fini: ["c-green", "Utilisé"], annule: ["c-blue", "Remboursé"], expire: ["c-red", "Expiré"] };
    const hist = (S.data.smsHistory || []).filter((h) => !cur || h.id !== cur.id);
    return `<h2>Numéro</h2><p class="lead">Un numéro pour créer un compte. France d'abord. Le code SMS arrive ici.</p>${hint("numero")}
      ${S.data.configured.sms ? `<div class="card">${cur ? smsCard(cur) : smsBuyBlock()}</div>
        ${cur ? `<p class="muted">Quand le compte est créé dans « Créer un compte », ce numéro se ferme tout seul.</p>` : ""}
        ${hist.length ? `<h3>Derniers numéros</h3><div class="card list">${hist.map((h) => `<div class="row" style="justify-content:space-between;padding:6px 0"><span><b>${esc(h.phone)}</b> <span class="muted">${esc(h.countryName)} · ${ago(h.createdAt)}${h.code ? " · code " + esc(h.code) : ""}</span></span>${(() => { const [c, l] = lab[h.status] || ["", h.status]; return `<span class="pill ${c}">${l}</span>`; })()}</div>`).join("")}</div>` : ""}`
      : '<div class="alert c-red">Hero SMS pas encore branché (Réglages, admin).</div>'}${sopBlock("numero")}`;
  },
  create() {
    const w = S.wiz || (S.wiz = { step: 1, f: {} });
    const t = S.data.tasks;
    const replacing = t.toReplace.length ? acc(t.toReplace[0]) : null;
    const ip = freshIp();
    const ipUsed = ip && S.data.accounts.some((a) => a.ip === ip.ip);
    const bar = `<div class="steps">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= w.step ? "on" : ""}"></span>`).join("")}</div>`;
    const head = `<h2>Créer un compte</h2>${replacing ? `<div class="alert c-red">Ce compte remplace <b>@${esc(replacing.pseudo)}</b> (groupe ${esc(group(replacing.group).name)}). Va jusqu'à Metricool sans pause : les posts repartent dès que Threads est connecté.</div>${w.step === 1 ? hint("remplacement") : ""}` : ""}${bar}`;
    const nav = (canNext, label = "Étape suivante") =>
      `<div class="row" style="margin-top:16px">${w.step > 1 ? '<button class="btn ghost" data-act="wizBack">Retour</button>' : ""}<div class="spacer"></div><button class="btn" data-act="wizNext" ${canNext ? "" : "disabled"}>${label}</button></div>`;
    const proxy = parseProxy(S.data.settings.proxy);
    if (w.step === 1)
      return `${head}<div class="card"><div class="stepnum">Étape 1 sur 5</div><h3>Change l'IP</h3>${hint("rotation")}
        <p>Clique sur le bouton, puis attends que la nouvelle IP s'affiche.</p>
        <button class="btn big rot" data-act="rotate" data-wait="Changement de l'IP...">Changer l'IP</button>
        ${ip ? `<div class="alert ${ipUsed ? "c-red" : "c-green"}">${ipUsed ? "Cette IP a déjà servi. Rechange-la." : `Nouvelle IP : <b>${esc(ip.ip)}</b> ${esc(ip.country)} (${ago(ip.at)})`}</div>` : '<div class="alert c-yellow">Pas encore d\'IP fraîche.</div>'}
        ${nav(ip && !ipUsed)}</div>${sopBlock("rotation")}`;
    if (w.step === 2)
      return `${head}<div class="card"><div class="stepnum">Étape 2 sur 5</div><h3>Nouveau profil GeeLark</h3>${hint("geelark")}
        <ol><li>Ouvre GeeLark.</li><li>Crée un <b>nouveau profil</b> (1 profil = 1 compte).</li><li>Mets le proxy avec les infos ci-dessous : type <b>${S.data.settings.socksPort ? "Socks5" : "HTTP"}</b>, puis « Check proxy ».</li><li>Advanced settings : <b>Location</b> et <b>Cloud phone language</b> sur <b>Based on IP</b>.</li><li>Create, puis Start pour allumer le téléphone.</li></ol>
        <a class="btn light" href="${esc(S.data.settings.geelarkUrl)}" target="_blank" rel="noopener">Ouvrir GeeLark</a>
        ${proxy ? copyLine("Hôte", proxy.host) + copyLine("Port", S.data.settings.socksPort || proxy.port) + copyLine("Utilisateur", proxy.user) + copyLine("Mot de passe", proxy.pass) : '<div class="alert c-red">Proxy pas encore réglé (demande à Awen).</div>'}
        <label class="f">Nom du profil GeeLark <small>(facultatif)</small></label><input data-f="geelarkProfile" value="${esc(w.f.geelarkProfile || "")}" placeholder="ex : profil 12" />
        ${nav(true)}</div>`;
    if (w.step === 3) {
      if (!S.data.configured.sms)
        return `${head}<div class="card"><div class="stepnum">Étape 3 sur 5</div><h3>Prends un numéro</h3>${hint("numero")}
          ${S.data.settings.smsSiteUrl ? `<a class="btn light" href="${esc(S.data.settings.smsSiteUrl)}" target="_blank" rel="noopener">Ouvrir le site SMS</a>` : '<div class="alert c-yellow">Hero SMS pas encore branché (Réglages, admin).</div>'}
          <label class="f">Numéro utilisé</label><input data-f="phone" inputmode="tel" value="${esc(w.f.phone || "")}" placeholder="+33 ..." />
          ${nav(true)}</div>`;
      const cur = S.data.sms && S.data.sms.status === "attente" ? S.data.sms : null;
      if (cur) {
        w.f.phone = cur.phone;
        w.f.smsId = cur.id;
      }
      return `${head}<div class="card"><div class="stepnum">Étape 3 sur 5</div><h3>Prends un numéro</h3>${hint("numero")}
        ${cur ? smsCard(cur) : smsBuyBlock() + `<details style="margin-top:10px"><summary class="muted">J'ai déjà un numéro (à la main)</summary><label class="f">Numéro utilisé</label><input data-f="phone" inputmode="tel" value="${esc(w.f.phone || "")}" placeholder="+33 ..." /></details>`}
        ${nav(!!(w.f.phone))}</div>`;
    }
    if (w.step === 4)
      return `${head}${S.data.sms && S.data.sms.status === "attente" && S.data.sms.id === w.f.smsId ? `<div class="card">${smsCard(S.data.sms)}</div>` : ""}<div class="card"><div class="stepnum">Étape 4 sur 5</div><h3>Crée le compte Threads</h3>${hint("compte")}
        <label class="f">Pseudo</label><input data-f="pseudo" value="${esc(w.f.pseudo || "")}" placeholder="pseudo sans @" autocapitalize="off" />
        <label class="f">Lien du compte <small>(créé tout seul avec le pseudo)</small></label>
        <div class="chips"><button class="chip ${(w.f.linkDomain || "brand") === "brand" ? "on" : ""}" data-act="wizDomain" data-v="brand">${esc(S.data.settings.tinyDomain || "domaine perso")}/${esc(w.f.pseudo || "pseudo")}</button><button class="chip ${w.f.linkDomain === "tinyurl" ? "on" : ""}" data-act="wizDomain" data-v="tinyurl">tinyurl.com/${esc(w.f.pseudo || "pseudo")}</button></div>
        <label class="f">Mot de passe <button class="btn sm light" data-act="genPass">Générer</button></label><input data-f="password" value="${esc(w.f.password || "")}" autocapitalize="off" />
        <label class="f">Email <small>(facultatif)</small></label><input data-f="email" value="${esc(w.f.email || "")}" autocapitalize="off" />
        <label class="f">Mot de passe email <small>(facultatif)</small></label><input data-f="emailPassword" value="${esc(w.f.emailPassword || "")}" autocapitalize="off" />
        ${nav(true)}</div>`;
    if (w.step === 5)
      return `${head}<div class="card"><div class="stepnum">Étape 5 sur 5</div><h3>Le compte marche ?</h3>${hint("marche")}
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
    return `<h2>Warm-up (10 min)</h2><p class="lead">Les comptes qui viennent d'être créés. 10 min de scroll, puis le setup direct.</p>
      ${list.length ? list.map((a) => warmupCard(a, false)).join("") : '<div class="card done-all"><b>Aucun warm-up en cours.</b></div>'}${sopBlock("warmup")}`;
  },

  setup() {
    const ready = S.data.tasks.setupReady.map(acc).filter(Boolean);
    if (S.setup && acc(S.setup.id)?.status === "attente_setup") return setupWizard(acc(S.setup.id));
    S.setup = null;
    return `<h2>Setup</h2><p class="lead">Juste après le warm-up : photo, bio, puis lien ou post épinglé selon la stratégie.</p>
      ${ready.length ? `<div class="grid">${ready.map((a) => `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div><div class="row">${gpill(a.group)}${spill(a.strategy)}</div><button class="btn" data-act="startSetup" data-id="${a.id}">Faire le setup</button></div>`).join("")}</div>` : '<div class="card done-all"><b>Aucun setup à faire.</b></div>'}
      ${sopBlock("setup")}`;
  },

  metricool() {
    const toConnect = S.data.tasks.toConnect.map(acc).filter(Boolean);
    const active = S.data.accounts.filter((a) => ["actif", "shadowban", "restreint"].includes(a.status));
    const now = Date.now();
    const upcoming = (id) => S.data.posts.filter((p) => p.accountId === id && p.status === "programme" && new Date(p.at).getTime() > now);
    const brandOpts = (S.brands || []).filter((b) => !b.linkedTo);
    const broken = (S.data.tasks.toReconnect || []).map(acc).filter(Boolean);
    const why = (id) => (S.data.mcAlerts || []).find((x) => x.accountId === id)?.msg || "Threads déconnecté";
    return `<h2>Metricool</h2><p class="lead">Après le setup, le CRM crée la marque et te donne le lien. Tu connectes Threads, le CRM planifie tout seul.</p>
      ${broken.length ? `<h3>À reconnecter en urgence (${broken.length})</h3>${hint("reconnect")}<div class="grid">${broken.map((a) => a.mcLink ? mcConnectCard(a) : `<div class="card acc urgent"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div><div class="alert c-red">${esc(why(a.id))}. Ses posts ne sortent plus.</div>
        <div class="row"><a class="btn light" href="${threadsUrl(a.pseudo)}" target="_blank" rel="noopener">Ouvrir le profil</a></div>
        <div class="row"><button class="btn big" data-act="mcConnect" data-id="${a.id}" data-wait="...">Reconnecter</button><button class="btn bad" data-act="dead" data-id="${a.id}">Il a sauté</button></div></div>`).join("")}</div>` : ""}
      ${hint("metricool")}
      ${!S.data.configured.metricool ? '<div class="alert c-red">Metricool pas encore branché (Réglages, admin).</div>' : ""}
      <h3>À connecter (${toConnect.length})</h3>
      ${toConnect.length ? `<div class="grid">${toConnect.map((a) => mcConnectCard(a)).join("")}</div>
        ${isAdmin() ? `<details class="card" style="margin-top:12px"><summary class="muted">Relier à une marque Metricool existante (admin)</summary>
          <div class="row" style="margin-top:10px"><a class="btn light" href="${esc(S.data.settings.metricoolUrl)}" target="_blank" rel="noopener">Ouvrir Metricool</a><button class="btn" data-act="loadBrands" data-wait="Chargement...">Charger mes marques</button></div>
          ${S.brands ? toConnect.map((a) => `<div class="row" style="margin-top:8px"><b>@${esc(a.pseudo)}</b><select data-brand="${a.id}"><option value="">Choisis la marque...</option>${brandOpts.map((b) => `<option value="${esc(b.blogId)}">${esc(b.label || "sans nom")} ${b.threads ? "(Threads : " + esc(b.threads) + ")" : "(Threads non connecté)"}</option>`).join("")}</select><button class="btn sm" data-act="link" data-id="${a.id}" data-wait="Liaison...">Relier</button></div>`).join("") : ""}</details>` : ""}` : '<div class="card muted">Rien à connecter.</div>'}
      <h3>Comptes actifs (${active.length})</h3>
      ${active.length ? `<div class="card"><button class="btn big ok" data-act="planAll" data-wait="Planification de tous les comptes...">Planifier TOUS les comptes (3 jours)</button></div>` : ""}
      <div class="grid">${active.map((a) => {
        const up = upcoming(a.id);
        return `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div><div class="row">${gpill(a.group)}${pill(a.status)}</div>
          <span class="muted">${up.length} post(s) programmé(s)${a.plannedUntil ? ` · jusqu'au ${esc(a.plannedUntil)}` : ""}</span>
          ${up.slice(0, 3).map((p) => `<span class="muted">${esc(p.local.replace("T", " ").slice(0, 16))}</span>`).join("")}
          <div class="row"><button class="btn sm" data-act="plan" data-id="${a.id}" data-days="3" data-mode="add" data-wait="...">+3 jours</button><button class="btn sm light" data-act="plan" data-id="${a.id}" data-days="7" data-mode="add" data-wait="...">+7 jours</button><button class="btn sm light" data-act="plan" data-id="${a.id}" data-days="14" data-wait="...">14 jours</button><button class="btn sm ghost" data-act="manual" data-id="${a.id}">Post à la main</button></div></div>`;
      }).join("")}</div>${sopBlock("metricool")}`;
  },

  check() {
    const list = S.data.tasks.toCheck.map(acc).filter(Boolean);
    return `<h2>Check du matin</h2><p class="lead">Ouvre chaque profil. Choisis le bon bouton.</p>${hint("check")}
      ${list.length ? list.map((a) => `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span><div class="spacer"></div>${pill(a.status)}</div>
        <div class="row"><a class="btn light" href="${threadsUrl(a.pseudo)}" target="_blank" rel="noopener">Ouvrir le profil</a><input type="number" min="0" placeholder="Followers (facultatif)" data-followers="${a.id}" style="max-width:220px" /></div>
        <div class="row"><button class="btn ok" data-act="check" data-st="actif" data-id="${a.id}">OK</button><button class="btn warn" data-act="check" data-st="shadowban" data-id="${a.id}">Shadowban</button><button class="btn warn" data-act="check" data-st="restreint" data-id="${a.id}">Restreint</button><button class="btn bad" data-act="dead" data-id="${a.id}">Sauté</button></div></div>`).join("") : '<div class="card done-all"><b>Check du jour terminé. Bravo.</b></div>'}
      ${sopBlock("check")}${sopBlock("remplacement")}`;
  },

  engage() {
    const today = S.data.today;
    const list = S.data.accounts.filter((a) => a.engage && ["actif", "shadowban", "restreint"].includes(a.status));
    const todo = list.filter((a) => a.lastEngageDay !== today);
    const done = list.filter((a) => a.lastEngageDay === today);
    const card = (a) => {
      const n = (a.engageDays || []).length;
      const isDone = a.lastEngageDay === today;
      return `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span><div class="spacer"></div>${isDone ? '<span class="status st-actif"><i></i>Fait aujourd\'hui</span>' : pill(a.status)}</div>
        <span class="muted">Dans le test depuis le ${esc(a.engageSince || "?")} · ${n} jour(s) d'engagement faits · téléphone GeeLark : ${esc(a.geelarkProfile || "celui du compte")}</span>
        ${isDone ? "" : `<div class="row"><a class="btn light" href="${threadsUrl(a.pseudo)}" target="_blank" rel="noopener">Voir le profil</a><input type="number" min="0" placeholder="Followers (facultatif)" data-efollowers="${a.id}" style="max-width:220px" /><button class="btn ok" data-act="engaged" data-id="${a.id}" data-wait="...">Fait (10 min)</button></div>`}</div>`;
    };
    return `<h2>Engagement (test)</h2><p class="lead">On teste si 10 min d'engagement par jour font plus de clics et de followers, sans faire sauter plus de comptes. Toujours les 5 mêmes comptes.</p>${hint("engage")}
      <div class="card"><ol class="helpsteps">${SOP.engage.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
      ${todo.length ? todo.map(card).join("") : '<div class="card done-all"><b>Engagement du jour terminé. Bravo.</b></div>'}
      ${done.length ? `<h3>Déjà faits aujourd'hui</h3>${done.map(card).join("")}` : ""}`;
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
        <div class="row">${pill(a.status)}${gpill(a.group)}${spill(a.strategy)}${a.engage ? '<span class="pill">Test engagement</span>' : ""}</div>
        <span class="muted">Créé ${ago(a.createdAt)} par ${esc(a.createdBy)} · IP ${esc(a.ip || "?")}</span>
        ${a.replaces ? `<span class="muted">Remplace @${esc(acc(a.replaces)?.pseudo || "?")}</span>` : ""}${a.replacedBy ? `<span class="muted">Remplacé par @${esc(acc(a.replacedBy)?.pseudo || "?")}</span>` : ""}
        <div class="row"><button class="btn sm light" data-act="copy" data-v="${esc(a.pseudo)}">Pseudo</button><button class="btn sm light" data-act="copy" data-v="${esc(a.password)}">Mot de passe</button><button class="btn sm light" data-act="copy" data-v="${esc(a.phone)}">Numéro</button><a class="btn sm light" href="${threadsUrl(a.pseudo)}" target="_blank" rel="noopener">Profil</a><button class="btn sm ghost" data-act="edit" data-id="${a.id}"></button>${isAdmin() && a.status !== "saute" ? `<button class="btn sm ghost" data-act="engageToggle" data-id="${a.id}" data-v="${a.engage ? "0" : "1"}" data-wait="...">${a.engage ? "Sortir du test" : "Mettre en test"}</button>` : ""}</div></div>`).join("") || '<div class="card muted">Aucun compte ici.</div>'}</div>`;
  },

  planning() {
    const st = S.data.settings;
    const today = S.data.today;
    const days = Array.from({ length: 16 }, (_, i) => addDaysLocal(today, i - 2));
    const live = S.data.accounts.filter((a) => a.blogId && ["actif", "shadowban", "restreint", "setup_ok"].includes(a.status));
    const now = Date.now();
    const state = (p) => (p.status === "programme" && new Date(p.at).getTime() < now - 2 * 3600e3 ? "retard" : p.status);
    const posts = S.data.posts.filter((p) => p.status !== "annule");
    const last24 = posts.filter((p) => new Date(p.at).getTime() <= now && new Date(p.at).getTime() > now - 864e5);
    const pub24 = last24.filter((p) => p.status === "publie").length;
    const bad = posts.filter((p) => ["erreur", "retard"].includes(state(p)) && new Date(p.at).getTime() > now - 3 * 864e5).length;
    const full = live.filter((a) => a.plannedUntil && a.plannedUntil >= addDaysLocal(today, 13)).length;
    const perDay = Number(st.postsPerDay) || 3;
    const textDays = (a) => Math.floor(S.data.texts.filter((x) => x.group === a.group && !x.off && !posts.some((p) => p.accountId === a.id && p.textId === x.id)).length / perDay);
    const cell = (a, d) => {
      const ps = posts.filter((p) => p.accountId === a.id && p.day === d).sort((x, y) => (x.at < y.at ? -1 : 1));
      const future = d >= today;
      if (!ps.length) return `<td class="pc ${future ? "hole" : ""}" title="${future ? "Rien de prévu" : ""}"></td>`;
      return `<td class="pc" data-act="dayPosts" data-id="${a.id}" data-v="${d}">${ps.map((p) => `<i class="pd s-${state(p)}"></i>`).join("")}</td>`;
    };
    const fmt = (d) => { const x = new Date(d + "T12:00:00Z"); return `<b>${["D", "L", "M", "M", "J", "V", "S"][x.getUTCDay()]}</b>${x.getUTCDate()}`; };
    return `<h2>Planning</h2><p class="lead">Chaque point = un post. Vert : publié. Bleu : prévu. Rouge : erreur. Orange : en retard. Case rose : rien de prévu.</p>${hint("planning")}
      <div class="stats">${stat("c-green", `${pub24}/${last24.length}`, "publiés (24 h)")}${stat("c-red", bad, "pas sortis (3 j)")}${stat("c-blue", `${full}/${live.length}`, "comptes prévus 14 j")}</div>
      <div class="row" style="margin-bottom:12px"><button class="btn" data-act="planAll" data-days="14" data-wait="Planification...">Remplir 14 jours pour tous</button><button class="btn light" data-act="postsSync" data-wait="Vérification...">Vérifier sur Metricool</button><span class="muted">${S.data.postsSyncAt ? "Vérifié " + ago(S.data.postsSyncAt) + " (tout seul toutes les 20 min)" : "Jamais vérifié"}</span></div>
      ${live.length ? `<div class="card" style="padding:0;overflow-x:auto"><table class="plan"><thead><tr><th class="pa">Compte</th>${days.map((d) => `<th class="${d === today ? "td" : d < today ? "past" : ""}">${fmt(d)}</th>`).join("")}<th>Textes</th></tr></thead>
        <tbody>${live.map((a) => { const td = textDays(a); return `<tr><td class="pa"><b>@${esc(a.pseudo)}</b><span>${pill(a.status)}</span></td>${days.map((d) => cell(a, d)).join("")}<td class="tx ${td < 3 ? "low" : ""}">${td} j</td></tr>`; }).join("")}</tbody></table></div>
        <p class="muted">« Textes » : jours de posts encore possibles sans répéter un texte sur ce compte. Sous 3 jours, ajoute des textes (Contenu).</p>`
      : '<div class="card done-all"><b>Aucun compte branché à Metricool pour l\'instant.</b></div>'}`;
  },
  stats() {
    const ls = S.data.linkStats;
    const now = Date.now();
    const rows = S.data.accounts.filter((a) => a.status !== "saute").map((a) => {
      const l = ls?.links?.[a.link];
      const up = S.data.posts.filter((p) => p.accountId === a.id && p.status === "programme" && new Date(p.at).getTime() > now).length;
      const done = S.data.posts.filter((p) => p.accountId === a.id && p.status === "programme" && new Date(p.at).getTime() <= now).length;
      return { a, l, up, done };
    });
    const sum = (k) => rows.reduce((n, r) => n + (r.l?.[k] || 0), 0);
    const totalFollowers = rows.reduce((n, r) => n + (Number(r.a.followers) || 0), 0);
    return `<h2>Stats</h2><p class="lead">Clics des liens, followers et posts, compte par compte.</p>
      ${!S.data.configured.tiny ? '<div class="alert c-yellow">TinyURL pas encore branché : les clics restent vides. Colle le token TinyURL dans Réglages, puis clique « Mettre à jour les clics ».</div>' : ""}
      <div class="stats">${stat("c-blue", sum("clicks7"), "clics (7 j)")}${stat("c-blue", sum("clicks30"), "clics (30 j)")}${stat("c-green", totalFollowers, "followers")}${stat("c-violet", rows.reduce((n, r) => n + r.up, 0), "posts à venir")}</div>
      <div class="row" style="margin-bottom:12px"><span class="muted">${ls ? "Clics relevés " + ago(ls.at) : "Clics jamais relevés"}</span><div class="spacer"></div>${isAdmin() ? '<button class="btn sm" data-act="linkStats" data-wait="Relevé...">Mettre à jour les clics</button>' : ""}</div>
      ${ls?.errors?.length ? `<div class="alert c-red">${esc(ls.errors[0])}${ls.errors.length > 1 ? ` (+${ls.errors.length - 1})` : ""}</div>` : ""}
      ${engageCompare()}
      <div class="card" style="overflow:auto"><table class="tbl"><tr><th>Compte</th><th>Groupe</th><th>Stratégie</th><th>Statut</th><th>Lien</th><th>Clics 7 j</th><th>Clics 30 j</th><th>Followers</th><th>Posts publiés</th><th>À venir</th></tr>
      ${rows.map(({ a, l, up, done }) => `<tr><td>@${esc(a.pseudo)}${a.engage ? ' <span class="pill">Test</span>' : ""}</td><td>${gpill(a.group)}</td><td class="muted">${esc((S.data.strategyLabels || {})[a.strategy] || "")}</td><td>${pill(a.status)}</td><td class="muted">${esc(a.link || "")}</td><td>${l ? l.clicks7 : ""}</td><td>${l ? l.clicks30 : ""}</td><td>${a.followers ?? ""}</td><td>${done}</td><td>${up}</td></tr>`).join("") || '<tr><td colspan="10" class="muted">Aucun compte.</td></tr>'}</table></div>`;
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
      <div class="card"><h3 style="margin-top:0">Importer depuis Google Drive</h3><p class="muted">Colle le lien d'un dossier partagé (« Tous ceux qui ont le lien »). Les photos déjà importées sont sautées.</p>
        <input data-drivelink placeholder="https://drive.google.com/drive/folders/..." />
        <div class="row" style="margin-top:8px"><select data-drivedest style="max-width:240px"><option value="__pfp">Photos de profil</option>${st.groups.filter((g) => g.withPhoto).map((g) => `<option value="${g.id}">Photos du groupe ${esc(g.name)}</option>`).join("")}</select><button class="btn" data-act="driveImport" data-wait="Import...">Importer</button></div></div>
      <div class="card"><h3 style="margin-top:0">Photos de profil (${pfps.length})</h3><input type="file" accept="image/*" multiple data-upload="__pfp" /><div class="thumbs" style="margin-top:10px">${pfps.map((m) => `<figure><img loading="lazy" src="/api/media/${m.id}" /><button class="btn sm bad" data-act="delMedia" data-id="${m.id}"></button></figure>`).join("")}</div></div>
      <div class="card"><h3 style="margin-top:0">Les 3 stratégies de setup</h3>
        <p class="muted">Chaque nouveau compte reçoit une stratégie, en équilibrant selon les cibles ci-dessous. Un compte qui remplace un compte sauté garde sa stratégie.</p>
        <table class="tbl"><tr><th>Stratégie</th><th>Comment ça marche</th><th>Cible</th></tr>
          <tr><td><b>Post épinglé</b></td><td>Pas de lien dans la bio. La bio dit « regarde mon post épinglé ». Le post épinglé a 2 parties : le post, puis une réponse avec le lien.</td><td><input type="number" min="0" data-strat="epingle" value="${esc(st.strategies?.epingle ?? 5)}" style="max-width:80px" /></td></tr>
          <tr><td><b>Lien dans la bio</b></td><td>Le lien est dans le champ lien du profil. La bio invite à cliquer dessus. Post épinglé facultatif.</td><td><input type="number" min="0" data-strat="lien" value="${esc(st.strategies?.lien ?? 5)}" style="max-width:80px" /></td></tr>
          <tr><td><b>Relais</b></td><td>Aucun lien sur le compte. Il cite le post épinglé du compte pivot et épingle cette citation. Le lien n'est que sur le pivot.</td><td><input type="number" min="0" data-strat="relais" value="${esc(st.strategies?.relais ?? 5)}" style="max-width:80px" /></td></tr></table>
        <label class="f">Compte pivot <small>(pseudo Threads sans @ : le seul compte avec un post épinglé qui contient le lien)</small></label><input data-hub="pseudo" value="${esc(st.hub?.pseudo || "")}" />
        <label class="f">Lien du post épinglé du pivot <small>(facultatif, pour que la VA le retrouve vite)</small></label><input data-hub="postUrl" value="${esc(st.hub?.postUrl || "")}" />
        <label class="f">Texte de la citation (comptes relais) <small>({pivot} = pseudo du pivot)</small></label><textarea data-set="relayText" style="min-height:70px">${esc(st.relayText || "")}</textarea>
        <label class="f">Comptes à suivre pendant le warm-up <small>(${(st.warmupTargets || []).length} · un pseudo ou un lien Threads par ligne · chaque compte créé en reçoit 5 au hasard)</small></label><textarea data-set="warmupTargets" style="min-height:120px" placeholder="pseudo1&#10;https://www.threads.com/@pseudo2">${esc((st.warmupTargets || []).join("\n"))}</textarea></div>
      <div class="card"><h3 style="margin-top:0">Banque de bios</h3><p class="muted">Une bio par bloc, séparées par une ligne vide. Le CRM en tire une au hasard selon la stratégie du compte.</p>
        <p class="muted">Chaque bio ne sert qu'une fois : dès qu'un setup est fini, elle sort de la banque. ${(st.biosUsed || []).length} déjà utilisée(s).</p><label class="f">Bios « Post épinglé » <small>(${(st.bioBank?.epingle || []).length} restantes)</small></label><textarea data-bank="epingle" style="min-height:200px">${esc((st.bioBank?.epingle || []).join("\n\n"))}</textarea>
        <label class="f">Bios « Lien dans la bio » <small>(${(st.bioBank?.lien || []).length} restantes)</small></label><textarea data-bank="lien" style="min-height:200px">${esc((st.bioBank?.lien || []).join("\n\n"))}</textarea>
        <label class="f">Bios « Relais » <small>(${(st.bioBank?.relais || []).length} restantes)</small></label><textarea data-bank="relais" style="min-height:200px">${esc((st.bioBank?.relais || []).join("\n\n"))}</textarea>

        <h3>Post épinglé</h3><p class="muted">Partie 1 = le post. Partie 2 = la réponse avec le lien. Mots remplacés tout seuls : <code>{pseudo}</code> et <code>{lien}</code>.</p><label class="f">Partie 1</label><textarea data-set="pinnedPost">${esc(st.pinnedPost || "")}</textarea><label class="f">Partie 2</label><textarea data-set="pinnedReply">${esc(st.pinnedReply || "")}</textarea>
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
        <div class="health">${[["Rotation IP", c.rotation], ["Metricool", c.metricool], ["Proxy", c.proxy], ["Hero SMS", c.sms]].map(([l, ok]) => `<span class="tag ${ok ? "ok" : "miss"}">${l}</span>`).join("")}</div>
        <label class="f">1. Lien de rotation IP ${c.rotation ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'}</label><input type="password" data-sec="rotationUrl" placeholder="${c.rotation ? "enregistré (colle un autre lien pour le remplacer)" : "colle le ROTATION LINK du proxy"}" autocomplete="off" />
        <label class="f">2. Token API Metricool ${c.mcToken ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(dans Metricool : Paramètres du compte, onglet API, Copier)</small></label><input type="password" data-sec="mcToken" placeholder="${c.mcToken ? "enregistré (colle un autre token pour le remplacer)" : "colle le token"}" autocomplete="off" />
        <label class="f">3. userId Metricool ${c.mcUserId ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(le nombre, ou colle simplement l'adresse de Metricool)</small></label><input data-sec="mcUserId" placeholder="${c.mcUserId ? "enregistré" : "ex : 5978155 ou https://app.metricool.com/...userId=..."}" autocomplete="off" />
        <label class="f">4. Proxy ${c.proxy ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(ip:port:user:pass ou la ligne HTTP copiée)</small></label><input type="password" data-sec="proxy" placeholder="${c.proxy ? "enregistré (colle un autre proxy pour le remplacer)" : "hote:port:user:pass"}" autocomplete="off" />
        <label class="f">Port SOCKS5 pour GeeLark <small>(bouton SOCKS5 du proxy ; vide = la VA met le proxy en HTTP)</small></label><input data-st="socksPort" inputmode="numeric" value="${esc(st.socksPort || "")}" placeholder="ex : 17157" />
        <label class="f">5. Token TinyURL ${c.tiny ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(TinyURL : Account, API tokens)</small></label><input type="password" data-sec="tinyToken" placeholder="${c.tiny ? "enregistré (colle un autre token pour le remplacer)" : "facultatif, pour les clics dans Stats"}" autocomplete="off" />
        <label class="f">6. Clé API Hero SMS ${c.sms ? '<span class="tag ok">Enregistré</span>' : '<span class="tag miss">Manquant</span>'} <small>(hero-sms.com : Obtenir la clé API)</small></label><input type="password" data-sec="heroToken" placeholder="${c.sms ? "enregistré (colle une autre clé pour la remplacer)" : "colle la clé API"}" autocomplete="off" />
        <div class="row" style="margin-top:12px"><button class="btn" data-act="saveSecrets" data-wait="...">Enregistrer les connexions</button><button class="btn light" data-act="testMc" data-wait="Test...">Tester Metricool</button><button class="btn light" data-act="testIp" data-wait="Test...">Tester le proxy</button></div></div>
      ${c.tiny ? `<div class="card"><h3 style="margin-top:0">Ménage TinyURL</h3><p class="muted">Supprime les vieux liens du domaine ${esc(st.tinyDomain || "")}. Les liens des comptes du CRM ne sont jamais touchés.</p>
        <div class="row"><button class="btn light" data-act="tinyScan" data-wait="Comptage...">Compter les vieux liens</button>${S.tinyScan ? `<span class="muted">${S.tinyScan.count} lien(s) à supprimer · ${S.tinyScan.kept} gardé(s) (comptes du CRM)</span>` : ""}</div>
        ${S.tinyScan && S.tinyScan.count ? `<p class="muted">Ex : ${S.tinyScan.sample.map(esc).join(", ")}</p><button class="btn bad" data-act="tinyClean" data-wait="Suppression...">Supprimer ces ${S.tinyScan.count} liens (définitif)</button>` : ""}</div>` : ""}
      <div class="card"><h3 style="margin-top:0">Liens</h3>
        <label class="f">Site SMS <small>(secours, si Hero SMS n'est pas branché)</small></label><input data-st="smsSiteUrl" value="${esc(st.smsSiteUrl)}" />
        <label class="f">Lien GeeLark</label><input data-st="geelarkUrl" value="${esc(st.geelarkUrl)}" />
        <label class="f">Lien Metricool</label><input data-st="metricoolUrl" value="${esc(st.metricoolUrl)}" />
        <h3>Modèle en cours</h3>
        <label class="f">Prénom de la modèle</label><input data-model="name" value="${esc(st.model?.name || "")}" />
        <label class="f">Lien de la modèle <small>(la destination : chaque compte reçoit son propre lien court qui pointe dessus)</small></label><input data-model="link" value="${esc(st.model?.link || "")}" />
        <label class="f">Domaine TinyURL <small>(le lien de chaque compte sera domaine/pseudo)</small></label><input data-st="tinyDomain" value="${esc(st.tinyDomain || "")}" />
        ${c.tiny && st.model?.link ? `<div class="row" style="margin-top:10px"><button class="btn light" data-act="tinyModel" data-wait="Création...">Créer ${esc(st.tinyDomain || "")}/${esc((st.model?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())} vers sa page</button></div>` : ""}
        ${(S.data.extraLinks || []).map((x) => copyLine("Lien perso", x.link)).join("")}</div>
      <div class="card"><h3 style="margin-top:0">Planification</h3>
        <label class="f">Fuseau horaire de la cible <small>(Asia/Taipei = Taïwan, Singapour, Hong Kong)</small></label><input data-st="timezone" value="${esc(st.timezone)}" />
        <label class="f">Posts par jour et par compte</label><input type="number" min="1" max="10" data-st="postsPerDay" value="${esc(st.postsPerDay)}" />
        <label class="f">Créneaux <small>(HH:MM séparés par des virgules)</small></label><input data-st="slots" value="${esc((st.slots || []).join(", "))}" />
        <label class="f">Décalage aléatoire (± minutes)</label><input type="number" min="0" max="120" data-st="jitterMin" value="${esc(st.jitterMin)}" />
        <label class="f">Comptes de réserve visés</label><input type="number" min="0" max="50" data-st="reserveTarget" value="${esc(st.reserveTarget)}" />
        <label class="f">Minutes de warm-up avant le setup</label><input type="number" min="0" max="120" data-st="warmupMinutes" value="${esc(st.warmupMinutes ?? 10)}" /></div>
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
  premier_acces: "Premier accès", aide_ouverte: "Aide ouverte", connexion: "Connexion", code_faux: "Code faux", ip_changee: "IP changée", ip_pas_changee: "IP pas changée",
  compte_cree: "Compte créé", creation_ratee: "Création ratée", warmup_fait: "Warm-up fait", setup_fait: "Setup fait", metricool_relie: "Relié à Metricool",
  metricool_delie: "Délié de Metricool", marque_creee: "Marque Metricool créée", numero_achete: "Numéro SMS pris", tiny_menage: "Ménage TinyURL", code_recu: "Code SMS reçu", numero_annule: "Numéro SMS annulé", lien_metricool: "Lien de connexion Metricool", planif: "Posts planifiés", check: "Check", compte_saute: "Compte sauté", compte_modifie: "Compte modifié",
  compte_supprime: "Compte supprimé", textes_ajoutes: "Textes ajoutés", photo_ajoutee: "Photo ajoutée", reglages_modifies: "Réglages modifiés",
  secrets_modifies: "Connexions modifiées", lien_cree: "Lien créé", lien_non_cree: "Lien non créé", stats_liens: "Clics relevés", utilisateur_modifie: "Accès modifié", utilisateur_supprime: "Accès retiré",
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
  if (l.raison) out.push(l.raison);
  if (l.lien) out.push(l.lien);
  if (l.strategy) out.push((S.data.strategyLabels || {})[l.strategy] || l.strategy);
  if (l.added != null) out.push(`${l.added} ajouté(s)`);
  if (l.blogId) out.push("marque " + l.blogId);
  if (l.name) out.push(l.name);
  if (l.aide) out.push(HELP[l.aide]?.t || l.aide);
  return out.join(", ");
}

// ------------------------------------------------------------ petits blocs
function task(n, color, title, desc, tab, btn, first) {
  const num = n === "" ? `<span class="dot ${color}"></span>` : `<span class="prio ${color}">${esc(n)}</span>`;
  return `<div class="task ${first ? "first" : ""}">${num}<div class="task-text"><b>${esc(title)}</b><span>${esc(desc)}</span></div><button class="btn sm ${first ? "accent" : ""}" data-tab="${tab}">${esc(btn)}</button></div>`;
}
// planifie un compte en plusieurs appels si besoin (le serveur rend la main avant 10 s)
async function planFull(accountId, days, btn, label, mode) {
  let created = 0;
  let problems = [];
  let until;
  for (let i = 0; i < 30; i++) {
    const r = await api("metricool/plan", { accountId, days, mode, until });
    until = r.until;
    created += r.created.length;
    problems = r.problems;
    if (btn) btn.innerHTML = `<span class="spin"></span> ${label ? label + " · " : ""}${created} post(s)...`;
    if (!r.partial || r.problems.length) break;
  }
  return { created, problems };
}
const POSTING = ["actif", "shadowban", "restreint"];
// test engagement : comptes test vs comptes témoins (branchés Metricool, sans engagement), depuis le début du test
function engageCompare() {
  const A = S.data.accounts;
  const testers = A.filter((a) => a.engage);
  const start = testers.map((a) => a.engageSince).filter(Boolean).sort()[0];
  const admin = isAdmin() ? `<button class="btn sm" data-act="engagePick" data-wait="Tirage...">${testers.some((a) => a.status !== "saute") ? "Compléter le test à 5 comptes" : "Lancer le test : 5 comptes au hasard"}</button>` : "";
  if (!start) return isAdmin() ? `<div class="card"><h3 style="margin-top:0">Test engagement</h3><p class="muted">Pas encore lancé. 5 comptes actifs tirés au hasard, toujours les mêmes : la VA y fait 10 min d'engagement par jour. Les autres servent de témoins.</p>${admin}</div>` : "";
  const ls = S.data.linkStats;
  const grp = (isTest) => {
    const g = A.filter((a) => (isTest ? a.engage : !a.engage && a.blogId) && (a.status !== "saute" || (a.deadAt && a.deadAt.slice(0, 10) >= start)));
    const alive = g.filter((a) => POSTING.includes(a.status));
    const avg = (f) => (alive.length ? Math.round((alive.reduce((n, a) => n + (f(a) || 0), 0) / alive.length) * 10) / 10 : 0);
    const gain = (a) => {
      const log = (a.followersLog || []).filter((x) => x.day >= start);
      return log.length >= 2 ? log[log.length - 1].n - log[0].n : 0;
    };
    return { n: alive.length, dead: g.filter((a) => a.status === "saute").length, c7: avg((a) => ls?.links?.[a.link]?.clicks7), c30: avg((a) => ls?.links?.[a.link]?.clicks30), fol: avg((a) => Number(a.followers)), gain: avg(gain) };
  };
  const t = grp(true);
  const w = grp(false);
  const days = Math.max(1, Math.round((Date.now() - new Date(start + "T00:00:00").getTime()) / 864e5));
  const since = (d) => Math.max(1, Math.round((Date.now() - new Date(d + "T00:00:00").getTime()) / 864e5));
  const live = testers.filter((a) => POSTING.includes(a.status));
  const doneN = live.reduce((n, a) => n + (a.engageDays || []).filter((d) => d >= a.engageSince).length, 0);
  const dueN = live.reduce((n, a) => n + since(a.engageSince || start), 0);
  const row = (l, a, b) => `<tr><td>${l}</td><td><b>${a}</b></td><td>${b}</td></tr>`;
  return `<div class="card"><h3 style="margin-top:0">Test engagement · jour ${days}</h3>
    <p class="muted">Moyenne par compte qui poste (actif, shadowban, restreint). Un remplaçant entre dans le test quand il est branché. Témoins = comptes branchés à Metricool sans engagement. Regarde le résultat après 14 jours, pas avant. Engagement fait : ${doneN} fois sur ${dueN} prévues.</p>
    <table class="tbl"><tr><th></th><th>Test (engagement)</th><th>Témoins</th></tr>
      ${row("Comptes vivants", t.n, w.n)}${row("Sautés depuis le début", t.dead, w.dead)}${row("Clics 7 j", t.c7, w.c7)}${row("Clics 30 j", t.c30, w.c30)}${row("Followers", t.fol, w.fol)}${row("Followers gagnés", t.gain, w.gain)}</table>
    ${admin ? `<div class="row" style="margin-top:10px">${admin}</div>` : ""}</div>`;
}
function addDaysLocal(day, n) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
// 5 comptes de la niche a suivre, toujours les memes pour un compte donne, differents d'un compte a l'autre
function warmupTargets(a) {
  const all = S.data.settings.warmupTargets || [];
  if (!all.length) return '<p class="muted">Pas encore de liste de comptes à suivre : choisis des filles qui postent en chinois (Taïwan, Hong Kong).</p>';
  let h = 0;
  for (const ch of a.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = [...all].map((p, i) => [p, (h ^ (i * 2654435761)) >>> 0]).sort((x, y) => x[1] - y[1]).slice(0, 5).map((x) => x[0]);
  return `<div class="card" style="margin:10px 0"><b>Suis ces ${pick.length} comptes</b> <span class="muted">(dans le téléphone : Recherche, colle le pseudo, S'abonner, like 2 posts)</span>${pick.map((p) => copyLine("@", p)).join("")}</div>`;
}
function warmupCard(a, withTimer) {
  if (!a) return "";
  return `<div class="card"><div class="head row"><span class="num">#${a.num}</span><b>@${esc(a.pseudo)}</b>${gpill(a.group)}</div>${hint("warmup")}
    <p class="muted">Même profil GeeLark, même IP. 10 min de scroll, puis le setup direct.</p><div class="timer" data-timer="${a.id}">10:00</div><div class="row"><button class="btn light" data-act="startTimer" data-id="${a.id}">Lancer le chrono 10 min</button></div>
    ${warmupTargets(a)}
    <div class="checklist" data-wcheck="${a.id}">${SOP.warmup.steps.map((s) => `<label><input type="checkbox" /> ${esc(s)}</label>`).join("")}</div>
    <button class="btn big ok" data-act="warmupDone" data-id="${a.id}" data-wait="...">Warm-up fini, passer au setup</button>
    ${withTimer ? '<div class="row" style="margin-top:10px"><button class="btn ghost" data-act="wizReset">Créer un autre compte</button></div>' : ""}</div>`;
}
function smsBuyBlock() {
  const prices = S.smsPrices || null;
  const list = S.data.smsCountries || [];
  const info = (p) => (p ? (p.price != null && p.stock ? `${p.price.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} $ · ${p.stock} dispo` : "plus de numéro") : "");
  const priceOf = (c) => (prices ? prices.find((x) => x.id === c.id) : null);
  const empty = (c) => { const p = priceOf(c); return p && !p.stock; };
  const first = list.find((c) => !empty(c)) || list[0];
  const btn = (c, big) => `<button class="btn ${big ? "big" : "light"}" data-act="smsBuy" data-v="${c.id}" data-wait="Achat du numéro..." ${empty(c) ? "disabled" : ""}>Numéro ${esc(c.name)} ${priceOf(c) ? `<small style="opacity:.7;font-weight:500">· ${esc(info(priceOf(c)))}</small>` : ""}</button>`;
  return `<p>Clique sur <b>${esc(first?.name || "")}</b>. Le numéro et le code SMS arrivent ici, tu n'as rien d'autre à ouvrir.</p>
    ${first ? btn(first, true) : ""}
    <div class="row" style="margin-top:10px">${list.filter((c) => c !== first).map((c) => btn(c, false)).join("")}</div>
    <p class="muted">Pas de code ? Rembourse, puis essaie le pays suivant.${S.smsBalance != null ? ` · Solde : ${S.smsBalance.toFixed(2)} $` : ""} · <a href="#" data-act="smsPrices">actualiser</a></p>`;
}
function smsCard(cur) {
  const left = Math.max(0, Math.round((new Date(cur.expiredAt).getTime() - Date.now()) / 1000));
  const mm = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  return `<div class="alert c-blue"><b>Numéro ${esc(cur.countryName)}</b> · ${cur.price ? cur.price.toFixed(3).replace(/0+$/, "") + " $" : ""} · expire dans <span data-smsleft>${mm}</span></div>
    ${copyLine("Numéro complet", cur.phone)}
    <p>Dans Threads (« Utiliser un numéro de mobile »), colle le numéro complet, <b>avec ${esc(cur.dial || "l'indicatif")}</b> : Threads ne le rajoute pas tout seul. Le code arrive ici tout seul, sans rien ouvrir.</p>
    ${cur.code ? `<div class="alert c-green" style="font-size:22px;font-weight:700;letter-spacing:2px">${esc(cur.code)} <button class="btn sm light" data-act="copy" data-v="${esc(cur.code)}" style="letter-spacing:0;font-size:13px">Copier</button></div>${cur.smsText ? `<p class="muted">${esc(cur.smsText)}</p>` : ""}` : `<div class="alert c-yellow" data-smswait>En attente du SMS... <span class="muted">(vérifié toutes les 5 secondes)</span></div>`}
    <div class="row" style="margin-top:10px">${cur.code ? (S.tab === "numero" ? `<button class="btn sm light" data-act="smsDone" data-wait="...">Numéro utilisé, j'en veux un autre</button>` : "") : `<button class="btn sm light" data-act="smsCode" data-wait="...">Vérifier maintenant</button><button class="btn sm bad" data-act="smsCancel" data-wait="Remboursement...">Pas de code : rembourser</button>`}</div>`;
}
function mcConnectCard(a) {
  if (!a.mcLink) {
    return `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div><div class="row">${gpill(a.group)}${spill(a.strategy)}</div>
      <p class="muted">1 clic : le CRM crée la marque Metricool et te donne le lien de connexion.</p>
      <button class="btn big" data-act="mcConnect" data-id="${a.id}" data-wait="Création de la marque...">Connecter à Metricool</button></div>`;
  }
  return `<div class="card acc"><div class="head"><span class="num">#${a.num}</span><span class="ps">@${esc(a.pseudo)}</span></div><div class="row">${gpill(a.group)}${spill(a.strategy)}</div>
    <ol>
      <li>Copie ce lien : ${copyLine("Lien", a.mcLink)}</li>
      <li>Ouvre-le dans le <b>navigateur du téléphone GeeLark du compte</b> (même téléphone, même IP). Jamais sur ton PC.</li>
      <li>Touche <b>Connect a Threads account</b>, accepte les cookies.</li>
      <li>Connecte-toi avec ce compte : ${copyLine("Pseudo", a.pseudo)}${copyLine("Mot de passe", a.password)}</li>
      <li>Accepte <b>toutes</b> les permissions. Si ça te renvoie sur Threads, ferme et refais l'étape 3.</li>
      <li>Reviens ici et clique le bouton vert.</li>
    </ol>
    <div class="row"><button class="btn big ok" data-act="mcVerify" data-id="${a.id}" data-wait="Vérification...">J'ai connecté Threads</button><button class="btn ghost" data-act="mcConnect" data-id="${a.id}" data-wait="...">Nouveau lien</button></div></div>`;
}
function noLink(a) {
  return `<div class="alert c-red">Pas de lien pour ce compte.${a.linkNote ? " " + esc(a.linkNote) : ""}</div><div class="row"><button class="btn sm" data-act="makeLink" data-id="${a.id}" data-v="brand" data-wait="Création...">Créer ${esc(S.data.settings.tinyDomain || "domaine perso")}/${esc(a.pseudo)}</button><button class="btn sm light" data-act="makeLink" data-id="${a.id}" data-v="tinyurl" data-wait="Création...">Créer tinyurl.com/${esc(a.pseudo)}</button></div>`;
}
function setupWizard(a) {
  const st = S.data.settings;
  const s = S.setup;
  const strat = a.strategy || "epingle";
  const bank = (st.bioBank && st.bioBank[strat]) || [];
  if (!s.bio && bank.length) s.bio = s.bioPick = bank[Math.floor(Math.random() * bank.length)];
  const pfps = S.data.media.filter((m) => m.kind === "pfp");
  if (!s.pfp && pfps.length) s.pfp = pfps[Math.floor(Math.random() * pfps.length)].id;
  const fill = (t) => String(t || "").replaceAll("{pseudo}", a.pseudo).replaceAll("{lien}", a.link || "LIEN MANQUANT").replaceAll("{pivot}", st.hub?.pseudo || "PIVOT MANQUANT");
  const box = (t) => `<div class="copyline"><span class="v" style="white-space:pre-wrap">${esc(t)}</span><button class="btn sm light" data-act="copy" data-v="${esc(t)}">Copier</button></div>${frSlot(t)}`;
  const explain = {
    epingle: "Ce compte garde le lien dans son post épinglé, pas dans la bio. La bio dit juste d'aller voir le post épinglé.",
    lien: "Ce compte met le lien directement dans le champ lien de la bio. La bio invite à cliquer dessus.",
    relais: `Ce compte n'a aucun lien. Il republie (citation) le post épinglé du compte pivot @${esc(st.hub?.pseudo || "?")} et épingle cette citation. Si ce compte saute, le lien n'est pas touché.`,
  }[strat];
  let linkStep = "";
  let pinStep = "";
  let checks = ["Photo de profil mise", "Bio mise"];
  if (strat === "lien") {
    linkStep = `<div class="card"><div class="stepnum">4. Lien dans la bio</div><p>Dans Modifier le profil, champ Lien, colle ce lien.</p>${a.link ? copyLine("Lien", a.link) : '<div class="alert c-red">Pas de lien libre pour ce compte. Demande à Awen / Bilot d\'ajouter des liens (onglet Contenu).</div>'}</div>`;
    pinStep = `<div class="card"><div class="stepnum">5. Post épinglé (facultatif)</div><p class="muted">Pas obligatoire pour ce compte. Si tu veux, publie la partie 1 et épingle-la, sans la partie 2.</p>${st.pinnedPost ? box(fill(st.pinnedPost)) : ""}</div>`;
    checks.push("Lien mis dans la bio");
  } else if (strat === "relais") {
    linkStep = `<div class="card"><div class="stepnum">4. Lien</div><p>Aucun lien sur ce compte. Ne mets rien dans le champ Lien.</p></div>`;
    pinStep = `<div class="card"><div class="stepnum">5. Relais du post pivot</div>${st.hub?.pseudo ? `<ol><li>Ouvre le profil du pivot : ${copyLine("Pivot", "@" + st.hub.pseudo)}${st.hub.postUrl ? copyLine("Post", st.hub.postUrl) : ""}</li><li>Sur son post épinglé, touche Republier, puis Citer.</li><li>Écris ce texte en citation, puis publie.</li>${box(fill(st.relayText || "看這篇 👇 {pivot} 的置頂貼文，答案都在裡面 🙈"))}<li>Sur ta citation, touche les 3 points, puis Épingler.</li></ol>` : '<div class="alert c-red">Compte pivot pas encore choisi (Réglages, Modèle en cours).</div>'}</div>`;
    checks.push("Citation du post pivot publiée et épinglée");
  } else {
    linkStep = `<div class="card"><div class="stepnum">4. Lien</div><p>Pas de lien dans la bio pour ce compte : il va dans le post épinglé.</p>${a.link ? copyLine("Lien (pour le post)", a.link) : '<div class="alert c-red">Pas de lien libre pour ce compte. Demande à Awen / Bilot d\'ajouter des liens (onglet Contenu).</div>'}</div>`;
    pinStep = `<div class="card"><div class="stepnum">5. Post épinglé (2 parties)</div>${st.pinnedPost ? `<ol><li>Publie la partie 1 (ton propre profil s'affiche en carte en dessous).</li>${box(fill(st.pinnedPost))}${st.pinnedReply ? `<li>Réponds à ton propre post avec la partie 2 (le lien).</li>${box(fill(st.pinnedReply))}` : ""}<li>Sur le post, touche les 3 points, puis Épingler.</li></ol>` : '<p class="muted">Modèle de post épinglé pas encore fourni.</p>'}</div>`;
    checks.push("Post épinglé publié et épinglé");
  }
  return `<h2>Setup de @${esc(a.pseudo)}</h2>${hint("setup")}
    <div class="alert">${spill(strat)}<div style="margin-top:6px">${explain}</div></div>
    <div class="card"><div class="stepnum">1. Même profil, même IP</div>
      <p>Tu restes dans le profil GeeLark <b>${esc(a.geelarkProfile || "du compte")}</b>, juste après le warm-up. Ne change pas l'IP.</p>${copyLine("Pseudo", a.pseudo)}${copyLine("Mot de passe", a.password)}</div>
    <div class="card"><div class="stepnum">2. Photo de profil</div>
      ${s.pfp ? `<div class="thumbs" style="max-width:220px"><figure><img src="/api/media/${s.pfp}" /></figure></div><div class="row" style="margin-top:8px"><a class="btn light" href="/api/media/${s.pfp}" download>Télécharger</a><button class="btn ghost" data-act="otherPfp">Une autre</button></div>` : '<p class="muted">Pas de photo de profil dans le CRM : utilise celle donnée par Awen / Bilot.</p>'}</div>
    <div class="card"><div class="stepnum">3. Bio</div>${bank.length ? `<p class="muted">Bio tirée de la banque « ${esc((S.data.strategyLabels || {})[strat] || strat)} » (${bank.length} restantes). Copie-la telle quelle : une fois le setup fini, elle sort de la banque.</p>` : '<div class="alert c-red">Plus aucune bio dans cette banque. Préviens Awen ou Bilot (Contenu, Bios).</div>'}<textarea data-setupbio>${esc(s.bio)}</textarea>${frSlot(s.bio)}<div class="row"><button class="btn light" data-act="copyBio">Copier la bio</button>${bank.length > 1 ? '<button class="btn ghost" data-act="otherBio">Une autre</button>' : ""}</div></div>
    ${linkStep}${pinStep}
    <div class="card"><div class="checklist" data-scheck>${checks.map((x) => `<label><input type="checkbox" /> ${x}</label>`).join("")}</div>
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
let smsPoll = null;
function afterRender() {
  // prix Hero SMS charges tout seuls a l'arrivee sur l'etape
  if (document.querySelector('[data-act="smsPrices"]') && !S.smsPrices && !S.smsPricesLoading) {
    S.smsPricesLoading = true;
    api("sms/prices").then((p) => { S.smsPrices = p; render(); }).catch(() => {}).finally(() => (S.smsPricesLoading = false));
    api("sms/balance").then((b) => { S.smsBalance = b.balance; }).catch(() => {});
  }
  // code SMS : on verifie toutes les 5 s tant qu'il n'est pas arrive
  clearInterval(smsPoll);
  const waiting = document.querySelector("[data-smswait]");
  if (waiting && S.data.sms && S.data.sms.status === "attente") {
    smsPoll = setInterval(async () => {
      if (!document.querySelector("[data-smswait]")) return clearInterval(smsPoll);
      try {
        const act = await api(`sms/${S.data.sms.id}/code`, {});
        const left = document.querySelector("[data-smsleft]");
        if (left) {
          const l = Math.max(0, Math.round((new Date(act.expiredAt).getTime() - Date.now()) / 1000));
          left.textContent = `${String(Math.floor(l / 60)).padStart(2, "0")}:${String(l % 60).padStart(2, "0")}`;
        }
        if (act.code || act.status !== "attente") {
          clearInterval(smsPoll);
          if (act.code) toast("Code SMS reçu : " + act.code);
          else toast("Le numéro a expiré. Prends-en un autre.", true);
          await refresh();
        }
      } catch {}
    }, 5000);
  }
  // traductions FR manquantes : une requete pour tout l'ecran, puis on remplit sur place
  const need = [...document.querySelectorAll("[data-fr]")].map((el) => el.dataset.fr).filter((t) => !S.tr?.[t]);
  if (need.length && !S.trLoading && (S.trTries || 0) < 3) {
    S.trLoading = true;
    S.trTries = (S.trTries || 0) + 1;
    api("tr", { texts: need })
      .then(async (r) => {
        delete r._fail;
        // ce que le serveur n'a pas pu traduire : le navigateur demande a Google, puis le CRM le garde en cache
        const miss = need.filter((t) => !r[t]);
        if (miss.length) {
          const got = {};
          for (const t of miss) {
            try {
              const g = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fr&dt=t&q=${encodeURIComponent(t)}`);
              const j = await g.json();
              const fr = (j?.[0] || []).map((x) => x?.[0] || "").join("").trim();
              if (fr) got[t] = fr;
            } catch {}
          }
          if (Object.keys(got).length) {
            Object.assign(r, got);
            api("tr", { save: got }).catch(() => {});
          }
        }
        S.tr = { ...(S.tr || {}), ...r };
        if (Object.keys(r).length) S.trTries = 0;
        document.querySelectorAll("[data-fr]").forEach((el) => {
          const fr = S.tr[el.dataset.fr];
          if (fr) el.querySelector(".frv").textContent = fr;
        });
      })
      .catch(() => {})
      .finally(() => {
        S.trLoading = false;
        if ([...document.querySelectorAll("[data-fr]")].some((el) => !S.tr?.[el.dataset.fr])) setTimeout(afterRenderTr, 1500);
      });
  }
  // remettre les chronos en route
  document.querySelectorAll("[data-timer]").forEach((el) => {
    const end = Number(sessionStorage.getItem("timer_" + el.dataset.timer) || 0);
    if (end) tick(el, end);
  });
}
function afterRenderTr() {
  if (document.querySelector("[data-fr]")) afterRender();
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
  help(b) {
    const k = b.dataset.k;
    const h = HELP[k];
    if (!h) return;
    const v = helpVideo(k);
    modal(`<h3>${esc(h.t)}</h3>${v ? videoEmbed(v) : ""}<ol class="helpsteps">${h.more.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>${h.trap ? `<div class="alert c-red"><b>Piège</b> : ${esc(h.trap)}</div>` : ""}<p class="muted">Tu bloques encore ? Écris à ton manager avec une capture d'écran.</p>`);
    api("help/seen", { k }).catch(() => {});
  },
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
  wizDomain(b) {
    readWizFields();
    S.wiz.f.linkDomain = b.dataset.v;
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
      toast(`@${a.pseudo} enregistré` + (a.link ? " · lien " + a.link : a.linkNote ? " · lien non créé : " + a.linkNote : ""), !!a.linkNote);
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
      await api("accounts/failed", { phone: S.wiz.f.phone, smsId: S.wiz.f.smsId || "", reason: $("#failwhy").value });
      closeModal();
      S.wiz = { step: 1, f: { geelarkProfile: S.wiz.f.geelarkProfile } };
      await refresh();
      toast("Noté. Change l'IP et on recommence");
    });
  },
  startTimer(b) {
    const end = Date.now() + (Number(S.data.settings.warmupMinutes) || 10) * 60e3;
    sessionStorage.setItem("timer_" + b.dataset.id, end);
    tick($(`[data-timer="${b.dataset.id}"]`), end);
  },
  async warmupDone(b) {
    const boxes = [...document.querySelectorAll(`[data-wcheck="${b.dataset.id}"] input`)];
    if (boxes.some((x) => !x.checked)) return toast("Coche toutes les cases d'abord.", true);
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/warmup`, {});
      sessionStorage.removeItem("timer_" + b.dataset.id);
      toast("Warm-up validé. Place au setup.");
      if (S.wiz?.step === 6) S.wiz = { step: 1, f: {} };
      await refresh();
      S.setup = { id: b.dataset.id };
      S.tab = "setup";
      render();
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
    const st = S.data.settings;
    const strat = acc(S.setup.id)?.strategy || "epingle";
    const bios = ((st.bioBank && st.bioBank[strat]) || []).filter((x) => x !== S.setup.bioPick);
    if (!bios.length) return toast("Pas d'autre bio dans cette banque.", true);
    S.setup.bio = S.setup.bioPick = bios[Math.floor(Math.random() * bios.length)];
    render();
  },
  copyBio() {
    copy($("[data-setupbio]").value);
  },
  async setupDone(b) {
    if ([...document.querySelectorAll("[data-scheck] input")].some((x) => !x.checked)) return toast("Coche toutes les cases d'abord.", true);
    if (!$("[data-setupbio]").value.trim()) return toast("Mets une bio d'abord.", true);
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/setup`, { bio: $("[data-setupbio]").value, bioPick: S.setup?.bioPick || "" });
      S.setup = null;
      let msg = "Setup fini ! Prochaine étape : Metricool.";
      if (S.data.configured.metricool) {
        try {
          await api(`accounts/${b.dataset.id}/mcconnect`, {});
          msg = "Setup fini ! Marque Metricool créée : connecte Threads.";
        } catch (e) {
          msg = "Setup fini. Metricool : " + e.message;
        }
      }
      toast(msg);
      S.tab = "metricool";
      await refresh();
    });
  },
  async smsPrices(b) {
    S.smsPrices = null;
    await run(b, async () => {
      S.smsPrices = await api("sms/prices");
      try { S.smsBalance = (await api("sms/balance")).balance; } catch {}
      render();
    });
  },
  async smsBuy(b) {
    readWizFields();
    await run(b, async () => {
      const act = await api("sms/buy", { country: Number(b.dataset.v) || 14 });
      S.wiz.f.phone = act.phone;
      S.wiz.f.smsId = act.id;
      await refresh();
      toast(`Numéro pris : ${act.phone}`);
    });
  },
  async smsCode(b) {
    await run(b, async () => {
      const act = await api(`sms/${S.data.sms.id}/code`, {});
      if (!act.code) toast("Toujours rien. Patiente, ça arrive en général sous 1 à 2 minutes.", true);
      else toast("Code reçu : " + act.code);
      await refresh();
    });
  },
  async driveImport(b) {
    const link = $("[data-drivelink]").value.trim();
    const dest = $("[data-drivedest]").value;
    if (!link) return toast("Colle le lien du dossier.", true);
    await run(b, async () => {
      const list = (await api("drive/list?folder=" + encodeURIComponent(link))).filter((f) => !f.already);
      if (!list.length) return toast("Rien de nouveau dans ce dossier.");
      let ok = 0;
      const fails = [];
      for (const f of list) {
        b.innerHTML = `<span class="spin"></span> ${ok + fails.length + 1}/${list.length}`;
        try {
          const r = await fetch("/api/drive/file?id=" + f.id, { headers: { authorization: "Bearer " + S.token } });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "erreur " + r.status);
          const dataUrl = await compress(await r.blob());
          await api("media/upload", dest === "__pfp" ? { kind: "pfp", dataUrl, filename: f.name, driveId: f.id } : { group: dest, dataUrl, filename: f.name, driveId: f.id });
          ok++;
        } catch (e) {
          fails.push(`${f.name} : ${e.message}`);
        }
      }
      await refresh();
      toast(`${ok} photo(s) importée(s)` + (fails.length ? ` · ${fails.length} échec(s) : ${fails[0]}` : ""), !!fails.length);
    });
  },
  async tinyModel(b) {
    await run(b, async () => {
      const r = await api("tiny/model", {});
      await refresh();
      toast("Lien créé : " + r.link);
    });
  },
  async tinyScan(b) {
    await run(b, async () => {
      S.tinyScan = await api("tiny/cleanup");
      render();
    });
  },
  tinyClean() {
    const n = S.tinyScan.count;
    modal(`<h3>Supprimer ${n} liens ${esc(S.tinyScan.domain)} ?</h3><p>C'est définitif : ces liens ne marcheront plus jamais. Les liens des comptes du CRM sont gardés.</p>
      <button class="btn big bad" style="margin-top:14px" data-act="tinyCleanGo" data-wait="Suppression en cours...">Oui, supprimer les ${n} liens</button>`);
  },
  async tinyCleanGo(b) {
    await run(b, async () => {
      const r = await api("tiny/cleanup", { confirm: S.tinyScan.domain });
      closeModal();
      S.tinyScan = null;
      toast(`${r.deleted} lien(s) supprimé(s)` + (r.failedCount ? ` · ${r.failedCount} échec(s) : ${r.failed[0]}` : ""), !!r.failedCount);
      render();
    });
  },
  async smsDone(b) {
    await run(b, async () => {
      await api(`sms/${S.data.sms.id}/finish`, {});
      await refresh();
      toast("Numéro fermé. Tu peux en prendre un autre.");
    });
  },
  async smsCancel(b) {
    readWizFields();
    await run(b, async () => {
      await api(`sms/${S.data.sms.id}/cancel`, {});
      S.wiz.f.phone = "";
      S.wiz.f.smsId = "";
      await refresh();
      toast("Remboursé. Prends le pays suivant.");
    });
  },
  async mcConnect(b) {
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/mcconnect`, {});
      await refresh();
      toast("Marque créée. Suis les étapes pour connecter Threads.");
    });
  },
  async mcVerify(b) {
    await run(b, async () => {
      const r = await api(`accounts/${b.dataset.id}/mcverify`, {});
      if (!r.connected) return toast("Threads n'est pas encore connecté sur Metricool. Finis les étapes puis reclique.", true);
      const p = r.plan || { created: [], problems: [] };
      await refresh();
      toast(`Threads connecté (@${r.threads}). ${p.created.length} post(s) programmé(s)` + (p.problems.length ? " · " + p.problems[0] : ""), !!p.problems.length);
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
      const r = await planFull(b.dataset.id, Number(b.dataset.days) || 3, b, "", b.dataset.mode);
      await refresh();
      const a = acc(b.dataset.id);
      toast(`${r.created} post(s) programmé(s)` + (a?.plannedUntil ? ` · prévu jusqu'au ${a.plannedUntil}` : "") + (r.problems.length ? " · " + r.problems[0] : ""), !!r.problems.length);
    });
  },
  async postsSync(b) {
    await run(b, async () => {
      const r = await api("posts/sync", {});
      await refresh();
      toast(`Vérifié : ${r.accounts} compte(s), ${r.changed} post(s) mis à jour` + (r.errors.length ? " · " + r.errors[0] : ""), !!r.errors.length);
    });
  },
  dayPosts(b) {
    const a = acc(b.dataset.id);
    const now = Date.now();
    const ps = S.data.posts.filter((p) => p.accountId === a.id && p.day === b.dataset.v && p.status !== "annule").sort((x, y) => (x.at < y.at ? -1 : 1));
    const lab = { publie: ["c-green", "Publié"], erreur: ["c-red", "Erreur"], programme: ["c-blue", "Prévu"], retard: ["c-yellow", "En retard"] };
    modal(`<h3>@${esc(a.pseudo)} · ${esc(b.dataset.v)}</h3>${ps.map((p) => {
      const k = p.status === "programme" && new Date(p.at).getTime() < now - 2 * 3600e3 ? "retard" : p.status;
      const [c, l] = lab[k] || ["", k];
      const t = S.data.texts.find((x) => x.id === p.textId);
      return `<div class="card" style="margin:8px 0"><div class="row"><b>${esc((p.local || "").slice(11, 16))}</b><span class="pill ${c}">${l}</span>${p.url ? `<a class="btn sm light" href="${esc(p.url)}" target="_blank" rel="noopener">Voir le post</a>` : ""}</div>
        ${t ? `<p style="margin:8px 0 0">${esc(t.text)}</p>${t.fr ? `<p class="muted" style="margin:4px 0 0">${esc(t.fr)}</p>` : ""}` : ""}${p.mediaId ? `<div class="thumbs" style="max-width:120px;margin-top:8px"><figure><img src="/api/media/${p.mediaId}" /></figure></div>` : ""}
        ${p.error ? `<div class="alert c-red" style="margin-top:8px">${esc(p.error)}</div>` : ""}${k === "retard" ? '<div class="alert c-yellow" style="margin-top:8px">L\'heure est passée et Metricool ne l\'a pas encore publié. Clique « Vérifier sur Metricool ». Si ça reste orange : regarde si le compte doit être reconnecté.</div>' : ""}</div>`;
    }).join("")}`);
  },
  async planAll(b) {
    await run(b, async () => {
      let n = 0;
      const probs = [];
      for (const a of S.data.accounts.filter((x) => x.status === "actif" && x.blogId)) {
        try {
          const r = await planFull(a.id, Number(b.dataset.days) || 3, b, `@${a.pseudo}`);
          n += r.created;
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
  async engaged(b) {
    const followers = $(`[data-efollowers="${b.dataset.id}"]`)?.value;
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/engaged`, { followers });
      await refresh();
      toast("Engagement noté");
    });
  },
  async engageToggle(b) {
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/engage`, { on: b.dataset.v === "1" });
      await refresh();
      toast(b.dataset.v === "1" ? "Compte mis dans le test" : "Compte sorti du test");
    });
  },
  async engagePick(b) {
    await run(b, async () => {
      const r = await api("engage/pick", { n: 5 });
      await refresh();
      toast(r.picked.length ? `Test : ${r.picked.map((p) => "@" + p).join(", ")}` : `Rien à tirer (${r.total} compte(s) déjà en test, ou pas assez de comptes actifs)`, !r.picked.length);
    });
  },
  async check(b) {
    const followers = $(`[data-followers="${b.dataset.id}"]`)?.value;
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/check`, { status: b.dataset.st, followers });
      await refresh();
      toast("Noté");
    });
  },
  dead(b) {
    const a = acc(b.dataset.id);
    modal(`<h3>@${esc(a.pseudo)} a sauté ?</h3><ol><li>Le CRM annule ses posts programmés et libère sa marque Metricool tout seul.</li><li>Crée tout de suite le remplaçant : il reprend sa place, sa marque et son lien.</li></ol>
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
      <label class="f">Stratégie</label><select data-ed="strategy">${Object.entries(S.data.strategyLabels || {}).map(([k, l]) => `<option value="${k}" ${k === a.strategy ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
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
      await refresh();
      toast("Enregistré");
    });
  },
  async unlink(b) {
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/unlink`, {});
      closeModal();
      await refresh();
      toast("Délié de Metricool");
    });
  },
  async delAcc(b) {
    if (!confirmTwice(b)) return;
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/delete`, {});
      closeModal();
      await refresh();
      toast("Supprimé");
    });
  },
  async makeLink(b) {
    await run(b, async () => {
      const r = await api(`accounts/${b.dataset.id}/makelink`, { linkDomain: b.dataset.v });
      await refresh();
      toast("Lien créé : " + r.link);
    });
  },
  async linkStats(b) {
    await run(b, async () => {
      const r = await api("links/stats", {});
      await refresh();
      toast(`${Object.keys(r.links).length} lien(s) relevé(s)` + (r.errors.length ? ` · ${r.errors.length} souci(s)` : ""), !!r.errors.length);
    });
  },
  async health(b) {
    await run(b, async () => {
      const r = await api("metricool/health", {});
      await refresh();
      toast(r.length ? `${r.length} alerte(s)` : "Tout est connecté", !!r.length);
    });
  },
  async bulk(b) {
    const g = b.dataset.g;
    const lines = $(`[data-bulk="${g}"]`).value;
    await run(b, async () => {
      const r = await api("texts/bulk", { group: g, lines });
      await refresh();
      toast(`${r.added} texte(s) ajouté(s)`);
    });
  },
  async seed(b) {
    const g = $("[data-seedgroup]").value;
    await run(b, async () => {
      const list = await (await fetch("/seed-textes.json")).json();
      const r = await api("texts/bulk", { group: g, lines: list.map((x) => `${x.text} || ${x.fr}`).join("\n") });
      await refresh();
      toast(`${r.added} texte(s) importé(s) dans ${group(g).name}`);
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
      const blocks = (sel) => $(sel).value.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      const bioBank = { epingle: blocks('[data-bank="epingle"]'), lien: blocks('[data-bank="lien"]'), relais: blocks('[data-bank="relais"]') };
      const strategies = { epingle: Number($('[data-strat="epingle"]').value) || 0, lien: Number($('[data-strat="lien"]').value) || 0, relais: Number($('[data-strat="relais"]').value) || 0 };
      const hub = { pseudo: $('[data-hub="pseudo"]').value.trim().replace(/^@/, ""), postUrl: $('[data-hub="postUrl"]').value.trim() };
      await api("settings", { bioBank, strategies, hub, relayText: $('[data-set="relayText"]').value.trim(), warmupTargets: [...new Set($('[data-set="warmupTargets"]').value.split(/\n/).map((x) => x.trim().replace(/^.*threads\.(?:com|net)\/@?/i, "").replace(/^@/, "").replace(/[/?#].*$/, "")).filter(Boolean))], links: lines("links"), pinnedPost: $('[data-set="pinnedPost"]').value.trim(), pinnedReply: $('[data-set="pinnedReply"]').value.trim() });
      await refresh();
      toast("Enregistré");
    });
  },
  async saveSecrets(b) {
    const body = {};
    document.querySelectorAll("[data-sec]").forEach((el) => el.value.trim() && (body[el.dataset.sec] = el.value.trim()));
    const sp = ($('[data-st="socksPort"]')?.value || "").replace(/\D/g, "");
    const spChanged = sp !== String(S.data.settings.socksPort || "");
    if (!Object.keys(body).length && !spChanged) return toast("Rien à enregistrer.", true);
    await run(b, async () => {
      const proxy = body.proxy;
      delete body.proxy;
      if (proxy || spChanged) await api("settings", { ...(proxy ? { proxy } : {}), ...(spChanged ? { socksPort: sp } : {}) });
      if (Object.keys(body).length) await api("secrets", body);
      await refresh();
      toast("Enregistré (caché pour la sécurité)");
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
      warmupMinutes: Number(v("warmupMinutes")),
      groups,
      videos,
      sopExtra: v("sopExtra"),
      model: { name: $('[data-model="name"]').value.trim(), link: $('[data-model="link"]').value.trim() },
      tinyDomain: $('[data-st="tinyDomain"]').value.trim(),
    };
    await run(b, async () => {
      await api("settings", body);
      await refresh();
      toast("Réglages enregistrés");
    });
  },
  async saveUser(b) {
    const v = (k) => $(`[data-u="${k}"]`).value.trim();
    await run(b, async () => {
      await api("users", { name: v("name"), pin: v("pin"), role: v("role") });
      await refresh();
      toast("Accès enregistré");
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
// garde les guides ouverts/fermes d'un rendu a l'autre
document.addEventListener("toggle", (e) => {
  const k = e.target?.dataset?.sop;
  if (!k) return;
  if (!S.sopOpen) S.sopOpen = new Set([...document.querySelectorAll("details[data-sop][open]")].map((d) => d.dataset.sop));
  e.target.open ? S.sopOpen.add(k) : S.sopOpen.delete(k);
}, true);
document.addEventListener("input", (e) => {
  // on garde chaque champ de l'assistant en mémoire à chaque frappe (pas seulement au clic suivant)
  if (e.target.matches("[data-f]") && S.wiz) S.wiz.f[e.target.dataset.f] = e.target.value.trim();
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
    await refresh();
    toast(`${ok} photo(s) ajoutée(s)`);
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
    // une video en lecture (ou en plein ecran) ne doit jamais etre coupee par le rafraichissement
    const watching = document.fullscreenElement || [...document.querySelectorAll("video")].some((v) => !v.paused && !v.ended);
    if (S.token && S.data && !S.busy && !working && !watching && $("#modal").classList.contains("hidden") && !document.activeElement?.matches("input,textarea,select")) refresh().catch(() => {});
  }, 60000);
})();
