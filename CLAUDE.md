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
- Création d'un compte : l'étape 1 demande une IP changée il y a moins de 15 min (navigateur). L'enregistrement final (« Oui, il marche ») accepte l'IP jusqu'à 4 h (`IP_SAVE_MAX_H`), car GeeLark + SMS + inscription prennent souvent plus de 15 min. Bug réel du 28 oct. : Sandra bloquée en fin de création.
- Pas d'attente : création → 10 min de warm-up (même profil, même IP) → setup direct (photo, bio, puis lien / post épinglé / relais selon la stratégie). Le setup s'ouvre tout seul après « Warm-up fini ».
- Un compte qui saute : ses posts programmés sont annulés sur Metricool, et le prochain compte créé prend sa place (même groupe, même lien, `replaces`).
- Un compte n'a jamais deux fois le même texte. Les posts sont planifiés aux créneaux de la cible (fuseau `Asia/Taipei`), avec un décalage aléatoire.
- Les groupes (textes, photos, villes) sont configurables dans Réglages. Un groupe avec photos a `withPhoto = oui`.
- Chaque compte a une **stratégie** de setup, répartie selon les cibles (Contenu > Les 3 stratégies) :
  - `epingle` : pas de lien dans la bio, le lien est dans la réponse au post épinglé (2 parties).
  - `lien` : le lien est dans le champ lien du profil.
  - `relais` : aucun lien ; le compte cite le post épinglé du compte pivot (`settings.hub`) et épingle la citation.
  Un compte remplaçant garde la stratégie du compte sauté. Les bios viennent de `settings.bioBank[strategie]`.

## Bios
- 3 banques (épinglé, lien, relais) dans `settings.bioBank`. Chaque bio ne sert qu'une fois : au « Setup fini », la bio tirée (`bioPick`) et la bio finale sortent de la banque et vont dans `settings.biosUsed`. Une sauvegarde de Contenu ne peut pas les remettre (filtrée côté serveur).
- `public/seed-bios.json` : 250 bios par stratégie écrites le 27/10/2026 (chinois traditionnel, sans nom de plateforme, « lien » finit toujours par 👇, jamais 置頂 ; épinglé et relais renvoient au 置頂).
- Alerte admin dans Aujourd'hui sous 20 bios restantes dans une banque.

## Hero SMS (numéros pour créer les comptes)
- Base : `https://hero-sms.com/api/v1`. Auth : header `Authorization: ApiKey <clé>`. Clé dans Réglages > Connexions, champ 6 (secret, jamais dans le repo).
- Hero coupe parfois (« fetch failed », 502/503/504, 429) : `heroSend` retente 3 fois. Pour un achat, avant chaque nouvel essai on relit les activations : si Hero a créé le numéro malgré la réponse perdue, on le reprend (jamais 2 numéros achetés). Bug réel du 29 oct. : la VA ne recevait aucun numéro.
- Service Instagram+Threads = `ig`. Pays (27/10/2026) : France 78 en premier (même pays que le proxy), USA 187, Hong Kong 14 (Instagram n'y envoie souvent pas le SMS), Singapour 196, Taïwan 55 retiré (liste publique : `/stubs/handler_api.php?action=getCountries`).
- Prix/stock : `GET /activations/offers/sms?services=ig&countries=14,196,55`. Acheter : `POST /activations {service, country, amount:1, verificationType:"sms"}` → `data[0]` (id, phone sans +, countryPhoneCode, price, expiredAt).
- Code : `GET /activations/{id}/otp/last` (404 tant que rien). Fin : `POST /activations/{id}/finish`. Annuler + rembourser (seulement sans code) : `DELETE /activations/{id}`. Solde : `/stubs/handler_api.php?action=getBalance&api_key=...` → `ACCESS_BALANCE:x`.
- Flux CRM : onglet « Numéro » (ou étape 3 de « Créer un compte ») → gros bouton Hong Kong, Singapour seulement si HK vide (Taïwan retiré), clique, le numéro s'affiche, le code arrive tout seul (vérif toutes les 5 s). Compte créé → activation terminée. Échec ou « Annuler » sans code → remboursé.
- Prix vus le 26/10/2026 (Instagram+Threads) : Hong Kong 0,035 $ (934 dispo), Singapour 0,21 $ (117), Taïwan 0,75 $ (virtuels seulement).

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
- Statut réel des posts : `GET /v2/scheduler/posts?blogId=&start=YYYY-MM-DDT00:00:00&end=...&timezone=` → `data[].providers[].status` (PUBLISHED, PUBLISHING, PENDING, AWAITING_CONFIRMATION, ERROR, DRAFT), `publicUrl`, `detailedStatus`. Le CRM relit tout toutes les 20 min (`postsSync`) : publié (avec lien), erreur (avec raison), en retard (heure passée de 2 h sans publication). Onglet Planning = grille 16 jours par compte.
- Planifier : une fonction Netlify coupe vers 10 s, donc `planAccount` rend la main après ~7 s (`partial: true`) et le navigateur relance (`planFull`). Un post publié ou en erreur garde son créneau (pas de doublon).
- Flux CRM : setup fini → `accounts/:id/mcconnect` (crée ou reprend la marque + lien) → la VA ouvre le lien dans le téléphone GeeLark → `accounts/:id/mcverify` (vérifie le pseudo, passe en actif, planifie 3 jours). Un compte sauté libère sa marque (Threads déconnecté), son remplaçant la reprend et la renomme.
- Si tu touches à Metricool, vérifie le contrat dans `https://app.metricool.com/api/swagger.json`.

## Tutos vidéo (bouton « ? » et page SOP)
- `public/help/<clé>.mp4` : vrais tutos filmés par Awen (Loom), montés avec voix FR ElevenLabs (via Higgsfield), mots de passe / numéros / codes floutés. Clés : geelark, numero, compte, warmup, setup, metricool, planning, creation (tout enchaîné).
- Mapping dans `HELP_TUTOS` (app.js). Page SOP : 1 section = 1 tuto court (même ordre que le tuto complet), plus « Tuto complet » en haut (creation.mp4). `today`, `check`, `reconnect`, `remplacement` gardent leurs vieilles mini vidéos `.webm` muettes (pas encore filmées). « Les 3 stratégies » : texte seul.
- Le rafraîchissement auto (60 s) ne tourne pas pendant qu'une vidéo joue ; les guides ouverts restent ouverts (`S.sopOpen`).
- Un lien mis dans Réglages > Vidéos des SOP passe avant le fichier.
- La VA crée le compte directement dans Threads (« Utiliser un numéro de mobile »), pas via Instagram : les textes du CRM le disent.

## Pseudos violets (warm-up quotidien, 5 comptes)
- `acc.engage` = pseudo en violet partout (`psTag`) : la VA warm-up ce compte 10 min par jour sur son GeeLark (3-4 likes, 3-4 commentaires en chinois, 2 abonnements max, rien publier). Aucun bouton à cliquer pour elle.
- Pop-up violet 2 s (`warmPop`) : une fois par jour à l'ouverture d'« Aujourd'hui », et au clic sur un pseudo violet. Rappel permanent en bas d'« Aujourd'hui ».
- Admin : Comptes > « Mettre N compte(s) en violet au hasard » (`POST /api/engage/pick`) ou « Mettre en violet / Enlever le violet » sur chaque carte.
- Un compte violet qui saute : son remplaçant reste violet.
- Notes par compte : « Modifier / notes » (champ `notes`), affichées sur la carte.
- Tests : `dev/test-api.mjs`, puis `node dev/test-engage-ui.mjs` sur les mêmes données.

## Banque de pseudos
- `settings.pseudoBank` : ~1480 pseudos style taïwanais/HK « chloe + mot pinyin + chiffres » générés (v2, une ancienne banque v1 est remplacée toute seule) (`buildPseudoBank`, valeur par défaut tant que la banque n'est pas enregistrée). Étape 4 de la création : « Pseudo proposé » + Utiliser / Copier / Un autre.
- Un pseudo pris par un compte sort de la banque (`pseudosUsed`) ; une sauvegarde de Contenu ne peut pas le remettre, ni un pseudo d'un compte existant. Alerte admin sous 20.
- Le lien TinyURL garde lettres, chiffres, - et _ (les points sautent) : `aliasOf` côté écran = `tinyCreate` côté serveur.

## Traduction FR
- Tout texte chinois montré à la VA (post épinglé, réponse, citation relais, bio) a sa traduction FR dessous (`frSlot`).
- Route `POST /api/tr {texts}` : Google Translate (gtx), cache par texte dans le store (`tr/<sha1>`).

## Planification
- `+3 jours` / `+7 jours` (mode `add`) : ajoutent N jours APRÈS le dernier jour déjà prévu (avant : 0 post si déjà plein). `14 jours` et « Remplir 14 jours pour tous » remplissent les trous jusqu'à J+13.
- Le 1er appel fixe `until`, le navigateur le renvoie si la fonction a coupé (partial). Jamais plus de J+30.

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
