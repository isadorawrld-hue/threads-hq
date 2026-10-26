# Threads HQ : le CRM de la VA

Site + API pour gérer la VA qui crée, warm up, setup et surveille les comptes Threads,
avec la planification Metricool et la rotation d'IP intégrées.

## Comment ça marche
- `public/` : l'interface (HTML/CSS/JS, sans build).
- `lib/core.mjs` : toute la logique (routes `/api/*`).
- `netlify/functions/api.mjs` : branche la logique sur Netlify (stockage = Netlify Blobs).
- `public/seed-textes.json` : les 42 textes de départ (bouton d'import dans Contenu).

Les secrets (token Metricool, lien de rotation) ne sont **jamais** dans le code :
ils se collent dans l'onglet ⚙️ Réglages du site et restent côté serveur.

## Modifier le site
1. Modifie un fichier sur GitHub (crayon ✏️) ou en local.
2. Commit sur `main`.
3. Netlify redéploie tout seul en ~30 secondes.

## Tester en local
```bash
npm install
node dev/server.mjs        # http://localhost:8788 (faux Metricool + faux proxy)
node dev/test-api.mjs      # test de toute l'API (serveur neuf)
node dev/test-ui.mjs       # parcours complet dans un navigateur (serveur neuf)
```

## Accès
- Premier code tapé sur un site neuf = admin.
- Ensuite : ⚙️ Réglages → 👥 Accès pour ajouter Bilot (admin) et la VA (VA).
