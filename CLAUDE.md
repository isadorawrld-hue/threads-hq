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
- Bouton IP du haut : pendant une création (assistant étapes 2 à 5 ou numéro SMS en cours), il ouvre un avertissement au lieu de changer l'IP (point bleu « Création en cours : garde cette IP »). Bug réel du 29-30 oct. : la VA rechangeait l'IP en pleine inscription parce que le point devenait gris, et Threads demandait une vérification.
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

## SMSPool (fournisseur de numéros proposé en premier)
- Doc : SDK officiel `@smspool/sdk` (npm). Base `https://api.smspool.net`, POST en formulaire, clé en `Authorization: Bearer` + champ `key`.
- Service 457 = « Instagram / Threads ». Pays SMSPool : France 23, USA 1 (`SPOOL_COUNTRY`).
- Achat `/purchase/sms` (country, service, pricing_option=1 « highest success rate » puis 0 si aucun pool sous le plafond, max_price = Réglage `smsMaxPrice`, 2 $ par défaut ; le 30 oct. le moins cher en France était 1,63 $ alors que /request/price affichait 0,14 $, donc le CRM affiche le plafond, pas ce prix), code `/sms/check` (orderid → champ `sms`), remboursement `/sms/cancel` (orderid), solde `/request/balance`, prix `/request/price`.
- Réglages > Connexions champ 9. Plusieurs sites branchés = la VA voit un bouton par site (SMSPool, SMSOnline, Hero), le premier en gros.
- Réglages > Liens : « Pays des numéros » (cases). Depuis le 30 oct. : France seulement (les numéros US faisaient sauter les comptes).

## SMSOnline (2e fournisseur de numéros)
- Doc : https://premium.smsonline.cloud/static/api.html. Base API : `https://api-x.smsonline.cloud/v3` (trouvée dans le JS du site, la doc ne la donne pas).
- Réglages > Connexions, champs 7 (User ID) et 8 (clé API). Les deux remplis = tous les nouveaux numéros viennent de SMSOnline. Bouton « Revenir sur Hero SMS » pour effacer.
- Achat : lookup `/numbers/lookup/{userId}/{pays}/any` (prix + hash m/n du service `ig`), puis `PUT /numbers/{userId}/order`. Code : `GET /numbers/{userId}/order/{orderId}` (champ receivedSMS). Remboursement : `PATCH .../order/{orderId}/refund`. Codes pays identiques à Hero (78 France, 187 USA, 14 HK, 196 Singapour).
- Chaque numéro garde son fournisseur (`prov`), donc un numéro Hero en cours se finit chez Hero.

## Hero SMS (numéros pour créer les comptes)
- Base : `https://hero-sms.com/api/v1`. Auth : header `Authorization: ApiKey <clé>`. Clé dans Réglages > Connexions, champ 6 (secret, jamais dans le repo).
- Achat Hero : avant chaque achat, `heroBestOperator` lit `/stats/deliverability` (24 h, avec opérateurs) et achète chez l'opérateur au meilleur taux de réussite (part ≥ 2 %) ; plus de stock chez lui = n'importe quel opérateur. Équivalent du « highest success rate » de SMSPool, que Hero n'a pas.
- Hero coupe parfois (« fetch failed », 502/503/504, 429) : `heroSend` retente 3 fois, sur hero-sms.com puis hero-sms.io (adresse de secours, mêmes serveurs de noms Cloudflare, validée par Awen le 29 oct. quand le .com a disparu du DNS) ; il garde celle qui répond. Pour un achat, avant chaque nouvel essai on relit les activations : si Hero a créé le numéro malgré la réponse perdue, on le reprend (jamais 2 numéros achetés). Bug réel du 29 oct. : la VA ne recevait aucun numéro.
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

## Proxy UK (test du 30 oct.)
- La VA choisit France ou UK à l'étape 1 de chaque compte (`POST ip/profile`, refusé si un numéro est en cours). L'IP doit venir du bon proxy (sinon création refusée) et être dans le bon pays (FR / GB, sinon étape 1 bloquée).
- Proxy UK saisi case par case dans Réglages (hôte, port, utilisateur, mot de passe), ou en ligne entière.
- Admin : `sms/prices?countries=16` donne les prix UK même en mode France.
- Réglages > « Proxy actif » : France ou Royaume-Uni. Proxy UK, port SOCKS5 UK et lien de rotation UK dans la même carte (proxy en réglage `proxyUk`, lien en secret `rotationUrlUk`).
- En UK : la VA voit le proxy UK à l'étape GeeLark, le bouton IP fait tourner le proxy UK (une fois toutes les 5 min max, `IP_PROFILES.uk.minRotateMin`), et seuls les numéros UK sont proposés (Hero 16, SMSPool 2, SMSOnline 16).
- Chaque compte garde `ipProfile` (fr/uk) pour comparer les résultats du test.
- Le proxy France n'est jamais écrasé : l'état envoie le proxy actif dans `settings.proxy` et le proxy France dans `settings.proxyFr`.

## E-mail d'activation (Hero) — ajouté le 30 oct.
- Pourquoi : les numéros virtuels ne reçoivent le code Instagram/Threads qu'environ 1 fois sur 13 en France (stats Hero). Le code par e-mail arrive presque toujours.
- Étape 3 de « Créer un compte » : 2 onglets, « Avec un e-mail (conseillé) » par défaut, « Avec un numéro » en secours.
- API Hero : `GET /emails/domains?site=instagram.com` (domaines, prix, stock), `POST /emails` {site, domain}, `GET /emails/{id}` (champ `value` = code), `DELETE /emails/{id}` (remboursement). Le CRM essaie jusqu'à 8 domaines : grands webmails d'abord (hotmail, outlook, gmail…), puis le moins cher ; la liste Hero annonce parfois du stock fantôme (« No numbers / mailboxes »), alors on passe au suivant.
- Code lu dans `value` (6 chiffres, espace accepté : « 384 120 »). Un e-mail en cours bloque le changement d'IP comme un numéro.
- Un compte peut être créé avec un e-mail sans numéro (`phone` vide, `emailId` noté). Échec = e-mail remboursé tout seul.
- Réglage `emailSite` (défaut instagram.com) si Hero range Threads sous un autre site.

## Téléphone GeeLark grillé après un échec (30 oct.)
- Instagram répond « Try again later » quand il y a trop d'inscriptions depuis le même téléphone / la même IP. Constat du 30 oct. : l'e-mail donne le code en moins d'1 min (3 fois sur 3), mais les inscriptions sautaient ensuite.
- L'assistant gardait le nom du téléphone GeeLark après un échec (la VA réessayait sur le même). Corrigé : après « Noter et recommencer », tout repart à zéro. Le nom du téléphone est obligatoire à l'étape 2, et un nom déjà utilisé ou grillé (`geelark/burned`) est refusé (navigateur et serveur).
- La fenêtre d'échec explique : supprimer le téléphone, en créer un neuf, et en cas de « Try again later », passer sur l'autre proxy (France/UK).

## Méthode de création qui marche (30 oct., 22 h 37)
- Sandra : compte créé en ouvrant l'appli **Instagram** (pas Threads) dans le téléphone GeeLark, inscription normale avec un **e-mail**, proxy **France**. Ensuite Threads se connecte avec ce compte Instagram.
- Avant ça, s'inscrire directement dans Threads donnait « Try again later » (e-mail) ou aucun SMS (numéros).
- Les textes de l'étape 3 (e-mail) et 4 (compte) du CRM suivent cette méthode.
- Instagram peut demander un numéro en plus de l'e-mail : à l'étape 4, encadré « Instagram demande aussi un numéro ? » (achat sur place), ou onglet Numéro à tout moment. Le numéro s'ajoute au compte en cours (e-mail + numéro notés, les deux fermés à la création).

## « J'ai déjà un compte » (comptes achetés, 30 oct.)
- « Créer un compte », étape 1 : bouton « 🔑 J'ai déjà un compte » (`S.wiz.kind = "have"`, action `wizKind`). Parcours en 4 étapes : 1 IP (pays FR/UK), 2 nouveau téléphone GeeLark + proxy, 3 connexion (identifiant, mot de passe, clé 2FA ; code 2FA en direct `data-totp="__wiz"` lu dans le champ par `totpSecret`, boutons Copier `copyField`), 4 « Tu es connectée ? » puis warm-up comme un compte neuf.
- Serveur : `accounts/create` avec `bought: true` n'exige ni numéro ni e-mail, refuse une clé 2FA non vide invalide, stocke `bought`. Échec : motifs propres aux comptes achetés, `accounts/failed` avec `bought`.
- Tests : API « compte acheté », UI captures 18-19 (dev : `/__dev/acc?pseudo=`, `window.totpCodeForTest`).

## Stock de comptes achetés (30 oct.)
- Réglages (admin) : carte « 📦 Comptes achetés » : fichiers .txt (plusieurs) ou liste collée, `stock/import` (parseBoughtList : « identifiant mdp CLÉ 2FA », pub et en-têtes ignorés, n° de commande gardé, doublons stock + CRM ignorés). Stocké dans `stock/bought` (statuts dispo / pris / utilise / rate).
- VA : stock non vide → « J'ai déjà un compte » par défaut ; en passant à l'étape 3, `stock/take` réserve le premier compte dispo (le même tant qu'il n'est pas fini, retrouvé via `state.stock.mine`) et remplit identifiant, mdp, 2FA. « Rendre au stock » = `stock/release`. Création avec `stockId` → utilisé ; échec → raté (avec le motif).
- Jamais de vrais identifiants dans le dépôt (tests = données factices).

## 2FA des comptes (31 oct.)
- Comptes achetés = 2FA activée. Clé 2FA (TOTP) par compte : champ « Clé 2FA » dans « Modifier / notes » (clé brute avec ou sans espaces, ou lien otpauth://, nettoyée par `cleanTotp`).
- Le code à 6 chiffres est calculé dans le navigateur (RFC 6238, SHA-1, 30 s, vérifié avec le vecteur officiel 287082), mis à jour chaque seconde avec le temps restant.
- Affiché sur la carte du compte (bouton « Code 2FA »), dans l'étape Metricool et le setup (sous Pseudo / Mot de passe), et dans « Modifier ».

## Transfert vers Threads Emmy (31 oct.)
- Réglages (admin) : « Créer un code de transfert » (`transfer/create`) : code `TE-` + 32 caractères, usage unique, 15 min.
- `transfer/pull` (sans session, code obligatoire) renvoie proxy, ports SOCKS5, pays des numéros et les clés (rotation, Hero, SMSOnline, SMSPool) au CRM d'Emmy, de serveur à serveur. Le navigateur ne voit jamais les clés. Code inventé, expiré ou réutilisé = refusé et noté au journal.
