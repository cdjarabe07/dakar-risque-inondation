# Interface web — Observatoire du risque d'inondation de Dakar

Réécriture de l'appli Gradio (`../app.py`) en site web : React + TypeScript (Vite), carte deck.gl sur fond MapLibre, deux fonctions serveur pour l'IA. Déployé sur Vercel.

## Fonctionnalités

- **Carte 2D / 3D** des 53 communes (hauteur ∝ score), **cliquable** : clic = sélection, clic dans le vide = retour à la vue d'ensemble ; couche « Score de risque » ou « Eau détectée (satellite) » ; rotation automatique en 3D.
- **Liste de recherche** des communes : au clic, la liste complète ; la frappe filtre sans tenir compte des accents ; clavier (flèches, Entrée, Échap).
- **Fiche commune** : indicateurs, badge de confiance (explication au survol), avertissements « Attention ».
- **IA (Groq, `openai/gpt-oss-120b`)** : bouton « Expliquer ce risque » et chat sur la commune sélectionnée ; hors sujet refusé ; coupure à 5 s et **réponse pré-rédigée** si l'IA ne répond pas (même si le serveur est injoignable).
- **Comparaison** de 2 ou 3 communes : synthèse automatique, tableau, barres groupées sur une échelle commune 0-100.

Les calculs et les textes (confiance, synthèse, prompts de l'IA, réponses de secours) sont **identiques à l'appli Gradio** : des tests exécutent le code Python et comparent les résultats.

## Lancer en local

```bash
cd web
npm install
npm run dev        # http://localhost:5173 (avec l'IA si GROQ_API_KEY est définie dans le terminal)
npm test           # tests unitaires et de parité avec app.py
npm run build      # version de production dans web/dist
```

En local, les fonctions `api/` sont servies par le serveur de développement (relais dans `vite.config.ts`).

## Déploiement sur Vercel

1. Importer le dépôt GitHub sur https://vercel.com/new, **Root Directory : `web`** (preset Vite), laisser activée « Include files outside the root directory in the Build Step » (les données sont lues dans `../data/processed`).
2. **Settings → Environment Variables** : ajouter `GROQ_API_KEY` (clé gratuite sur https://console.groq.com/keys), puis redéployer. Sans clé, l'IA affiche les réponses pré-rédigées.
3. Chaque `git push` sur `main` redéploie automatiquement.

**Protection du quota Groq** : 10 questions par minute et par visiteur (compteur en mémoire de chaque instance de fonction : protection « au mieux », pas une garantie stricte).

## Organisation

```
api/expliquer.ts, api/chat.ts   fonctions Vercel (POST) ; la clé Groq ne quitte jamais le serveur
src/lib/risque.ts                types, palette du risque, chargement des données
src/lib/fiabilite.ts             niveau de confiance, classes de la couche eau, recherche sans accents
src/lib/comparaison.ts           échelle 0-100, couleurs stables, tableau et synthèse de comparaison
src/lib/ia.ts                    prompts et réponses de secours (portage de explication_ia.py)
src/lib/serveur-ia.ts            appel Groq (coupure 5 s), validation, limite par visiteur
src/lib/client-ia.ts             appels depuis le navigateur + secours local si le serveur est injoignable
src/components/                  Carte, Legende, SelecteurCommune, Fiche, BadgeConfiance, Explication, Chat,
                                 Comparaison, GraphiqueComparaison, Markdown
scripts/preparer-donnees.mjs     ../data/processed → public/data/communes.geojson (avant dev et build)
```
