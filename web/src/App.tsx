import { useEffect, useMemo, useState } from "react";
import Carte, { type Couche } from "./components/Carte";
import Chat from "./components/Chat";
import Explication from "./components/Explication";
import Comparaison from "./components/Comparaison";
import Fiche from "./components/Fiche";
import Legende from "./components/Legende";
import SelecteurCommune from "./components/SelecteurCommune";
import { chargerCommunes, type CollectionCommunes } from "./lib/risque";

const COMMUNE_PAR_DEFAUT = "Pikine Ouest";

export default function App() {
  const [communes, setCommunes] = useState<CollectionCommunes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(COMMUNE_PAR_DEFAUT);
  const [mode3d, setMode3d] = useState(true);
  const [couche, setCouche] = useState<Couche>("score");
  const [rotation, setRotation] = useState(false);
  const [onglet, setOnglet] = useState<"carte" | "comparer">("carte");

  useEffect(() => {
    chargerCommunes().then(setCommunes).catch((e: Error) => setErreur(e.message));
  }, []);

  const proprietes = useMemo(() => communes?.features.map((f) => f.properties) ?? [], [communes]);
  const commune = proprietes.find((p) => p.commune === selection);

  return (
    <div className="page">
      <header className="bandeau">
        <h1>Observatoire du Risque d'Inondation — Dakar</h1>
        <p className="sous-titre">L'IA explique le risque, elle ne le décide pas.</p>
        <nav className="onglets" role="tablist" aria-label="Sections">
          <button type="button" role="tab" aria-selected={onglet === "carte"} onClick={() => setOnglet("carte")}>Carte</button>
          <button type="button" role="tab" aria-selected={onglet === "comparer"} onClick={() => setOnglet("comparer")}>
            Comparer des communes
          </button>
        </nav>
      </header>

      {onglet === "comparer" && (communes ? <Comparaison communes={proprietes} /> : <p className="discret">Chargement…</p>)}

      <main className="grille" hidden={onglet !== "carte"}>
        <section className="bloc bloc-carte" aria-label="Carte des communes">
          <div className="barre-outils">
            <div className="segments" role="group" aria-label="Type de carte">
              <button type="button" aria-pressed={mode3d} onClick={() => setMode3d(true)}>Carte 3D</button>
              <button type="button" aria-pressed={!mode3d} onClick={() => { setMode3d(false); setRotation(false); }}>
                Carte 2D
              </button>
            </div>
            <div className="segments" role="group" aria-label="Couche affichée">
              <button type="button" aria-pressed={couche === "score"} onClick={() => setCouche("score")}>Score de risque</button>
              <button type="button" aria-pressed={couche === "eau"} onClick={() => setCouche("eau")}>Eau détectée (satellite)</button>
            </div>
            {mode3d && (
              <button type="button" className="bouton-secondaire" aria-pressed={rotation} onClick={() => setRotation((r) => !r)}>
                {rotation ? "Arrêter la rotation" : "Rotation automatique"}
              </button>
            )}
          </div>
          <div className="carte">
            {communes && (
              <Carte communes={communes} selection={selection} onSelection={setSelection}
                     mode3d={mode3d} couche={couche} rotation={rotation} />
            )}
            {!communes && !erreur && <p className="etat">Chargement des communes…</p>}
            {erreur && <p className="etat erreur">Impossible de charger les données : {erreur}</p>}
          </div>
          <Legende mode3d={mode3d} couche={couche} />
        </section>

        <aside className="bloc bloc-fiche" aria-live="polite">
          {communes && <SelecteurCommune communes={proprietes} selection={selection} onSelection={setSelection} />}
          {commune ? (
            <>
              <Fiche c={commune} />
              {/* key = commune : l'explication et le chat repartent de zéro à chaque changement de commune */}
              <Explication key={`explication-${commune.commune}`} commune={commune} toutes={proprietes} />
              <Chat key={`chat-${commune.commune}`} commune={commune} toutes={proprietes} />
            </>
          ) : (
            <p className="discret">Choisissez une commune dans la liste ou cliquez sur la carte.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
