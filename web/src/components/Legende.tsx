import { CLASSES, COULEURS_RISQUE } from "../lib/risque";
import { CLASSES_EAU, COULEURS_EAU, NOTE_EAU } from "../lib/fiabilite";
import type { Couche } from "./Carte";

export default function Legende({ mode3d, couche }: { mode3d: boolean; couche: Couche }) {
  const eau = couche === "eau";
  const classes: readonly string[] = eau ? [...CLASSES_EAU].reverse() : [...CLASSES].reverse();
  const couleurs: Record<string, string> = eau ? COULEURS_EAU : COULEURS_RISQUE;
  return (
    <div className="legende">
      <span className="legende-titre">{eau ? "Eau détectée (satellite)" : "Risque relatif"}</span>
      {classes.map((c) => (
        <span key={c} className="legende-item">
          <span className="pastille" style={{ background: couleurs[c] }} />
          {c}
        </span>
      ))}
      <span className="legende-aide">
        {eau ? NOTE_EAU + " " : ""}
        {mode3d ? `Hauteur proportionnelle ${eau ? "au % d'eau détectée" : "au score"}. Clic droit + glisser pour pivoter. ` : ""}
        Cliquez sur une commune pour la sélectionner.
      </span>
    </div>
  );
}
