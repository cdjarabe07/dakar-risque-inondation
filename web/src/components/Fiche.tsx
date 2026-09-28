import BadgeConfiance from "./BadgeConfiance";
import { COULEURS_RISQUE, NB_COMMUNES, type ProprietesCommune } from "../lib/risque";

const nombre = (v: number, decimales: number) => v.toFixed(decimales).replace(".", ",");

/** Fiche détaillée d'une commune : mêmes informations et avertissements que la fiche de app.py. */
export default function Fiche({ c }: { c: ProprietesCommune }) {
  return (
    <div className="fiche">
      <h2>{c.commune}</h2>
      <p className="discret">
        Département de {c.departement}
        {c.zone_prioritaire && <> · zone prioritaire <strong>{c.zone_prioritaire}</strong></>}
      </p>
      <p className="resume">
        <span className="pastille" style={{ background: COULEURS_RISQUE[c.classe_risque] }} />
        Risque {c.classe_risque.toLowerCase()} — score {Math.round(c.score_risque)}/100 (rang {c.rang} sur {NB_COMMUNES})
      </p>
      <BadgeConfiance commune={c} />

      <table className="indicateurs">
        <thead><tr><th scope="col">Indicateur</th><th scope="col">Valeur</th></tr></thead>
        <tbody>
          <tr><td>Altitude médiane du sol</td><td>{nombre(c.alt_mediane_m, 1)} m</td></tr>
          <tr><td>Surface en cuvette</td><td>{Math.round(c.pct_depression)} %</td></tr>
          <tr><td>Eau stagnante détectée par satellite (moyenne de 3 dates)</td><td>{nombre(c.pct_eau_stagnante_moyen, 2)} %</td></tr>
          <tr><td>Eau permanente (lacs, bassins)</td><td>{nombre(c.pct_eau_permanente, 1)} %</td></tr>
          <tr><td>Surface terrestre</td><td>{nombre(c.surface_km2, 1)} km²</td></tr>
        </tbody>
      </table>

      {!c.classement_robuste && (
        <p className="attention">
          <strong>Attention — classement incertain</strong> : rang {c.rang} au score complet, rang {c.rang_sans_s1} sans
          le satellite, rang {c.rang_altitude_seule} avec l'altitude seule. À interpréter avec prudence.
        </p>
      )}
      {c.alerte_detection_s1 && (
        <p className="attention">
          <strong>Attention — limite satellite</strong> : aucune eau détectée par le radar Sentinel-1. En bâti dense, le
          radar ne voit pas l'eau entre les maisons : cela ne prouve pas l'absence d'inondation.
        </p>
      )}
    </div>
  );
}
