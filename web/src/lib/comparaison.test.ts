import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  arrondiPython, attribuerCouleurs, enumerer, lignesTableau, percentilesExposition, syntheseComparaison,
} from "./comparaison";
import type { CollectionCommunes } from "./risque";

const RACINE = join(__dirname, "..", "..", "..");
const donnees = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "public", "data", "communes.geojson"), "utf8"),
) as CollectionCommunes;
const toutes = donnees.features.map((f) => f.properties);
const parNom = new Map(toutes.map((p) => [p.commune, p]));
const pct = percentilesExposition(toutes);

describe("utilitaires", () => {
  it("arrondit comme Python (demi-unités vers le pair)", () => {
    expect([0.5, 1.5, 2.5, 22.5, 2.6].map((v) => arrondiPython(v, 0))).toEqual(["0", "2", "2", "22", "3"]);
    expect(arrondiPython(2.345, 1)).toBe("2.3");
    // 0.05 est stocké un peu au-dessus de 0.05 : Python donne « 0.1 » (et 0.25, exact, donne « 0.2 »)
    expect([0.05, 0.25, 0.35, 0.15].map((v) => arrondiPython(v, 1))).toEqual(["0.1", "0.2", "0.3", "0.1"]);
  });
  it("énumère « A », « A et B », « A, B et C »", () => {
    expect(enumerer(["A"])).toBe("A");
    expect(enumerer(["A", "B"])).toBe("A et B");
    expect(enumerer(["A", "B", "C"])).toBe("A, B et C");
  });
  it("garde la couleur de chaque commune quand on en retire ou en ajoute une", () => {
    const c = attribuerCouleurs(["A", "B", "C"]);
    expect(c).toEqual({ A: 0, B: 1, C: 2 });
    const c2 = attribuerCouleurs(["B", "C"], c);
    expect(c2).toEqual({ B: 1, C: 2 });
    expect(attribuerCouleurs(["B", "C", "D"], c2)).toEqual({ B: 1, C: 2, D: 0 });
  });
});

// Sélections testées : toutes les paires de 12 communes variées + 20 trios
const ECHANTILLON = ["Pikine Ouest", "Malika", "Thiaroye-sur-Mer", "Médina", "Grand Yoff", "Sicap-Liberté",
  "Yeumbeul Nord", "Yeumbeul Sud", "Bargny", "Medina Gounass", "Ouakam", "Tivaouane Peulh-Niaga"];
const SELECTIONS: string[][] = [];
for (let i = 0; i < ECHANTILLON.length; i++)
  for (let j = i + 1; j < ECHANTILLON.length; j++) SELECTIONS.push([ECHANTILLON[i], ECHANTILLON[j]]);
for (let k = 0; k < 20; k++)
  SELECTIONS.push([ECHANTILLON[k % 12], ECHANTILLON[(k * 5 + 1) % 12], ECHANTILLON[(k * 7 + 3) % 12]]);
const TRIOS_VALIDES = SELECTIONS.filter((s) => new Set(s).size === s.length);

const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(RACINE)})
import app
selections = json.loads(sys.stdin.read())
sortie = {"pct": {c: [app.PCT_ALTITUDE[c], app.PCT_CUVETTES[c], app.PCT_EAU[c]] for c in app.COMMUNES.index}, "cas": []}
for s in selections:
    d = [app.donnees_commune(c) for c in s]
    t = app.tableau_comparaison(d)
    sortie["cas"].append({"selection": s, "synthese": app.synthese_comparaison(d), "tableau": t.values.tolist()})
print(json.dumps(sortie, ensure_ascii=False))
`;
const python = spawnSync("python", ["-c", script], {
  input: JSON.stringify(TRIOS_VALIDES), encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 180_000,
});
const reference = python.status === 0 ? JSON.parse(python.stdout.trim().split("\n").pop()!) : null;
// Seule différence voulue : virgule décimale française côté web (« 2,3 m » au lieu de « 2.3 m »)
const versPoint = (s: string) => s.replace(/(\d),(\d)/g, "$1.$2");

describe.skipIf(!reference)("parité avec app.py", () => {
  it("même échelle 0-100 (percentile d'exposition) pour les 53 communes", () => {
    for (const [c, [alt, cuv, eau]] of Object.entries(reference!.pct as Record<string, number[]>)) {
      expect(pct.altitude.get(c)).toBeCloseTo(alt, 9);
      expect(pct.cuvettes.get(c)).toBeCloseTo(cuv, 9);
      expect(pct.eau.get(c)).toBeCloseTo(eau, 9);
    }
  });

  it(`même synthèse et même tableau sur ${TRIOS_VALIDES.length} sélections`, () => {
    for (const cas of reference!.cas as { selection: string[]; synthese: string; tableau: string[][] }[]) {
      const d = cas.selection.map((c) => parNom.get(c)!);
      expect({ selection: cas.selection, synthese: versPoint(syntheseComparaison(d, pct)) })
        .toEqual({ selection: cas.selection, synthese: cas.synthese });
      const web = lignesTableau(d).map(([indic, vals]) => [indic, ...vals.map(versPoint)]);
      expect(web).toEqual(cas.tableau);
    }
  });
});
