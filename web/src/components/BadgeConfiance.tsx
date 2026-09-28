import { COULEURS_CONFIANCE, explicationConfiance, niveauConfiance } from "../lib/fiabilite";
import type { ProprietesCommune } from "../lib/risque";

/** Pastille colorée + texte ; l'explication s'affiche au survol et est lue par les lecteurs d'écran. */
export default function BadgeConfiance({ commune }: { commune: ProprietesCommune }) {
  const niveau = niveauConfiance(commune);
  const explication = explicationConfiance(commune);
  return (
    <span className="badge-confiance" style={{ background: COULEURS_CONFIANCE[niveau] }} title={explication}
          aria-label={explication}>
      Confiance {niveau.toLowerCase()}
    </span>
  );
}
