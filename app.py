"""Observatoire du risque d'inondation urbaine — Dakar.

Appli Gradio qui lit le résultat statique des notebooks 00 à 03
(data/processed/score_risque_communes.geojson). Aucun calcul lourd ici.
"""
import json
from pathlib import Path

import gradio as gr
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from explication_ia import expliquer_commune

FICHIER_SCORE = Path(__file__).parent / "data" / "processed" / "score_risque_communes.geojson"

CLASSES = ["Très faible", "Faible", "Moyen", "Élevé", "Très élevé"]
COULEURS = {"Très faible": "#ffffb2", "Faible": "#fecc5c", "Moyen": "#fd8d3c",
            "Élevé": "#f03b20", "Très élevé": "#bd0026"}

# --- Chargement des données (une seule fois au démarrage) -------------------------------

GEOJSON = json.loads(FICHIER_SCORE.read_text(encoding="utf-8"))
COMMUNES = pd.DataFrame([f["properties"] for f in GEOJSON["features"]]).set_index("commune", drop=False)
COMMUNES.index.name = None
FEATURES = {f["properties"]["commune"]: f for f in GEOJSON["features"]}
NB_COMMUNES = len(COMMUNES)


def centre(feature):
    """Centre de l'emprise d'un polygone ou multipolygone GeoJSON (sans shapely)."""
    geom = feature["geometry"]
    polygones = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    points = [pt for poly in polygones for anneau in poly for pt in anneau]
    lons, lats = [p[0] for p in points], [p[1] for p in points]
    return (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2


# --- Données d'une commune (servent à la fiche et, plus tard, au prompt Groq) -----------

def donnees_commune(commune):
    c = COMMUNES.loc[commune]
    return {
        "commune": c["commune"],
        "departement": c["departement"],
        "zone_prioritaire": c["zone_prioritaire"] if isinstance(c["zone_prioritaire"], str) else None,
        "score_risque": float(c["score_risque"]),
        "classe_risque": c["classe_risque"],
        "rang": int(c["rang"]),
        "nb_communes": NB_COMMUNES,
        "altitude_mediane_m": float(c["alt_mediane_m"]),
        "pct_cuvettes": float(c["pct_depression"]),
        "pct_eau_detectee": float(c["pct_eau_stagnante_moyen"]),
        "pct_eau_permanente": float(c["pct_eau_permanente"]),
        "surface_km2": float(c["surface_km2"]),
        "classement_robuste": bool(c["classement_robuste"]),
        "ecart_rang_max": int(c["ecart_rang_max"]),
        "rang_sans_s1": int(c["rang_sans_s1"]),
        "rang_altitude_seule": int(c["rang_altitude_seule"]),
        "alerte_detection_s1": c["alerte_detection_s1"] if isinstance(c["alerte_detection_s1"], str) else "",
    }


def fiche_commune(commune):
    d = donnees_commune(commune)
    zone = f" · zone prioritaire **{d['zone_prioritaire']}**" if d["zone_prioritaire"] else ""
    lignes = [
        f"## {d['commune']}",
        f"Département de {d['departement']}{zone}",
        "",
        f"### Risque {d['classe_risque'].lower()} — score {d['score_risque']:.0f}/100 "
        f"(rang {d['rang']} sur {d['nb_communes']})",
        "",
        "| Indicateur | Valeur |",
        "|---|---|",
        f"| Altitude médiane du sol | {d['altitude_mediane_m']:.1f} m |",
        f"| Surface en cuvette | {d['pct_cuvettes']:.0f} % |",
        f"| Eau stagnante détectée par satellite (moyenne de 3 dates) | {d['pct_eau_detectee']:.2f} % |",
        f"| Eau permanente (lacs, bassins) | {d['pct_eau_permanente']:.1f} % |",
        f"| Surface terrestre | {d['surface_km2']:.1f} km² |",
        "",
    ]
    if not d["classement_robuste"]:
        lignes.append(f"> ⚠️ **Classement incertain** : rang {d['rang']} au score complet, "
                      f"rang {d['rang_sans_s1']} sans le satellite, rang {d['rang_altitude_seule']} "
                      f"avec l'altitude seule. À interpréter avec prudence.")
        lignes.append("")
    if d["alerte_detection_s1"]:
        lignes.append("> 🛰️ **Limite satellite** : aucune eau détectée par le radar Sentinel-1. "
                      "En bâti dense, le radar ne voit pas l'eau entre les maisons : "
                      "cela ne prouve pas l'absence d'inondation.")
    return "\n".join(lignes)


# --- Carte -----------------------------------------------------------------------------

def carte(commune=None):
    df = COMMUNES.reset_index(drop=True)
    fig = px.choropleth_map(
        df, geojson=GEOJSON, locations="osm_id", featureidkey="properties.osm_id",
        color="classe_risque", category_orders={"classe_risque": CLASSES[::-1]},
        color_discrete_map=COULEURS, opacity=0.75, hover_name="commune",
        hover_data={"osm_id": False, "classe_risque": True, "score_risque": ":.0f", "rang": True},
        labels={"classe_risque": "Risque", "score_risque": "Score /100", "rang": "Rang"},
        map_style="carto-positron", center={"lat": 14.76, "lon": -17.33}, zoom=9.4,
    )
    if commune:
        f = FEATURES[commune]
        fig.add_trace(go.Choroplethmap(
            geojson={"type": "FeatureCollection", "features": [f]},
            locations=[f["properties"]["osm_id"]], featureidkey="properties.osm_id", z=[1],
            colorscale=[[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0)"]], showscale=False,
            marker_line_color="#1f2937", marker_line_width=4, hoverinfo="skip", name=commune))
        lat, lon = centre(f)
        fig.update_layout(map_center={"lat": lat, "lon": lon}, map_zoom=11.5)
    fig.update_layout(margin=dict(l=0, r=0, t=0, b=0), height=560,
                      legend=dict(title="Risque relatif", yanchor="top", y=0.98, xanchor="left", x=0.01,
                                  bgcolor="rgba(255,255,255,0.85)"))
    return fig


# --- Explication par IA générative (Groq), avec réponse de secours ------------------------

def expliquer(commune):
    texte, _source = expliquer_commune(donnees_commune(commune))
    return texte


def selectionner(commune):
    return carte(commune), fiche_commune(commune), ""


# --- Interface ---------------------------------------------------------------------------

CHOIX = [(f"{c}  (rang {int(r)})", c) for c, r in COMMUNES.sort_values("commune")["rang"].items()]
DEFAUT = "Pikine Ouest"

A_PROPOS = """
**Ce que mesure le score.** Un classement *relatif* des 53 communes de la région de Dakar selon leur exposition physique au risque d'inondation. Il combine, à poids égaux, trois indicateurs normalisés (z-scores) :
- **altitude basse** du sol (Copernicus DEM 30 m) ;
- **part de la surface en cuvette** (zones plus basses que leur voisinage dans un rayon d'environ 1 km) ;
- **eau stagnante détectée par radar** Sentinel-1 après 3 épisodes de fortes pluies (août-septembre 2024 et 2025).

**Ce qu'il ne mesure pas.** Ce n'est pas une probabilité d'inondation. Il manque le drainage, la nappe phréatique, l'imperméabilisation des sols et la population. Le radar ne voit pas l'eau en bâti dense. Seules 13 communes sur 53 ont un classement stable quels que soient les indicateurs retenus.

Sources : OpenStreetMap, Copernicus (Sentinel-1, DEM), CHIRPS (datation des pluies).
"""

with gr.Blocks(title="Risque d'inondation — Dakar") as demo:
    gr.Markdown("# 🌧️ Observatoire du risque d'inondation — Dakar\n"
                "Classement relatif des 53 communes de la région selon leur exposition physique aux inondations.")
    with gr.Row():
        with gr.Column(scale=3):
            carte_plot = gr.Plot(value=carte(DEFAUT), show_label=False)
        with gr.Column(scale=2):
            choix_commune = gr.Dropdown(choices=CHOIX, value=DEFAUT, label="Commune", filterable=True)
            fiche = gr.Markdown(fiche_commune(DEFAUT))
            bouton = gr.Button("🤖 Expliquer ce risque", variant="primary")
            explication = gr.Markdown()
    with gr.Accordion("Méthode et limites", open=False):
        gr.Markdown(A_PROPOS)

    choix_commune.change(selectionner, inputs=choix_commune, outputs=[carte_plot, fiche, explication])
    bouton.click(expliquer, inputs=choix_commune, outputs=explication)

if __name__ == "__main__":
    demo.launch(theme=gr.themes.Soft())
