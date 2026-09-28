import { useState } from "react";
import Markdown from "./Markdown";
import { demanderExplication, type ReponseIA } from "../lib/client-ia";
import type { ProprietesCommune } from "../lib/risque";

/** Bouton « Expliquer ce risque » : explication générée par l'IA, ou texte pré-rédigé si elle ne répond pas. */
export default function Explication({ commune, toutes }: { commune: ProprietesCommune; toutes: ProprietesCommune[] }) {
  const [reponse, setReponse] = useState<ReponseIA | null>(null);
  const [enCours, setEnCours] = useState(false);

  const expliquer = async () => {
    setEnCours(true);
    setReponse(await demanderExplication(commune, toutes));
    setEnCours(false);
  };

  return (
    <div className="explication">
      <button type="button" className="bouton-principal" onClick={expliquer} disabled={enCours}>
        {enCours ? "Génération en cours…" : "Expliquer ce risque"}
      </button>
      {reponse && (
        <div className="reponse-ia" aria-live="polite">
          <Markdown texte={reponse.texte} />
          {reponse.note && <p className="note-ia">{reponse.note}</p>}
        </div>
      )}
    </div>
  );
}
