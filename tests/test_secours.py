"""Tests de la réponse de secours : l'appli doit toujours répondre en moins de ~5 s, même si Groq échoue.

Lancer depuis la racine du projet :  python tests/test_secours.py
Les scénarios 1 à 3 n'appellent pas Groq ; le scénario 4 appelle Groq si GROQ_API_KEY est définie.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app
import explication_ia as ia

COMMUNE = "Thiaroye-sur-Mer"
d = app.donnees_commune(COMMUNE)
cle_reelle = os.environ.get("GROQ_API_KEY")
resultats = []


def verifier(nom, attendu_source, fonction, duree_max=5.5):
    t0 = time.time()
    texte, source = fonction()
    duree = time.time() - t0
    ok = source == attendu_source and duree <= duree_max
    if attendu_source == "secours":
        # La réponse de secours doit garder les nuances de fiabilité de cette commune
        ok = ok and all(m in texte for m in ("**Fiabilité**", "Classement incertain", "radar", "Réponse pré-rédigée"))
    resultats.append(ok)
    print(f"[{'OK' if ok else 'ÉCHEC'}] {nom} : source={source}, {duree:.2f} s")
    return texte


# 1. Clé absente (Space mal configuré)
os.environ.pop("GROQ_API_KEY", None)
verifier("clé absente", "secours", lambda: ia.expliquer_commune(d))

# 2. Clé invalide (révoquée, faute de frappe)
os.environ["GROQ_API_KEY"] = "gsk_cle_invalide_pour_le_test"
verifier("clé invalide", "secours", lambda: ia.expliquer_commune(d))

# 3. Groq trop lent : on simule un appel qui met 8 s
appel_original = ia._appel_groq
ia._appel_groq = lambda *args, **kwargs: (time.sleep(8), "trop tard")[1]
texte_lent = verifier("Groq met 8 s (limite 5 s)", "secours", lambda: ia.expliquer_commune(d))
ia._appel_groq = appel_original

# 4. Cas normal (seulement si une vraie clé est disponible)
if cle_reelle:
    os.environ["GROQ_API_KEY"] = cle_reelle
    verifier("appel réel à Groq", "groq", lambda: ia.expliquer_commune(d))
else:
    print("[--] appel réel à Groq : ignoré (GROQ_API_KEY non définie)")

print("\nExemple de réponse de secours affichée (scénario 3) :\n")
print(texte_lent)
print(f"\n{sum(resultats)}/{len(resultats)} scénarios réussis")
sys.exit(0 if all(resultats) else 1)
