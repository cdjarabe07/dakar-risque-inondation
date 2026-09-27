# Observatoire du risque d'inondation urbaine — Dakar

Chantier 1 du projet « Dakar ville intelligente » : une carte du risque d'inondation par commune d'arrondissement de la région de Dakar. Les zones prioritaires sont Pikine, Guédiawaye, Médina, Yeumbeul et Grand Yoff.

## Installation

Deux jeux de dépendances :

| Fichier | Usage |
|---|---|
| `requirements.txt` | **l'appli seule** (gradio, plotly, pandas, groq), environ 4 minutes d'installation |
| `requirements-analyse.txt` | les notebooks 00 à 03 (géospatial, Sentinel Hub) et l'appli |

Pour travailler sur les notebooks (Python 3.13) :

```
python -m pip install -r requirements-analyse.txt
python -m notebook
```

Ouvre les notebooks depuis ce Python-là, pas depuis Anaconda.

## Appli (Gradio + IA générative Groq)

`app.py` lit uniquement `data/processed/score_risque_communes.geojson` : aucun calcul lourd n'est fait au lancement. Le bouton « Expliquer ce risque » appelle l'API Groq (modèle `openai/gpt-oss-120b`, code dans `explication_ia.py`). Si l'appel échoue ou dépasse 5 s, une réponse pré-rédigée par classe de risque s'affiche. Les tests sont dans `python tests/test_secours.py`.

La clé est lue dans la variable d'environnement `GROQ_API_KEY` (clé gratuite sur https://console.groq.com/keys). **Ne jamais l'écrire dans le code.** Sans clé, l'appli fonctionne quand même et affiche la réponse pré-rédigée.

```
python -m pip install -r requirements.txt
setx GROQ_API_KEY "votre_clé"     # Windows, puis rouvrir le terminal (Linux/macOS : export GROQ_API_KEY=...)
python app.py                     # puis ouvrir http://127.0.0.1:7860
```

`data/raw/` (≈ 200 Mo d'images radar et de DEM) n'est pas versionné : les notebooks 00 à 02 le retéléchargent. Les résultats nécessaires à l'appli sont dans `data/processed/`, qui est versionné.

## Ordre d'exécution

| # | Notebook | Produit | Compte requis |
|---|---|---|---|
| 00 | `notebooks/00_collecte_quartiers.ipynb` | `data/processed/communes_dakar_terre.geojson` | non |
| 01 | `notebooks/01_collecte_precipitations.ipynb` | `data/processed/pluie_journaliere_dakar.csv`, `episodes_fortes_pluies.csv` | non (CHIRPS) |
| 02 | `notebooks/02_collecte_satellite_topo.ipynb` | `data/processed/score_eau_satellite.csv`, `topo_communes.csv` | oui : profil sentinelhub `cdse` (client OAuth créé sur https://shapps.dataspace.copernicus.eu/dashboard/) |
| 03 | `notebooks/03_calcul_score_risque.ipynb` | `data/processed/score_risque_communes.csv` et `.geojson` (**fichiers lus par l'appli**) | non |
| 04 | `notebooks/04_visualisation_carte.ipynb` | `outputs/carte_risque.html` | non |

`data/raw/` contient les données brutes, jamais modifiées. `data/processed/` contient les données nettoyées.

## Limites connues des données

Cette section est complétée à chaque étape.

### Contours (OpenStreetMap, notebook 00)
- **L'unité d'analyse est la commune d'arrondissement (53 communes, 0,2 à 70 km²), pas le quartier.** OSM n'a pas de découpage homogène plus fin pour Dakar. Un résultat à l'échelle d'une commune ne dit rien des différences entre ses quartiers.
- Les limites viennent de contributeurs OSM et ne sont pas officielles (ANSD/DTGC). Contrôle fait : ni trou ni chevauchement entre communes.
- Les limites OSM débordent en mer sur la côte nord et au sud de Rufisque (jusqu'à 76 % de la surface pour Cambérène). La partie en mer a été retirée avec le trait de côte OSM, précis à quelques dizaines de mètres.
- Les plans d'eau intérieurs (lacs, Niayes) sont conservés. Il faudra les exclure de la détection d'« eau stagnante ».
- Le département de Keur Massar existe depuis 2021 : Yeumbeul Nord et Sud y sont rattachées, et non plus à Pikine.

### Précipitations (CHIRPS v2.0, notebook 01)
- Résolution de 0,05°, soit environ 5,5 km : un pixel est plus grand que la plupart des communes.
- CHIRPS classe une grande partie de la presqu'île comme de la mer. **13 communes sur 53 n'ont aucun pixel valide, dont 11 communes prioritaires.** CHIRPS sert donc uniquement à **dater** les fortes pluies à l'échelle régionale, pas à comparer les communes.
- Les données de juillet à septembre 2026 sont préliminaires et seront révisées.

### Eau stagnante (Sentinel-1, notebook 02)
- Analyse de 3 dates (22/08/2024, 27/09/2024, 29/08/2025), avec un passage tous les 12 jours. On voit l'eau qui persiste 1 à 5 jours après la pluie, pas le pic.
- **Le bâti dense est quasiment invisible pour la méthode** : l'effet de double rebond entre l'eau et les façades empêche l'eau de ressortir sombre. Pikine, Thiaroye, Guinaw Rail et Médina ressortent à 0 %. **Cela ne signifie pas une absence d'inondation.**
- L'eau détectée est de l'ordre de 0,1 à 0,3 % de la terre ferme, soit quelques hectares par commune au plus. Les écarts entre communes sont faibles et bruités.
- Une bande côtière de 100 m est exclue, à cause de l'artefact du sable mouillé et du ressac.
- Les seuils (-15 à -22 dB, baisse de 3 dB) sont standards mais n'ont pas été validés sur le terrain.

### Topographie (Copernicus DEM 30 m, notebook 02)
- C'est un modèle de **surface** (bâtiments et arbres inclus). L'altitude est surestimée en zone dense, et la pente y reflète surtout les bords des toits.
- La précision verticale est d'environ 2 m : des écarts de 1 à 2 m entre communes ne sont pas significatifs.
- Le sol est approché par une ouverture morphologique de 150 m, qui retire les bâtiments. Les indicateurs « altitude » et « cuvettes » sont calculés sur ce sol approché.

### Score composite (notebook 03)
- Le score est **relatif** : il classe les 53 communes entre elles et n'exprime pas une probabilité. Il combine, à poids égaux, les z-scores de l'altitude basse, des cuvettes et de l'eau Sentinel-1.
- **CHIRPS et la pente sont exclus volontairement** (données manquantes pour la pluie, bâti pour la pente).
- **Robustesse limitée** : seules 13 communes sur 53 gardent un rang stable (écart d'au plus 10 rangs) entre le score complet, le score sans Sentinel-1 et l'altitude seule. Le haut du classement (Pikine Ouest, Malika, Keur Massar Nord) et le bas (plateau Sicap, Mermoz, Ouakam) sont stables. Le milieu dépend des choix de méthode.
- Il manque des facteurs majeurs : drainage, nappe phréatique affleurante, imperméabilisation, population. Le score n'a pas été validé avec des inondations observées.
