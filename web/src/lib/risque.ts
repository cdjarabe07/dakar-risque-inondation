// Données et palette du risque, partagées par la carte et les panneaux.
// Les couleurs sont celles de l'appli Gradio (app.py), pour que les deux interfaces restent cohérentes.
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

export const CLASSES = ["Très faible", "Faible", "Moyen", "Élevé", "Très élevé"] as const;
export type ClasseRisque = (typeof CLASSES)[number];

export const COULEURS_RISQUE: Record<ClasseRisque, string> = {
  "Très faible": "#ffffb2",
  Faible: "#fecc5c",
  Moyen: "#fd8d3c",
  Élevé: "#f03b20",
  "Très élevé": "#bd0026",
};

export interface ProprietesCommune {
  osm_id: number;
  commune: string;
  departement: string;
  zone_prioritaire: string | null;
  score_risque: number;
  classe_risque: ClasseRisque;
  rang: number;
  alt_mediane_m: number;
  pct_depression: number;
  pct_eau_stagnante_moyen: number;
  pct_eau_permanente: number;
  surface_km2: number;
  classement_robuste: boolean;
  alerte_detection_s1: boolean;
  rang_sans_s1: number;
  rang_altitude_seule: number;
  ecart_rang_max: number;
}

export type GeometrieCommune = Polygon | MultiPolygon;
export type EntiteCommune = Feature<GeometrieCommune, ProprietesCommune>;
export type CollectionCommunes = FeatureCollection<GeometrieCommune, ProprietesCommune>;

export const NB_COMMUNES = 53;
/** Score 100 → 1 200 m d'extrusion en 3D (même échelle que l'appli Gradio). */
export const ECHELLE_HAUTEUR = 12;

export type RGBA = [number, number, number, number];

export function hexVersRgba(hexa: string, alpha = 255): RGBA {
  const n = parseInt(hexa.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

export function couleurClasse(classe: ClasseRisque, alpha = 255): RGBA {
  return hexVersRgba(COULEURS_RISQUE[classe], alpha);
}

/** Centre de l'emprise d'un polygone ou multipolygone : [longitude, latitude]. */
export function centreEmprise(geometrie: GeometrieCommune): [number, number] {
  const anneaux: Position[][] =
    geometrie.type === "MultiPolygon" ? geometrie.coordinates.flat() : geometrie.coordinates;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const anneau of anneaux) {
    for (const [x, y] of anneau) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export async function chargerCommunes(url = "/data/communes.geojson"): Promise<CollectionCommunes> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Données introuvables (${reponse.status})`);
  return (await reponse.json()) as CollectionCommunes;
}
