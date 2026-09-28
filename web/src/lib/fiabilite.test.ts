import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classeEau, explicationConfiance, niveauConfiance, normaliser } from "./fiabilite";
import type { CollectionCommunes } from "./risque";

const RACINE = join(__dirname, "..", "..", "..");
const donnees = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "public", "data", "communes.geojson"), "utf8"),
) as CollectionCommunes;
const parNom = new Map(donnees.features.map((f) => [f.properties.commune, f.properties]));

describe("niveau de confiance", () => {
  it("donne les niveaux attendus sur les cas de référence", () => {
    expect(niveauConfiance(parNom.get("Pikine Ouest")!)).toBe("Haute");
    expect(niveauConfiance(parNom.get("Yeumbeul Nord")!)).toBe("Moyenne");   // classement non robuste
    expect(niveauConfiance(parNom.get("Sicap-Liberté")!)).toBe("Moyenne");   // alerte satellite
    expect(niveauConfiance(parNom.get("Thiaroye-sur-Mer")!)).toBe("Faible");
  });
});

describe("classes d'eau et recherche", () => {
  it("range les pourcentages dans les bonnes classes", () => {
    expect([0, 0.01, 0.05, 0.15, 0.3, 0.79].map(classeEau)).toEqual(
      ["Aucune eau détectée", "< 0,05 %", "0,05 – 0,15 %", "0,15 – 0,30 %", "> 0,30 %", "> 0,30 %"]);
  });
  it("cherche sans tenir compte des accents ni des majuscules", () => {
    expect(normaliser("Médina")).toBe("medina");
    expect(normaliser("Cambérène").includes(normaliser("CAMBERENE"))).toBe(true);
  });
});

// Parité avec l'appli Gradio : le même calcul en Python (app.py) doit donner exactement les mêmes résultats.
// Sauté si Python et les dépendances de l'appli ne sont pas disponibles (ex. build Vercel).
const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(RACINE)})
import app
print(json.dumps({c: [app.niveau_confiance(c), app.explication_confiance(c), app.classe_eau(app.COMMUNES.loc[c, "pct_eau_stagnante_moyen"])] for c in app.COMMUNES.index}, ensure_ascii=False))
`;
const python = spawnSync("python", ["-c", script], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 120_000 });
const referencePython: Record<string, [string, string, string]> | null =
  python.status === 0 ? JSON.parse(python.stdout.trim().split("\n").pop()!) : null;

describe.skipIf(!referencePython)("parité avec app.py (53 communes)", () => {
  it("niveau, explication de confiance et classe d'eau identiques à Python", () => {
    for (const [commune, [niveau, explication, eau]] of Object.entries(referencePython!)) {
      const p = parNom.get(commune)!;
      expect({ commune, niveau: niveauConfiance(p), explication: explicationConfiance(p), eau: classeEau(p.pct_eau_stagnante_moyen) })
        .toEqual({ commune, niveau, explication, eau });
    }
    expect(Object.keys(referencePython!)).toHaveLength(53);
  });
});
