// Niveau de confiance et couche « eau détectée » : même logique et mêmes textes que app.py
// (niveau_confiance, explication_confiance, classe_eau). La parité est vérifiée par test.
import type { ProprietesCommune } from "./risque";

export type NiveauConfiance = "Haute" | "Moyenne" | "Faible";

/** Palette « statut », distincte de l'échelle jaune → rouge du risque ; la pastille porte toujours le texte. */
export const COULEURS_CONFIANCE: Record<NiveauConfiance, string> = {
  Haute: "#0ca30c",
  Moyenne: "#fab219",
  Faible: "#d03b3b",
};

/** Haute : classement robuste ET eau détectable ; Moyenne : un seul problème ; Faible : les deux. */
export function niveauConfiance(p: Pick<ProprietesCommune, "classement_robuste" | "alerte_detection_s1">): NiveauConfiance {
  const problemes = Number(!p.classement_robuste) + Number(p.alerte_detection_s1);
  return (["Haute", "Moyenne", "Faible"] as const)[problemes];
}

export function explicationConfiance(p: ProprietesCommune): string {
  const niveau = niveauConfiance(p);
  const instable =
    `classement sensible aux indicateurs utilisés (rang ${p.rang} au score complet, ` +
    `${p.rang_altitude_seule} avec l'altitude seule)`;
  const radar = "aucune eau détectée par satellite, ce qui peut refléter la limite du radar en bâti dense";
  if (niveau === "Haute")
    return "Confiance haute : classement stable quels que soient les indicateurs, et eau visible par le satellite.";
  if (niveau === "Faible") return `Confiance faible : ${instable}, et ${radar}.`;
  return !p.classement_robuste
    ? `Confiance moyenne : ${instable}.`
    : `Confiance moyenne : classement stable, mais ${radar}.`;
}

// --- Couche « eau détectée par Sentinel-1 » -------------------------------------------------

export const CLASSES_EAU = ["Aucune eau détectée", "< 0,05 %", "0,05 – 0,15 %", "0,15 – 0,30 %", "> 0,30 %"] as const;
export type ClasseEau = (typeof CLASSES_EAU)[number];

/** Bleus (une seule teinte, clair → foncé) ; 0 % en gris = « rien détecté », pas « aucun risque ». */
export const COULEURS_EAU: Record<ClasseEau, string> = {
  "Aucune eau détectée": "#cfcdc6",
  "< 0,05 %": "#b7d3f6",
  "0,05 – 0,15 %": "#6da7ec",
  "0,15 – 0,30 %": "#2a78d6",
  "> 0,30 %": "#184f95",
};

export function classeEau(pct: number): ClasseEau {
  if (pct === 0) return CLASSES_EAU[0];
  if (pct < 0.05) return CLASSES_EAU[1];
  if (pct < 0.15) return CLASSES_EAU[2];
  if (pct < 0.3) return CLASSES_EAU[3];
  return CLASSES_EAU[4];
}

export const NOTE_EAU =
  "Couleur = % de la surface où le radar Sentinel-1 a détecté de l'eau stagnante (moyenne de 3 images prises " +
  "juste après de fortes pluies, 2024-2025). Attention : détection moins fiable en tissu urbain dense, " +
  "une commune grise n'est pas forcément épargnée par les inondations.";

/** Pour la recherche : minuscules, sans accents (« medina » trouve « Médina »). */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
