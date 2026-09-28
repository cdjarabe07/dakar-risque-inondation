import { useRef, useState } from "react";
import { avertissements, COULEURS_COMPARAISON, nombreFr, type Indicateur } from "../lib/comparaison";
import { NB_COMMUNES, type ProprietesCommune } from "../lib/risque";

const L = 760, H = 330, M = { haut: 24, droite: 12, bas: 46, gauche: 44 };
const GROUPES = ["Score de risque", "Altitude basse", "Surface en cuvette", "Eau détectée (satellite)"];

interface Props {
  donnees: ProprietesCommune[];
  couleurs: Record<string, number>;
  pct: Record<Indicateur, Map<string, number>>;
}

/** Barres groupées sur une échelle commune 0-100 (0 = la commune la moins exposée des 53 sur l'indicateur). */
export default function GraphiqueComparaison({ donnees, couleurs, pct }: Props) {
  const [survol, setSurvol] = useState<{ x: number; y: number; texte: string } | null>(null);
  const zone = useRef<HTMLDivElement>(null);
  const position = (e: React.MouseEvent) => {
    const r = zone.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const largeurUtile = L - M.gauche - M.droite, hauteurUtile = H - M.haut - M.bas;
  const largeurGroupe = largeurUtile / GROUPES.length;
  const largeurBarre = Math.min(46, (largeurGroupe * 0.72) / donnees.length);
  const y = (v: number) => M.haut + hauteurUtile * (1 - v / 100);

  const series = donnees.map((d) => {
    const valeurs = [d.score_risque, pct.altitude.get(d.commune)!, pct.cuvettes.get(d.commune)!, pct.eau.get(d.commune)!];
    const brutes = [
      `score ${Math.round(d.score_risque)}/100, rang ${d.rang}/${NB_COMMUNES}`,
      `altitude médiane ${nombreFr(d.alt_mediane_m, 1)} m`,
      `${Math.round(d.pct_depression)} % de la surface en cuvette`,
      `${nombreFr(d.pct_eau_stagnante_moyen, 2)} % de la surface en eau`,
    ];
    // L'astérisque marque les valeurs à lire avec prudence (score incertain, eau non détectable en bâti dense)
    const prudence = [!d.classement_robuste, false, false, d.alerte_detection_s1];
    return { d, valeurs, brutes, prudence, couleur: COULEURS_COMPARAISON[couleurs[d.commune]] };
  });

  return (
    <figure className="graphique">
      <div className="graphique-legende">
        {series.map((s) => (
          <span key={s.d.commune} className="legende-item">
            <span className="pastille" style={{ background: s.couleur }} />
            {s.d.commune}{avertissements(s.d).length > 0 && " *"}
          </span>
        ))}
      </div>
      <div className="graphique-zone" ref={zone} onMouseLeave={() => setSurvol(null)}>
        <svg viewBox={`0 0 ${L} ${H}`} role="img"
             aria-label="Comparaison des communes sur une échelle commune de 0 à 100 (détail dans le tableau)">
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={M.gauche} x2={L - M.droite} y1={y(t)} y2={y(t)} className={t === 0 ? "axe" : "grille"} />
              <text x={M.gauche - 8} y={y(t) + 4} textAnchor="end" className="graduation">{t}</text>
            </g>
          ))}
          {GROUPES.map((g, i) => {
            const x0 = M.gauche + i * largeurGroupe + (largeurGroupe - largeurBarre * series.length - 4 * (series.length - 1)) / 2;
            return (
              <g key={g}>
                {series.map((s, j) => {
                  const v = s.valeurs[i];
                  const x = x0 + j * (largeurBarre + 4);
                  const hauteur = Math.max(y(0) - y(v), 0);
                  const r = Math.min(4, hauteur);
                  // Barre aux coins supérieurs arrondis, ancrée sur l'axe
                  const chemin = `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + largeurBarre - r} ` +
                    `Q${x + largeurBarre},${y(v)} ${x + largeurBarre},${y(v) + r} V${y(0)} Z`;
                  return (
                    <g key={s.d.commune}
                       onMouseMove={(e) => setSurvol({ ...position(e),
                         texte: `${s.d.commune} — ${g} : ${Math.round(v)}/100 (${s.brutes[i]})` })}>
                      {hauteur > 0 && <path d={chemin} fill={s.couleur} />}
                      {/* Zone de survol plus grande que la barre */}
                      <rect x={x} y={M.haut} width={largeurBarre} height={hauteurUtile} fill="transparent" />
                      <text x={x + largeurBarre / 2} y={y(v) - 6} textAnchor="middle" className="valeur">
                        {Math.round(v)}{s.prudence[i] ? " *" : ""}
                      </text>
                    </g>
                  );
                })}
                <text x={M.gauche + (i + 0.5) * largeurGroupe} y={H - 18} textAnchor="middle" className="etiquette">{g}</text>
              </g>
            );
          })}
        </svg>
        {survol && <div className="infobulle-graphique" style={{ left: survol.x + 12, top: survol.y - 10 }}>{survol.texte}</div>}
      </div>
      <figcaption className="discret">
        Échelle commune 0-100 : 0 = la commune la moins exposée des 53 sur cet indicateur, 100 = la plus exposée.
        * = valeur à lire avec prudence (classement incertain ou eau non détectable en bâti dense). Survolez une barre
        pour la valeur brute.
      </figcaption>
    </figure>
  );
}
