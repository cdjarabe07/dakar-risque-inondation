"""Observatoire du risque d'inondation urbaine — Dakar.

Appli Gradio qui lit le résultat statique des notebooks 00 à 03
(data/processed/score_risque_communes.geojson). Aucun calcul lourd ici.
"""
import html
import json
from pathlib import Path

import gradio as gr
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import pydeck as pdk

from explication_ia import expliquer_commune, repondre_question_libre

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

# Rang de chaque commune sur chaque indicateur (1 = la plus exposée), pour que l'IA n'ait pas
# à interpréter elle-même si une valeur brute est « haute » ou « basse »
RANG_ALTITUDE = COMMUNES["alt_mediane_m"].rank(method="min").astype(int)                  # 1 = la plus basse
RANG_CUVETTES = COMMUNES["pct_depression"].rank(ascending=False, method="min").astype(int)
RANG_EAU = COMMUNES["pct_eau_stagnante_moyen"].rank(ascending=False, method="min").astype(int)


def _arrondir(coords, decimales=5):
    """Arrondit des coordonnées GeoJSON imbriquées (5 décimales ≈ 1 m) pour alléger la carte 3D."""
    if isinstance(coords[0], (int, float)):
        return [round(c, decimales) for c in coords]
    return [_arrondir(c, decimales) for c in coords]


def _rgba(hexa, alpha):
    return [int(hexa[i:i + 2], 16) for i in (1, 3, 5)] + [alpha]


# GeoJSON allégé pour la 3D : coordonnées arrondies, seulement les champs utiles.
# Les champs sont dupliqués au niveau de l'entité ET dans "properties" : l'infobulle de pydeck
# les trouve ainsi quelle que soit sa façon de lire l'objet survolé.
FEATURES_3D = {}
for _f in GEOJSON["features"]:
    _p = _f["properties"]
    _champs = {"commune": _p["commune"], "classe_risque": _p["classe_risque"],
               "score": round(_p["score_risque"]), "rang": _p["rang"],
               "hauteur": max(_p["score_risque"], 1.0)}   # hauteur min. 1 pour que le score 0 reste visible
    FEATURES_3D[_p["commune"]] = {"type": "Feature", **_champs, "properties": _champs,
                                  "geometry": {"type": _f["geometry"]["type"],
                                               "coordinates": _arrondir(_f["geometry"]["coordinates"])}}


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
        "rang_ind_altitude": int(RANG_ALTITUDE[commune]),
        "rang_ind_cuvettes": int(RANG_CUVETTES[commune]),
        "rang_ind_eau": int(RANG_EAU[commune]),
        "alerte_detection_s1": c["alerte_detection_s1"] if isinstance(c["alerte_detection_s1"], str) else "",
    }


# --- Niveau de confiance ------------------------------------------------------------------

# Palette « statut » (vert / ambre / rouge), distincte de l'échelle jaune → rouge du risque :
# la pastille porte toujours un symbole et le mot « Confiance », jamais la couleur seule.
CONFIANCE = {"Haute": ("#0ca30c", "✓", "🟢"), "Moyenne": ("#fab219", "!", "🟠"), "Faible": ("#d03b3b", "✕", "🔴")}


def niveau_confiance(commune):
    """'Haute', 'Moyenne' ou 'Faible' selon les deux drapeaux de fiabilité.

    commune : nom de la commune ou dictionnaire donnees_commune(nom).
    Haute   : classement robuste ET eau détectable par satellite
    Moyenne : un seul des deux problèmes
    Faible  : classement non robuste ET aucune eau détectée par satellite
    """
    d = donnees_commune(commune) if isinstance(commune, str) else commune
    problemes = (not d["classement_robuste"]) + bool(d["alerte_detection_s1"])
    return ["Haute", "Moyenne", "Faible"][problemes]


def explication_confiance(commune):
    """Une phrase qui justifie le niveau (texte du survol)."""
    d = donnees_commune(commune) if isinstance(commune, str) else commune
    niveau = niveau_confiance(d)
    instable = (f"classement sensible aux indicateurs utilisés (rang {d['rang']} au score complet, "
                f"{d['rang_altitude_seule']} avec l'altitude seule)")
    radar = "aucune eau détectée par satellite, ce qui peut refléter la limite du radar en bâti dense"
    if niveau == "Haute":
        return "Confiance haute : classement stable quels que soient les indicateurs, et eau visible par le satellite."
    if niveau == "Faible":
        return f"Confiance faible : {instable}, et {radar}."
    return f"Confiance moyenne : {instable}." if not d["classement_robuste"] else \
        f"Confiance moyenne : classement stable, mais {radar}."


def badge_confiance(commune):
    """Pastille HTML colorée avec explication au survol (attribut title)."""
    niveau = niveau_confiance(commune)
    couleur, symbole, _ = CONFIANCE[niveau]
    return (f'<span title="{html.escape(explication_confiance(commune), quote=True)}" '
            f'style="display:inline-block;padding:2px 10px;border-radius:999px;background:{couleur};'
            f'color:#0b0b0b;font-weight:600;font-size:0.85em;cursor:help;vertical-align:middle;">'
            f'{symbole} Confiance {niveau.lower()}</span>')


def fiche_commune(commune):
    d = donnees_commune(commune)
    zone = f" · zone prioritaire **{d['zone_prioritaire']}**" if d["zone_prioritaire"] else ""
    lignes = [
        f"## {d['commune']}",
        f"Département de {d['departement']}{zone}",
        "",
        f"### Risque {d['classe_risque'].lower()} — score {d['score_risque']:.0f}/100 "
        f"(rang {d['rang']} sur {d['nb_communes']}) {badge_confiance(d)}",
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


ECHELLE_HAUTEUR = 12   # score 100 → 1 200 m d'extrusion : relief lisible sans murs qui cachent les voisins


def _collection(noms, alpha):
    features = []
    for nom in noms:
        f = dict(FEATURES_3D[nom])
        couleur = _rgba(COULEURS[f["classe_risque"]], alpha)
        f["properties"] = {**f["properties"], "couleur": couleur}
        f["couleur"] = couleur
        features.append(f)
    return {"type": "FeatureCollection", "features": features}


def carte_3d(commune=None):
    """Carte 3D pydeck : hauteur = score de risque, couleur = classe (même palette que la 2D).

    Rendue dans un iframe (srcdoc) : gr.HTML n'exécute pas les <script> insérés directement,
    alors qu'un iframe charge la page pydeck complète et isolée.
    """
    autres = [n for n in FEATURES_3D if n != commune]
    commun = dict(extruded=True, get_elevation="properties.hauteur", elevation_scale=ECHELLE_HAUTEUR,
                  get_fill_color="properties.couleur", pickable=True, auto_highlight=True,
                  highlight_color=[255, 255, 255, 90])
    # Les autres communes sont atténuées quand une commune est sélectionnée, pour la faire ressortir
    couches = [pdk.Layer("GeoJsonLayer", _collection(autres, 140 if commune else 235), id="communes", **commun)]
    if commune:
        # Commune sélectionnée : couleur pleine et arêtes noires
        couches.append(pdk.Layer("GeoJsonLayer", _collection([commune], 255), id="selection",
                                 wireframe=True, get_line_color=[20, 20, 20, 255], line_width_min_pixels=2,
                                 **commun))
        lat, lon = centre(FEATURES[commune])
        vue = pdk.ViewState(latitude=lat, longitude=lon, zoom=11.8, pitch=45, bearing=-10)
    else:
        vue = pdk.ViewState(latitude=14.72, longitude=-17.33, zoom=9.7, pitch=40, bearing=-10)
    deck = pdk.Deck(
        layers=couches, initial_view_state=vue, map_provider="carto", map_style="light",
        tooltip={"html": "<b>{commune}</b><br/>Risque : {classe_risque}<br/>Score : {score}/100 · rang {rang}/53",
                 "style": {"fontSize": "13px", "backgroundColor": "#1f2937", "color": "white"}},
    )
    page = deck.to_html(as_string=True, notebook_display=False)
    # pydeck insère sa configuration en JSON indenté (≈ 540 Ko) : la version compacte fait ≈ 150 Ko
    config = deck.to_json()
    page = page.replace(config, json.dumps(json.loads(config), separators=(",", ":"), ensure_ascii=False))
    legende = "".join(
        f'<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">'
        f'<span style="width:14px;height:14px;border-radius:3px;background:{COULEURS[c]};'
        f'border:1px solid #999;display:inline-block;"></span>{c}</span>'
        for c in CLASSES[::-1])
    return (f'<iframe srcdoc="{html.escape(page, quote=True)}" title="Carte 3D du risque" '
            f'style="width:100%;height:560px;border:0;border-radius:8px;"></iframe>'
            f'<div style="font-size:13px;margin-top:6px;">Risque relatif : {legende}'
            f'<br/><span style="opacity:0.75;">Hauteur ∝ score (0-100). Glisser pour déplacer, '
            f'Ctrl + glisser (ou clic droit) pour pivoter, molette pour zoomer.</span></div>')


# --- Explication par IA générative (Groq), avec réponse de secours ------------------------

def expliquer(commune):
    texte, _source = expliquer_commune(donnees_commune(commune))
    return texte


def chat_vide(commune):
    """Chat remis à zéro pour la commune sélectionnée."""
    return gr.Chatbot(value=[], label=f"💬 Questions sur {commune}")


MODES_CARTE = ["Carte 3D", "Carte 2D"]


def cartes(commune, mode):
    """Affiche la carte du mode choisi et masque l'autre. Seule la carte visible est recalculée ;
    la 3D est régénérée à chaque affichage, ce qui l'initialise à la bonne taille."""
    if mode == "Carte 2D":
        return gr.Plot(value=carte(commune), visible=True), gr.HTML(visible=False)
    return gr.Plot(visible=False), gr.HTML(value=carte_3d(commune), visible=True)


def selectionner(commune, mode):
    # Changer de commune réinitialise l'explication, le chat et la zone de saisie
    return (*cartes(commune, mode), fiche_commune(commune), "", chat_vide(commune), "")


# --- Chat : questions libres sur la commune sélectionnée ---------------------------------

def ajouter_question(question, historique):
    """Étape 1 : affiche tout de suite la question dans le chat et vide la zone de saisie."""
    question = (question or "").strip()
    if not question:
        return historique, ""
    return (historique or []) + [{"role": "user", "content": question}], ""


def repondre(historique, commune):
    """Étape 2 : génère la réponse (5 s maximum, réponse de secours sinon)."""
    if not historique or historique[-1]["role"] != "user":
        return historique
    texte, _source = repondre_question_libre(donnees_commune(commune), historique[-1]["content"], historique[:-1])
    return historique + [{"role": "assistant", "content": texte}]


# --- Comparaison de 2 ou 3 communes --------------------------------------------------------

# Couleurs d'identité des communes comparées (palette catégorielle validée : daltonisme OK,
# contraste du 3e slot < 3:1 compensé par la légende, les valeurs écrites et le tableau).
# Volontairement différentes de la palette jaune → rouge du risque, réservée aux cartes.
COULEURS_COMPARAISON = ["#2a78d6", "#eb6834", "#1baf7a"]
SURFACE_GRAPHIQUE, TEXTE_1, TEXTE_2, GRILLE = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e0"
MAX_COMPARAISON = 3


def _percentile_exposition(exposition):
    """0 = la moins exposée des 53 communes, 100 = la plus exposée (part des communes moins exposées).
    Les ex aequo en bas (ex. 0 % d'eau détectée) restent à 0 au lieu d'hériter d'un rang moyen."""
    return exposition.apply(lambda v: 100 * (exposition < v).sum() / (len(exposition) - 1))


PCT_ALTITUDE = _percentile_exposition(-COMMUNES["alt_mediane_m"])   # sol bas = plus exposé
PCT_CUVETTES = _percentile_exposition(COMMUNES["pct_depression"])
PCT_EAU = _percentile_exposition(COMMUNES["pct_eau_stagnante_moyen"])


def attribuer_couleurs(selection, couleurs):
    """La couleur suit la commune, pas sa position : retirer une commune ne repeint pas les autres."""
    couleurs = {c: i for c, i in (couleurs or {}).items() if c in selection}
    for c in selection:
        if c not in couleurs:
            couleurs[c] = min(set(range(MAX_COMPARAISON)) - set(couleurs.values()))
    return couleurs


def _avertissements(d):
    alertes = []
    if not d["classement_robuste"]:
        alertes.append(f"⚠️ classement incertain (rang {d['rang']} au score complet, "
                       f"{d['rang_altitude_seule']} avec l'altitude seule)")
    if d["alerte_detection_s1"]:
        alertes.append("🛰️ aucune eau détectée par satellite : limite du radar en bâti dense, "
                       "pas une preuve d'absence d'inondation")
    return alertes


def tableau_comparaison(donnees):
    """Communes en colonnes, indicateurs en lignes."""
    lignes = {
        "Niveau de confiance": [explication_confiance(d) for d in donnees],
        "Classe de risque": [d["classe_risque"] for d in donnees],
        "Score de risque (0-100)": [f"{d['score_risque']:.0f}" for d in donnees],
        "Rang (1 = le plus exposé)": [f"{d['rang']} / {d['nb_communes']}" for d in donnees],
        "Altitude médiane du sol": [f"{d['altitude_mediane_m']:.1f} m" for d in donnees],
        "Surface en cuvette": [f"{d['pct_cuvettes']:.0f} %" for d in donnees],
        "Eau stagnante détectée (satellite)": [f"{d['pct_eau_detectee']:.2f} %" for d in donnees],
        "Eau permanente": [f"{d['pct_eau_permanente']:.1f} %" for d in donnees],
        "Surface terrestre": [f"{d['surface_km2']:.1f} km²" for d in donnees],
        "Fiabilité du classement": [
            "✅ stable" if d["classement_robuste"]
            else f"⚠️ incertain (rang {d['rang']} → {d['rang_altitude_seule']} selon les indicateurs)"
            for d in donnees],
        "Détection satellite": [
            "⚠️ aucune eau détectée (limite radar en bâti dense)" if d["alerte_detection_s1"] else "✅ eau détectée"
            for d in donnees],
    }
    # Les en-têtes de gr.Dataframe sont du texte brut : rond coloré + niveau écrit (pas d'infobulle possible,
    # l'explication est dans la ligne « Niveau de confiance » et dans les pastilles au-dessus du tableau)
    entetes = [f"{d['commune']} {CONFIANCE[niveau_confiance(d)][2]} {niveau_confiance(d).lower()}" for d in donnees]
    return pd.DataFrame([[indic, *vals] for indic, vals in lignes.items()], columns=["Indicateur", *entetes])


def graphique_comparaison(donnees, couleurs):
    """Barres groupées sur une échelle commune 0-100 (0 = la moins exposée des 53 communes)."""
    indicateurs = ["Score<br>de risque", "Altitude<br>basse", "Surface<br>en cuvette", "Eau détectée<br>(satellite)"]
    fig = go.Figure()
    for d in donnees:
        c = d["commune"]
        valeurs = [d["score_risque"], PCT_ALTITUDE[c], PCT_CUVETTES[c], PCT_EAU[c]]
        brutes = [f"score {d['score_risque']:.0f}/100, rang {d['rang']}/{d['nb_communes']}",
                  f"altitude médiane {d['altitude_mediane_m']:.1f} m",
                  f"{d['pct_cuvettes']:.0f} % de la surface en cuvette",
                  f"{d['pct_eau_detectee']:.2f} % de la surface en eau"]
        # Le ⚠ marque les valeurs à lire avec prudence (score incertain, eau non détectable en bâti dense)
        textes = [f"{v:.0f}" + (" ⚠" if (i == 0 and not d["classement_robuste"])
                                or (i == 3 and d["alerte_detection_s1"]) else "")
                  for i, v in enumerate(valeurs)]
        fig.add_trace(go.Bar(
            name=c + (" ⚠️" if _avertissements(d) else ""), x=indicateurs, y=valeurs,
            marker=dict(color=COULEURS_COMPARAISON[couleurs[c]], line=dict(color=SURFACE_GRAPHIQUE, width=2)),
            text=textes, textposition="outside", textfont=dict(color=TEXTE_1, size=12), cliponaxis=False,
            customdata=brutes,
            hovertemplate=f"<b>{c}</b><br>%{{y:.0f}}/100 — %{{customdata}}<extra></extra>"))
    fig.update_layout(
        barmode="group", bargap=0.28, bargroupgap=0.06, barcornerradius=4, height=380,
        paper_bgcolor=SURFACE_GRAPHIQUE, plot_bgcolor=SURFACE_GRAPHIQUE,
        font=dict(color=TEXTE_2, size=12), margin=dict(l=10, r=10, t=40, b=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0, font=dict(color=TEXTE_1, size=13)),
        yaxis=dict(range=[0, 115], title="Exposition relative (0-100)",
                   gridcolor=GRILLE, zeroline=True, zerolinecolor="#b5b3ab", tickvals=[0, 25, 50, 75, 100]),
        xaxis=dict(tickfont=dict(color=TEXTE_1, size=12)),
        hoverlabel=dict(bgcolor="white", font_color=TEXTE_1),
    )
    return fig


def _enumerer(noms):
    """« A », « A et B », « A, B et C »."""
    return noms[0] if len(noms) == 1 else ", ".join(noms[:-1]) + " et " + noms[-1]


NOMS_INDICATEURS = {"altitude": "l'altitude du sol", "cuvettes": "la part de surface en cuvette",
                    "eau": "l'eau détectée par satellite"}


def synthese_comparaison(donnees):
    """Phrase de synthèse conditionnelle (sans IA)."""
    tri = sorted(donnees, key=lambda d: d["score_risque"], reverse=True)
    n = len(tri)
    premier, suivants = tri[0], tri[1:]
    phrase = (f"**{n} communes comparées** : **{premier['commune']}** a le score le plus élevé "
              f"({premier['score_risque']:.0f}/100, rang {premier['rang']}), suivie de "
              + " puis de ".join(f"**{d['commune']}** ({d['score_risque']:.0f}/100, rang {d['rang']})"
                                 for d in suivants) + ".")
    parties = [phrase]

    ecart = premier["score_risque"] - tri[1]["score_risque"]
    if ecart < 10:
        parties.append(f"L'écart entre {premier['commune']} et {tri[1]['commune']} n'est que de {ecart:.0f} points : "
                       "à ce niveau de précision, leur exposition est à considérer comme proche.")

    # Indicateur qui sépare le plus la commune la plus exposée de la moins exposée
    dernier = tri[-1]
    ecarts = {"altitude": PCT_ALTITUDE[premier["commune"]] - PCT_ALTITUDE[dernier["commune"]],
              "cuvettes": PCT_CUVETTES[premier["commune"]] - PCT_CUVETTES[dernier["commune"]],
              "eau": PCT_EAU[premier["commune"]] - PCT_EAU[dernier["commune"]]}
    cle = max(ecarts, key=ecarts.get)
    if ecarts[cle] > 15:
        valeur = {"altitude": lambda d: f"{d['altitude_mediane_m']:.1f} m",
                  "cuvettes": lambda d: f"{d['pct_cuvettes']:.0f} %",
                  "eau": lambda d: f"{d['pct_eau_detectee']:.2f} %"}[cle]
        parties.append(f"La différence entre {premier['commune']} et {dernier['commune']} tient surtout à "
                       f"{NOMS_INDICATEURS[cle]} ({valeur(premier)} contre {valeur(dernier)}).")
    contraires = [k for k, v in ecarts.items() if v < -15]
    if contraires:
        parties.append(f"À l'inverse, {dernier['commune']} est plus exposée sur "
                       + _enumerer([NOMS_INDICATEURS[k] for k in contraires]) + ".")

    incertains = [d["commune"] for d in tri if not d["classement_robuste"]]
    radar = [d["commune"] for d in tri if d["alerte_detection_s1"]]
    if incertains or radar:
        prudence = []
        if incertains:
            prudence.append(("le classement de " if len(incertains) == 1 else "les classements de ")
                            + _enumerer(incertains) + (" est incertain" if len(incertains) == 1 else " sont incertains"))
        if radar:
            prudence.append("aucune eau n'a été détectée par satellite à " + _enumerer(radar)
                            + ", ce qui peut refléter la limite du radar en bâti dense")
        parties.append("⚠️ **Prudence** : " + " ; ".join(prudence) + ".")
    else:
        parties.append("✅ Les classements de ces communes sont stables selon les indicateurs retenus.")
    return " ".join(parties)


def comparer(selection, couleurs):
    """Renvoie (texte, tableau, graphique, couleurs) pour 2 ou 3 communes."""
    selection = list(selection or [])[:MAX_COMPARAISON]
    couleurs = attribuer_couleurs(selection, couleurs)
    if len(selection) < 2:
        return ("*Sélectionnez au moins 2 communes (3 au maximum) pour les comparer.*",
                pd.DataFrame(columns=["Indicateur"]), None, couleurs)
    donnees = [donnees_commune(c) for c in selection]
    avertissements = []
    for d in donnees:
        for a in _avertissements(d):
            avertissements.append(f"- **{d['commune']}** : {a}")
    texte = synthese_comparaison(donnees)
    texte += "\n\n" + " &nbsp; ".join(f"**{d['commune']}** {badge_confiance(d)}" for d in donnees)
    if avertissements:
        texte += "\n\n**Avertissements par commune**\n" + "\n".join(avertissements)
    return texte, tableau_comparaison(donnees), graphique_comparaison(donnees, couleurs), couleurs


# --- Interface ---------------------------------------------------------------------------

CHOIX =[(f"{c}  (rang {int(r)})", c) for c, r in COMMUNES.sort_values("commune")["rang"].items()]
DEFAUT = "Pikine Ouest"
COMPARAISON_DEFAUT = ["Pikine Ouest", "Thiaroye-sur-Mer"]   # rang 1 vs classement incertain : bon exemple

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
            mode_carte = gr.Radio(MODES_CARTE, value=MODES_CARTE[0], show_label=False,
                                  info="3D : la hauteur de chaque commune est proportionnelle à son score de risque. "
                                       "Survolez une commune pour voir son score ; choisissez-la dans la liste pour le détail.")
            carte_plot = gr.Plot(value=carte(DEFAUT), show_label=False, visible=False)
            carte_html = gr.HTML(value=carte_3d(DEFAUT))
        with gr.Column(scale=2):
            choix_commune = gr.Dropdown(choices=CHOIX, value=DEFAUT, label="Commune", filterable=True)
            fiche = gr.Markdown(fiche_commune(DEFAUT))
            bouton = gr.Button("🤖 Expliquer ce risque", variant="primary")
            explication = gr.Markdown()
            chat = gr.Chatbot(value=[], label=f"💬 Questions sur {DEFAUT}", height=380, buttons=["copy"],
                              placeholder="Posez une question sur la commune sélectionnée : l'assistant "
                                          "répond à partir des seules données de l'observatoire.")
            question = gr.Textbox(show_label=False, placeholder="Ex. : Pourquoi ce classement ?",
                                  submit_btn="Envoyer", max_length=500)
            gr.Examples(examples=["Pourquoi ce classement ?",
                                  "Quelles sont les limites des données ?",
                                  "Que faire chez moi en cas de forte pluie ?"],
                        inputs=question, label="Exemples de questions")
    gr.Markdown("## ⚖️ Comparer des communes")
    _texte0, _tableau0, _graph0, _couleurs0 = comparer(COMPARAISON_DEFAUT, {})
    couleurs_comparaison = gr.State(_couleurs0)
    comp_selection = gr.Dropdown(choices=CHOIX, value=COMPARAISON_DEFAUT, multiselect=True,
                                 max_choices=MAX_COMPARAISON, filterable=True,
                                 label="Choisissez 2 ou 3 communes")
    comp_texte = gr.Markdown(_texte0)
    # Tableau et graphique empilés sur toute la largeur : côte à côte, 3 communes ne tenaient pas
    comp_tableau = gr.Dataframe(value=_tableau0, interactive=False, wrap=True, show_label=False,
                                pinned_columns=1)
    comp_graphique = gr.Plot(value=_graph0, show_label=False)
    gr.Markdown("<sub>Échelle commune 0-100 : 0 = la commune la moins exposée des 53 sur cet indicateur, "
                "100 = la plus exposée (score de risque, altitude basse, part en cuvette, eau détectée). "
                "⚠ = valeur à lire avec prudence (classement incertain ou eau non détectable en bâti dense). "
                "Survolez une barre pour la valeur brute.</sub>")
    with gr.Accordion("Méthode et limites", open=False):
        gr.Markdown(A_PROPOS)

    comp_selection.change(comparer, inputs=[comp_selection, couleurs_comparaison],
                          outputs=[comp_texte, comp_tableau, comp_graphique, couleurs_comparaison])
    choix_commune.change(selectionner, inputs=[choix_commune, mode_carte],
                         outputs=[carte_plot, carte_html, fiche, explication, chat, question])
    mode_carte.change(cartes, inputs=[choix_commune, mode_carte], outputs=[carte_plot, carte_html])
    bouton.click(expliquer, inputs=choix_commune, outputs=explication)
    question.submit(ajouter_question, inputs=[question, chat], outputs=[chat, question]) \
            .then(repondre, inputs=[chat, choix_commune], outputs=chat)

if __name__ == "__main__":
    demo.launch(theme=gr.themes.Soft())
