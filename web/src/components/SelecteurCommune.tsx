import { useId, useMemo, useRef, useState } from "react";
import { normaliser } from "../lib/fiabilite";
import type { ProprietesCommune } from "../lib/risque";

interface Props {
  communes: ProprietesCommune[];
  selection: string | null;
  onSelection: (commune: string) => void;
  label?: string;
}

/** Liste de recherche : au clic, la saisie est vide et les 53 communes s'affichent ; la frappe filtre
 *  depuis zéro (sans accents) ; flèches + Entrée pour choisir, Échap pour fermer. */
export default function SelecteurCommune({ communes, selection, onSelection, label = "Commune" }: Props) {
  const id = useId();
  const champ = useRef<HTMLInputElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [actif, setActif] = useState(0);

  const triees = useMemo(() => [...communes].sort((a, b) => a.commune.localeCompare(b.commune, "fr")), [communes]);
  const filtrees = useMemo(
    () => triees.filter((c) => normaliser(c.commune).includes(normaliser(saisie.trim()))),
    [triees, saisie],
  );

  const choisir = (c: ProprietesCommune) => {
    onSelection(c.commune);
    setOuvert(false);
    setSaisie("");
    champ.current?.blur();
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOuvert(true);
      setActif((i) => Math.min(i + 1, filtrees.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtrees[actif]) {
      e.preventDefault();
      choisir(filtrees[actif]);
    } else if (e.key === "Escape") {
      setOuvert(false);
      setSaisie("");
      champ.current?.blur();
    }
  };

  return (
    <div className="selecteur">
      <label htmlFor={`${id}-champ`}>{label}</label>
      <input
        ref={champ}
        id={`${id}-champ`}
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={`${id}-liste`}
        aria-activedescendant={ouvert && filtrees[actif] ? `${id}-${actif}` : undefined}
        autoComplete="off"
        value={ouvert ? saisie : selection ?? ""}
        placeholder={selection ?? "Rechercher une commune"}
        onFocus={() => { setOuvert(true); setSaisie(""); setActif(0); }}
        onBlur={() => { setOuvert(false); setSaisie(""); }}
        onChange={(e) => { setSaisie(e.target.value); setActif(0); setOuvert(true); }}
        onKeyDown={auClavier}
      />
      {ouvert && (
        <ul id={`${id}-liste`} role="listbox" className="selecteur-liste">
          {filtrees.map((c, i) => (
            <li
              key={c.commune}
              id={`${id}-${i}`}
              role="option"
              aria-selected={c.commune === selection}
              className={i === actif ? "actif" : undefined}
              // mousedown plutôt que click : l'option est choisie avant que le champ ne perde le focus
              onMouseDown={(e) => { e.preventDefault(); choisir(c); }}
              onMouseEnter={() => setActif(i)}
            >
              <span>{c.commune}</span>
              <span className="discret">rang {c.rang}</span>
            </li>
          ))}
          {filtrees.length === 0 && <li className="discret aucune">Aucune commune ne correspond</li>}
        </ul>
      )}
    </div>
  );
}
