# CLAUDE.md : Threads HQ (CRM de la VA)

Ce fichier est pour toi, Claude, quand tu travailles sur ce dépôt. Lis-le en entier avant de modifier quoi que ce soit.

## Le projet en 5 lignes
- Threads HQ gère une VA qui crée, réchauffe, configure et surveille des comptes Threads.
- Funnel : post épinglé + lien en bio → Telegram → OnlyChat, sur une modèle gérée par Bilot.
- Le site a 2 types d'utilisateurs : la VA (accès limité) et les admins (Awen et Bilot).
- Le site est en ligne sur Netlify : https://threads-hq-sa.netlify.app
- Le dépôt est PUBLIC. Donc : aucun secret dans le code, jamais.

## Où sont les choses
- `public/` : l'interface. HTML, CSS, JS, sans build ni framework.
  - `public/app.js` : toute l'interface (vues, actions, assistants).
  - `public/style.css` : le design (noir et blanc, une seule couleur d'action : le bleu).
  - `public/seed-textes.json` : les 42 textes de départ, validés et déjà postés.
- `lib/core.mjs` : toute la logique serveur (routes `/api/*`). Stockage, auth, Metricool, rotation IP.
- `netlify/functions/api.mjs` : branche `lib/core.mjs` sur Netlify (stockage = Netlify Blobs).
- `dev/` : tests et serveur local.
- `netlify.toml` : config de déploiement. Pas de build, le site est statique + une fonction.

## Commandes
```bash
npm install
node dev/server.mjs     # serveur local sur http://localhost:8788 (faux Metricool + faux proxy)
node dev/test-api.mjs   # teste toute l'API (lancer sur un serveur neuf)
node dev/test-ui.mjs    # parcours complet dans un navigateur (Playwright)
```
Avant de dire qu'un changement marche : lance les deux tests et vérifie qu'ils passent. Ne dis jamais "c'est fait" sans preuve.

## Déploiement
- Commit sur `main` puis push : Netlify redéploie tout seul, environ 30 secondes.
- Vérifie après le push que le site a bien changé (ouvre l'URL, regarde le résultat).

## Règles de sécurité (non négociables)
- Jamais de token, de mot de passe, de lien de rotation, de proxy ou de numéro dans le code ou dans un commit.
- Ces secrets se collent dans l'onglet Réglages > Connexions du site. Le serveur les garde dans le stockage Netlify. Le navigateur ne les relit jamais.
- Un lien de rotation d'IP est une clé : quiconque l'a peut changer l'IP du proxy. Ne l'affiche jamais en clair.
- Pas de modification des règles d'accès (rôles VA / admin) sans que Awen ou Bilot le demande.

## Règles métier (à respecter dans le code)
- Un compte = un profil GeeLark = une IP. Le CRM refuse de créer un compte si l'IP fraîche a déjà servi.
- La création d'un compte demande une IP changée il y a moins de 15 minutes.
- Pas d'attente : création → 10 min de warm-up (même profil, même IP) → setup direct (photo, bio, puis lien / post épinglé / relais selon la stratégie). Le setup s'ouvre tout seul après « Warm-up fini ».
- Un compte qui saute : ses posts programmés sont annulés sur Metricool, et le prochain compte créé prend sa place (même groupe, même lien, `replaces`).
- Un compte n'a jamais deux fois le même texte. Les posts sont planifiés aux créneaux de la cible (fuseau `Asia/Taipei`), avec un décalage aléatoire.
- Les groupes (textes, photos, villes) sont configurables dans Réglages. Un groupe avec photos a `withPhoto = oui`.
- Chaque compte a une **stratégie** de setup, répartie selon les cibles (Contenu > Les 3 stratégies) :
  - `epingle` : pas de lien dans la bio, le lien est dans la réponse au post épinglé (2 parties).
  - `lien` : le lien est dans le champ lien du profil.
  - `relais` : aucun lien ; le compte cite le post épinglé du compte pivot (`settings.hub`) et épingle la citation.
  Un compte remplaçant garde la stratégie du compte sauté. Les bios viennent de `settings.bioBank[strategie]`.

## Metricool (faits vérifiés)
- Base : `https://app.metricool.com/api`. Auth : header `X-Mc-Auth` avec le token, plus `userId` et `blogId` en paramètres.
- L'API n'existe qu'au plan Advanced et supérieur.
- Lister les marques : `GET /v2/settings/brands?userId=...`
- Planifier : `POST /v2/scheduler/posts?blogId=...&userId=...`. Corps : `publicationDate {dateTime, timezone}`, `text`, `providers: [{network: "threads"}]`, `media`, `threadsData`, et d'autres champs optionnels.
- Images : `GET /actions/normalize/image/url?url=...` d'abord, puis passer l'URL retournée dans `media`. L'URL d'origine doit être publique et non expirante.
- Annuler : `DELETE /v2/scheduler/posts/{id}?blogId=...`
- Créer une marque nommée : `POST /v2/settings/brands?userId=...` corps `{brandLabel: "@pseudo"}` → `data.id` = blogId (testé en vrai le 26/10/2026).
- Lien de connexion anonyme (la VA connecte Threads sans compte Metricool) : `POST /v2/settings/brands/connections/anonymous-link?blogId=...&userId=...` → `data.link` (https://f.mtr.cool/XXXX, valable 3 jours). `GET` renvoie 404 s'il n'y en a pas, `DELETE` l'invalide. Testé en vrai : la page affiche « Connect a Threads account ».
- Vérifier la connexion : dans `GET /v2/settings/brands`, la marque a `networksData.threadsData.username`.
- Déconnecter Threads d'une marque : `DELETE /v2/settings/brands/connections/threads?blogId=...`
- Renommer une marque : `GET /admin/update-label-blog?blogId=...&newName=...`
- Supprimer une marque : `DELETE /v2/settings/brands/{id}?blogId=...` corps `{maxRecoveryDays: 1}`.
- Flux CRM : setup fini → `accounts/:id/mcconnect` (crée ou reprend la marque + lien) → la VA ouvre le lien dans le téléphone GeeLark → `accounts/:id/mcverify` (vérifie le pseudo, passe en actif, planifie 3 jours). Un compte sauté libère sa marque (Threads déconnecté), son remplaçant la reprend et la renomme.
- Si tu touches à Metricool, vérifie le contrat dans `https://app.metricool.com/api/swagger.json`.

## Design : comment parler et montrer
- Noir, blanc, une couleur d'action (le bleu). Couleurs d'état seulement en petits points ou fonds très légers.
- Zéro emoji dans l'interface. Pas de majuscules pour les labels. Pas de flèches dans les boutons.
- Français simple, phrases courtes, verbes à l'action. Un bouton dit ce qu'il fait ("Relier", "Enregistrer", "Setup fini").
- La VA doit comprendre sans formation. Une action par ligne dans les procédures.
- Design professionnel d'agence : sobre, net, pas enfantin.

## Données importantes
- La VA n'a pas accès aux réglages, aux logs ni aux secrets. Ne les expose jamais à la VA.
- Les logs racontent tout ce que font la VA et l'admin : garde-les lisibles (fonction `logDetails` dans `app.js`).
- Le post épinglé a 2 parties : le post (avec `{pseudo}`) et la réponse avec le lien (`{lien}`). Les placeholders sont remplacés par compte.

## En attente (demandé à Awen)
- La modèle Threads en cours est Chloé (marché Taïwan / HK / Singapour, bios en chinois traditionnel). Son lien n'est pas encore donné.
- Le pseudo du compte pivot (stratégie relais).
- Les liens TinyURL, les bios, les photos de profil et les photos de contenu, à ajouter dans Contenu.
- Les réglages SMS (smspool) et le tuto de la VA.

## Quand tu hésites
- Pose la question avant une décision qui touche aux comptes réels, à Metricool ou aux secrets.
- Pour le reste, fais, teste, puis rends compte en 3 lignes maximum.
