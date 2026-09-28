# Interface web — Observatoire du risque d'inondation de Dakar

Réécriture de l'appli Gradio (`../app.py`) en interface web statique : React + TypeScript (Vite), carte deck.gl sur fond MapLibre. Déployable sur Vercel.

État : **étape 1/4** — carte 2D/3D des 53 communes, cliquable (clic = sélection, clic dans le vide = désélection), infobulle au survol, résumé de la commune sélectionnée. À venir : fiche et badge de confiance (2), explication et chat IA (3), comparaison (4).

## Lancer en local

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires (vitest)
npm run build      # version de production dans web/dist
npm run preview    # sert web/dist sur http://localhost:4173
```

## Données

`scripts/preparer-donnees.mjs` lit le résultat des notebooks, `../data/processed/score_risque_communes.geojson` (source unique), et écrit une version allégée dans `public/data/communes.geojson` (non versionnée). Il est lancé automatiquement avant `dev` et `build`.

## Déploiement sur Vercel

1. Sur https://vercel.com/new, importer le dépôt GitHub `cdjarabe07/dakar-risque-inondation`.
2. **Root Directory : `web`** (Framework détecté : Vite ; commandes par défaut).
3. Laisser activée l'option « Include files outside the root directory in the Build Step » (le script de données lit `../data/processed`).
4. Deploy. Chaque `git push` redéploie ensuite automatiquement.

## Organisation

```
src/lib/risque.ts          types, palette du risque (identique à app.py, vérifié par test), utilitaires
src/components/Carte.tsx    carte MapLibre + couche deck.gl (MapboxOverlay), clic, survol, 2D/3D
src/components/Legende.tsx  légende des classes de risque
src/App.tsx                 mise en page et état (commune sélectionnée, mode 2D/3D)
```
