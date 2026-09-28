// Prépare les données de l'interface à partir du résultat des notebooks (source unique) :
//   ../data/processed/score_risque_communes.geojson  →  public/data/communes.geojson
// Garde seulement les champs affichés et arrondit les coordonnées (5 décimales ≈ 1 m).
// Lancé automatiquement avant `npm run dev` et `npm run build` (scripts predev / prebuild).
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, "..", "..", "data", "processed", "score_risque_communes.geojson");
const CIBLE = join(ICI, "..", "public", "data", "communes.geojson");

const CHAMPS = [
  "osm_id", "commune", "departement", "zone_prioritaire", "score_risque", "classe_risque", "rang",
  "alt_mediane_m", "pct_depression", "pct_eau_stagnante_moyen", "pct_eau_permanente", "surface_km2",
  "classement_robuste", "rang_sans_s1", "rang_altitude_seule", "ecart_rang_max",
];

const arrondir = (c) => (typeof c[0] === "number" ? c.map((v) => Math.round(v * 1e5) / 1e5) : c.map(arrondir));

const source = JSON.parse(readFileSync(SOURCE, "utf8"));
const features = source.features.map((f) => {
  const p = Object.fromEntries(CHAMPS.map((k) => [k, f.properties[k] ?? null]));
  // Le GeoJSON d'origine stocke l'alerte comme un texte (vide = pas d'alerte) : on la passe en booléen
  p.alerte_detection_s1 = Boolean(f.properties.alerte_detection_s1);
  return { type: "Feature", properties: p, geometry: { type: f.geometry.type, coordinates: arrondir(f.geometry.coordinates) } };
});

if (features.length !== 53) throw new Error(`53 communes attendues, ${features.length} trouvées`);
mkdirSync(dirname(CIBLE), { recursive: true });
writeFileSync(CIBLE, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`communes.geojson : ${features.length} communes, ${Math.round(statSync(CIBLE).size / 1024)} Ko`);
