import { Fragment, useMemo, useState } from "react";
import BadgeConfiance from "./BadgeConfiance";
import GraphiqueComparaison from "./GraphiqueComparaison";
import SelecteurCommune from "./SelecteurCommune";
import {
  attribuerCouleurs, avertissements, COULEURS_COMPARAISON, lignesTableau, MAX_COMPARAISON,
  percentilesExposition, syntheseComparaison,
} from "../lib/comparaison";
import type { ProprietesCommune } from "../lib/risque";

const PAR_DEFAUT = ["Pikine Ouest", "Thiaroye-sur-Mer"];   // rang 1 contre classement incertain

/** Affiche un texte où **ceci** est en gras (format de la synthèse, identique à app.py). */
function AvecGras({ texte }: { texte: string }) {
  return <>{texte.split("**").map((morceau, i) => (i % 2 ? <strong key={i}>{morceau}</strong> : <Fragment key={i}>{morceau}</Fragment>))}</>;
}

export default function Comparaison({ communes }: { communes: ProprietesCommune[] }) {
  const [selection, setSelection] = useState<string[]>(PAR_DEFAUT);
  const [couleurs, setCouleurs] = useState(() => attribuerCouleurs(PAR_DEFAUT));
  const pct = useMemo(() => percentilesExposition(communes), [communes]);
  const parNom = useMemo(() => new Map(communes.map((c) => [c.commune, c])), [communes]);

  const changer = (nouvelle: string[]) => {
    setSelection(nouvelle);
    setCouleurs((c) => attribuerCouleurs(nouvelle, c));
  };
  const donnees = selection.map((c) => parNom.get(c)!).filter(Boolean);

  return (
    <section className="bloc comparaison" aria-label="Comparer des communes">
      <div className="choix-communes">
        {selection.map((c) => (
          <span key={c} className="etiquette-commune">
            <span className="pastille" style={{ background: COULEURS_COMPARAISON[couleurs[c]] }} />
            {c}
            <button type="button" aria-label={`Retirer ${c}`} onClick={() => changer(selection.filter((s) => s !== c))}>×</button>
          </span>
        ))}
        {selection.length < MAX_COMPARAISON ? (
          <SelecteurCommune
            communes={communes.filter((c) => !selection.includes(c.commune))}
            selection={null}
            label={`Ajouter une commune (${selection.length}/${MAX_COMPARAISON})`}
            onSelection={(c) => changer([...selection, c])}
          />
        ) : (
          <p className="discret">3 communes au maximum : retirez-en une pour en ajouter une autre.</p>
        )}
      </div>

      {donnees.length < 2 ? (
        <p className="discret">Sélectionnez au moins 2 communes (3 au maximum) pour les comparer.</p>
      ) : (
        <>
          <p className="synthese"><AvecGras texte={syntheseComparaison(donnees, pct)} /></p>
          <p className="badges-comparaison">
            {donnees.map((d) => <span key={d.commune}><strong>{d.commune}</strong> <BadgeConfiance commune={d} /></span>)}
          </p>
          {donnees.some((d) => avertissements(d).length) && (
            <div className="avertissements">
              <strong>Avertissements par commune</strong>
              <ul>
                {donnees.flatMap((d) => avertissements(d).map((a) => <li key={d.commune + a}><strong>{d.commune}</strong> : {a}</li>))}
              </ul>
            </div>
          )}

          <div className="tableau-defilant">
            <table className="tableau-comparaison">
              <thead>
                <tr>
                  <th scope="col">Indicateur</th>
                  {donnees.map((d) => (
                    <th scope="col" key={d.commune}>
                      <span className="pastille" style={{ background: COULEURS_COMPARAISON[couleurs[d.commune]] }} />
                      {d.commune} <BadgeConfiance commune={d} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignesTableau(donnees).map(([indicateur, valeurs]) => (
                  <tr key={indicateur}>
                    <th scope="row">{indicateur}</th>
                    {valeurs.map((v, i) => <td key={i}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <GraphiqueComparaison donnees={donnees} couleurs={couleurs} pct={pct} />
        </>
      )}
    </section>
  );
}
