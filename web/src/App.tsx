import { useEffect, useState } from "react";
import Carte from "./components/Carte";
import Legende from "./components/Legende";
import { chargerCommunes, COULEURS_RISQUE, NB_COMMUNES, type CollectionCommunes } from "./lib/risque";

const COMMUNE_PAR_DEFAUT = "Pikine Ouest";

export default function App() {
  const [communes, setCommunes] = useState<CollectionCommunes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(COMMUNE_PAR_DEFAUT);
  const [mode3d, setMode3d] = useState(true);

  useEffect(() => {
    chargerCommunes().then(setCommunes).catch((e: Error) => setErreur(e.message));
  }, []);

  const commune = communes?.features.find((f) => f.properties.commune === selection)?.properties;

  return (
    <div className="page">
      <header className="bandeau">
        <h1>Observatoire du Risque d'Inondation — Dakar</h1>
        <p className="sous-titre">L'IA explique le risque, elle ne le décide pas.</p>
      </header>

      <main className="grille">
        <section className="bloc bloc-carte" aria-label="Carte des communes">
          <div className="barre-outils">
            <div className="segments" role="group" aria-label="Type de carte">
              <button type="button" aria-pressed={mode3d} onClick={() => setMode3d(true)}>Carte 3D</button>
              <button type="button" aria-pressed={!mode3d} onClick={() => setMode3d(false)}>Carte 2D</button>
            </div>
          </div>
          <div className="carte">
            {communes && (
              <Carte communes={communes} selection={selection} onSelection={setSelection} mode3d={mode3d} />
            )}
            {!communes && !erreur && <p className="etat">Chargement des communes…</p>}
            {erreur && <p className="etat erreur">Impossible de charger les données : {erreur}</p>}
          </div>
          <Legende mode3d={mode3d} />
        </section>

        <aside className="bloc bloc-fiche" aria-live="polite">
          {commune ? (
            <>
              <h2>{commune.commune}</h2>
              <p className="discret">Département de {commune.departement}</p>
              <p className="resume">
                <span className="pastille" style={{ background: COULEURS_RISQUE[commune.classe_risque] }} />
                Risque {commune.classe_risque.toLowerCase()} — score {Math.round(commune.score_risque)}/100
                <br />
                Rang {commune.rang} sur {NB_COMMUNES}
              </p>
              <p className="discret">La fiche détaillée, le badge de confiance et l'IA arrivent aux étapes suivantes.</p>
            </>
          ) : (
            <p className="discret">Cliquez sur une commune de la carte pour afficher son résumé.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
