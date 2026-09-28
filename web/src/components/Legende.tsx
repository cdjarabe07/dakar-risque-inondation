import { CLASSES, COULEURS_RISQUE } from "../lib/risque";

export default function Legende({ mode3d }: { mode3d: boolean }) {
  return (
    <div className="legende">
      <span className="legende-titre">Risque relatif</span>
      {[...CLASSES].reverse().map((c) => (
        <span key={c} className="legende-item">
          <span className="pastille" style={{ background: COULEURS_RISQUE[c] }} />
          {c}
        </span>
      ))}
      <span className="legende-aide">
        {mode3d ? "Hauteur proportionnelle au score. Clic droit + glisser pour pivoter. " : ""}
        Cliquez sur une commune pour la sélectionner.
      </span>
    </div>
  );
}
