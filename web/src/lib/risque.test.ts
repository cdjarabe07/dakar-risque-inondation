import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLASSES, COULEURS_RISQUE, centreEmprise, couleurClasse, hexVersRgba, NB_COMMUNES,
  type CollectionCommunes,
} from "./risque";

const RACINE = join(__dirname, "..", "..", "..");

describe("palette du risque", () => {
  it("a une couleur par classe, identique à celle de l'appli Gradio (app.py)", () => {
    const appPy = readFileSync(join(RACINE, "app.py"), "utf8");
    for (const classe of CLASSES) {
      expect(appPy).toContain(`"${classe}": "${COULEURS_RISQUE[classe]}"`);
    }
  });

  it("convertit l'hexadécimal en RGBA", () => {
    expect(hexVersRgba("#bd0026")).toEqual([189, 0, 38, 255]);
    expect(couleurClasse("Très faible", 100)).toEqual([255, 255, 178, 100]);
  });
});

describe("centreEmprise", () => {
  it("donne le centre de l'emprise d'un polygone", () => {
    expect(centreEmprise({ type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]] })).toEqual([2, 1]);
  });

  it("prend en compte toutes les parties d'un multipolygone", () => {
    expect(
      centreEmprise({
        type: "MultiPolygon",
        coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[9, 9], [10, 9], [10, 10], [9, 9]]]],
      }),
    ).toEqual([5, 5]);
  });
});

describe("données préparées (public/data/communes.geojson)", () => {
  const donnees = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "public", "data", "communes.geojson"), "utf8"),
  ) as CollectionCommunes;
  const parNom = new Map(donnees.features.map((f) => [f.properties.commune, f.properties]));

  it("contient les 53 communes, toutes avec une classe connue et une géométrie surfacique", () => {
    expect(donnees.features).toHaveLength(NB_COMMUNES);
    for (const f of donnees.features) {
      expect(CLASSES).toContain(f.properties.classe_risque);
      expect(["Polygon", "MultiPolygon"]).toContain(f.geometry.type);
    }
  });

  it("garde les valeurs de référence (Pikine Ouest rang 1, Thiaroye-sur-Mer incertain avec alerte satellite)", () => {
    expect(parNom.get("Pikine Ouest")).toMatchObject({ rang: 1, classement_robuste: true, alerte_detection_s1: false });
    expect(parNom.get("Thiaroye-sur-Mer")).toMatchObject({ rang: 46, classement_robuste: false, alerte_detection_s1: true });
  });
});
