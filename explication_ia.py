"""Explication du risque d'une commune par IA générative (API Groq), avec réponse de secours.

La clé est lue dans la variable d'environnement GROQ_API_KEY (secret du Space Hugging Face),
jamais écrite dans le code.
"""
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturTimeout

MODELE = "openai/gpt-oss-120b"
DELAI_MAX_S = 5.0

SYSTEME = """Tu es un expert des risques d'inondation urbaine à Dakar. Tu expliques à des habitants et des élus locaux, en français clair et sans jargon, le résultat d'un observatoire de données.

Règles strictes :
- Utilise UNIQUEMENT les chiffres fournis. N'invente aucun chiffre, aucune date, aucun événement.
- Le score est RELATIF : il compare la commune aux 52 autres communes de la région de Dakar. Ce n'est pas une probabilité d'inondation. Dis-le.
- Si la section FIABILITÉ contient une alerte, tu DOIS consacrer un paragraphe « Fiabilité » qui l'explique simplement, et nuancer tout le texte en conséquence. Ne présente jamais un score incertain comme certain.
- Réponds en Markdown, 200 mots maximum, avec exactement ces trois parties :
  **Ce que dit le score** (2-3 phrases, en citant les indicateurs qui expliquent le classement)
  **Fiabilité** (1-3 phrases)
  **Conseils pratiques** (3 ou 4 puces concrètes, adaptées au niveau de risque : gestes des ménages ET actions pour la commune)"""


def construire_prompt(d):
    alertes = []
    if not d["classement_robuste"]:
        alertes.append(
            f"- CLASSEMENT INCERTAIN : le rang dépend fortement des indicateurs retenus. "
            f"Rang {d['rang']} au score complet, rang {d['rang_sans_s1']} sans le satellite, "
            f"rang {d['rang_altitude_seule']} en ne regardant que l'altitude (sur {d['nb_communes']}). "
            "Cite ces rangs pour expliquer l'incertitude.")
    if d["alerte_detection_s1"]:
        alertes.append(
            "- LIMITE SATELLITE : le radar Sentinel-1 n'a détecté aucune eau stagnante ici. "
            "En bâti dense, le radar ne voit pas l'eau entre les maisons : cela ne prouve PAS "
            "l'absence d'inondation, et peut faire baisser le score à tort.")
    fiabilite = "\n".join(alertes) if alertes else (
        "- Aucune alerte : le classement est stable quels que soient les indicateurs retenus. "
        "Rappelle seulement que le score reste relatif et n'a pas été validé par des observations de terrain.")
    zone = f" (zone prioritaire de l'étude : {d['zone_prioritaire']})" if d["zone_prioritaire"] else ""
    return f"""Commune : {d['commune']}, département de {d['departement']}{zone}

RÉSULTAT
- Classe de risque : {d['classe_risque']} (5 classes, de « Très faible » à « Très élevé »)
- Score relatif : {d['score_risque']:.0f}/100, rang {d['rang']} sur {d['nb_communes']} (1 = le plus exposé)

INDICATEURS (poids égaux)
- Altitude médiane du sol : {d['altitude_mediane_m']:.1f} m (plus c'est bas, plus l'eau s'accumule ; la région va d'environ 2 m à 33 m)
- Surface en cuvette (plus basse que son voisinage) : {d['pct_cuvettes']:.0f} % de la commune
- Eau stagnante détectée par satellite après 3 fortes pluies (2024-2025) : {d['pct_eau_detectee']:.2f} % de la surface

FIABILITÉ
{fiabilite}

Explique ce risque et donne des conseils pratiques."""


# --- Réponses de secours (si Groq échoue ou dépasse DELAI_MAX_S) -------------------------

CONSEILS_PAR_CLASSE = {
    "Très élevé": [
        "Surélever les objets de valeur, papiers et appareils électriques dès l'annonce de fortes pluies.",
        "Repérer à l'avance un lieu d'hébergement en hauteur et le chemin pour s'y rendre.",
        "Signaler à la mairie les caniveaux et canaux bouchés avant la saison des pluies (juillet-octobre).",
        "Pour la commune : prioriser le curage des ouvrages de drainage et les bassins de rétention.",
    ],
    "Élevé": [
        "Ne jamais jeter de déchets dans les caniveaux : ils bouchent l'évacuation de l'eau.",
        "Surélever les objets sensibles au rez-de-chaussée pendant l'hivernage.",
        "Suivre les alertes météo de l'ANACIM pendant la saison des pluies.",
        "Pour la commune : cartographier les rues qui restent inondées plusieurs jours.",
    ],
    "Moyen": [
        "Vérifier l'état des gouttières et des évacuations avant l'hivernage.",
        "Éviter de circuler dans les rues inondées (courant, trous, câbles électriques).",
        "Pour la commune : surveiller les cuvettes connues et entretenir le réseau de drainage.",
    ],
    "Faible": [
        "Garder les caniveaux dégagés devant chez soi.",
        "Rester attentif aux alertes météo : une forte pluie peut inonder ponctuellement n'importe quel quartier.",
        "Pour la commune : maintenir l'entretien courant du drainage.",
    ],
    "Très faible": [
        "Garder les caniveaux dégagés : même un quartier peu exposé peut subir des débordements ponctuels.",
        "Rester attentif aux alertes météo pendant l'hivernage.",
    ],
}


def reponse_secours(d, raison):
    phrases = [
        f"**Ce que dit le score** — {d['commune']} est classée **{d['classe_risque'].lower()}** "
        f"(score {d['score_risque']:.0f}/100, rang {d['rang']} sur {d['nb_communes']}). "
        f"Ce score est *relatif* : il compare la commune aux autres communes de la région, "
        f"à partir de l'altitude du sol ({d['altitude_mediane_m']:.1f} m), de la part de surface en cuvette "
        f"({d['pct_cuvettes']:.0f} %) et de l'eau détectée par satellite ({d['pct_eau_detectee']:.2f} %).",
        "",
        "**Fiabilité** — "
        + (f"Classement incertain : rang {d['rang']} au score complet, mais rang {d['rang_altitude_seule']} "
           f"en ne regardant que l'altitude du sol. "
           if not d["classement_robuste"] else "Classement stable selon les indicateurs retenus. ")
        + ("Le radar n'a détecté aucune eau ici, ce qui peut refléter sa limite en bâti dense plutôt qu'une absence d'inondation. "
           if d["alerte_detection_s1"] else "")
        + "Le score n'a pas été validé par des observations de terrain.",
        "",
        "**Conseils pratiques**",
    ]
    phrases += [f"- {c}" for c in CONSEILS_PAR_CLASSE.get(d["classe_risque"], CONSEILS_PAR_CLASSE["Moyen"])]
    phrases += ["", f"<sub>Réponse pré-rédigée affichée car l'assistant IA n'a pas répondu ({raison}).</sub>"]
    return "\n".join(phrases)


# --- Appel Groq ---------------------------------------------------------------------------

_POOL = ThreadPoolExecutor(max_workers=4)

# Les modèles gpt-oss écrivent des tirets insécables (U+2011) que certains affichages font disparaître
_CARACTERES = str.maketrans({"‑": "-", "‐": "-", " ": " ", " ": " "})


def _appel_groq(cle, modele, d, delai_max):
    from groq import Groq
    client = Groq(api_key=cle, timeout=delai_max, max_retries=0)
    rep = client.chat.completions.create(
        model=modele,
        messages=[{"role": "system", "content": SYSTEME},
                  {"role": "user", "content": construire_prompt(d)}],
        temperature=0.3,
        max_completion_tokens=900,
        reasoning_effort="low",
    )
    return (rep.choices[0].message.content or "").strip().translate(_CARACTERES)


def expliquer_commune(d, modele=MODELE, delai_max=DELAI_MAX_S):
    """Renvoie (texte_markdown, source) avec source = 'groq' ou 'secours'.

    Le délai est garanti au total : au-delà de delai_max secondes, on affiche la réponse de secours
    sans attendre la fin de l'appel (qui se termine en arrière-plan et est ignoré).
    """
    cle = os.environ.get("GROQ_API_KEY")
    if not cle:
        return reponse_secours(d, "clé GROQ_API_KEY absente"), "secours"
    t0 = time.time()
    tache = _POOL.submit(_appel_groq, cle, modele, d, delai_max)
    try:
        texte = tache.result(timeout=delai_max)
    except FuturTimeout:
        return reponse_secours(d, f"pas de réponse en {delai_max:.0f} s"), "secours"
    except Exception as e:
        raison = "délai de réponse dépassé" if "timeout" in type(e).__name__.lower() else f"erreur {type(e).__name__}"
        return reponse_secours(d, raison), "secours"
    if not texte:
        return reponse_secours(d, "réponse vide"), "secours"
    return (texte + f"\n\n<sub>Généré par IA ({modele} via Groq) en {time.time() - t0:.1f} s, "
                    "à partir des seules données de l'observatoire.</sub>"), "groq"
