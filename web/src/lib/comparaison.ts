// Comparaison de 2 ou 3 communes : même logique et mêmes textes que app.py
// (_percentile_exposition, attribuer_couleurs, tableau_comparaison, synthese_comparaison). Parité vérifiée par test.
import { explicationConfiance } from "./fiabilite";
import { NB_COMMUNES, type ProprietesCommune } from "./risque";

export const MAX_COMPARAISON = 3;
/** Couleurs d'identité (palette catégorielle validée pour le daltonisme), distinctes de la palette du risque. */
export const COULEURS_COMPARAISON = ["#2a78d6", "#eb6834", "#1baf7a"];

/** Arrondi à la manière de Python (f"{x:.nf}"), qui travaille sur la valeur binaire exacte :
 *  0.05 (stocké 0.0500000000000000027…) → « 0.1 », mais une vraie demi-unité va au chiffre pair (2.5 → « 2 »).
 *  toFixed travaille aussi sur la valeur exacte ; il ne diffère de Python que sur les demi-unités exactes. */
export function arrondiPython(v: number, decimales: number): string {
  const exact = Math.abs(v).toFixed(decimales + 30);           // développement décimal exact du double
  const apres = exact.slice(exact.indexOf(".") + 1 + decimales);
  if (!/^50*$/.test(apres)) return v.toFixed(decimales);        // pas une demi-unité exacte : même résultat
  const tronque = exact.slice(0, exact.indexOf(".") + 1 + decimales).replace(/\.$/, "");
  const dernier = Number(tronque[tronque.length - 1]);
  const f = 10 ** decimales;
  const base = Number(tronque);
  const resultat = dernier % 2 === 0 ? base : base + 1 / f;     // demi-unité : vers le chiffre pair
  return (Math.sign(v) * resultat).toFixed(decimales);
}

/** Pour l'affichage : virgule décimale française. */
export const nombreFr = (v: number, decimales: number) => arrondiPython(v, decimales).replace(".", ",");

export type Indicateur = "altitude" | "cuvettes" | "eau";

/** Position 0-100 de chaque commune sur chaque indicateur : 0 = la moins exposée des 53, 100 = la plus exposée
 *  (part des communes moins exposées ; les ex aequo en bas, ex. 0 % d'eau, restent à 0). */
export function percentilesExposition(communes: ProprietesCommune[]): Record<Indicateur, Map<string, number>> {
  const calcul = (exposition: (c: ProprietesCommune) => number) => {
    const valeurs = communes.map(exposition);
    return new Map(communes.map((c) => {
      const v = exposition(c);
      return [c.commune, (100 * valeurs.filter((w) => w < v).length) / (communes.length - 1)];
    }));
  };
  return {
    altitude: calcul((c) => -c.alt_mediane_m),   // sol bas = plus exposé
    cuvettes: calcul((c) => c.pct_depression),
    eau: calcul((c) => c.pct_eau_stagnante_moyen),
  };
}

/** La couleur suit la commune, pas sa position : retirer une commune ne repeint pas les autres. */
export function attribuerCouleurs(selection: string[], precedentes: Record<string, number> = {}): Record<string, number> {
  const couleurs: Record<string, number> = Object.fromEntries(
    Object.entries(precedentes).filter(([c]) => selection.includes(c)));
  for (const c of selection) {
    if (!(c in couleurs)) {
      const prises = new Set(Object.values(couleurs));
      couleurs[c] = [...Array(MAX_COMPARAISON).keys()].find((i) => !prises.has(i))!;
    }
  }
  return couleurs;
}

export function avertissements(c: ProprietesCommune): string[] {
  const a: string[] = [];
  if (!c.classement_robuste)
    a.push(`classement incertain (rang ${c.rang} au score complet, ${c.rang_altitude_seule} avec l'altitude seule)`);
  if (c.alerte_detection_s1)
    a.push("aucune eau détectée par satellite : limite du radar en bâti dense, pas une preuve d'absence d'inondation");
  return a;
}

/** Lignes du tableau : [indicateur, valeur pour chaque commune]. */
export function lignesTableau(donnees: ProprietesCommune[]): [string, string[]][] {
  return [
    ["Niveau de confiance", donnees.map(explicationConfiance)],
    ["Classe de risque", donnees.map((d) => d.classe_risque)],
    ["Score de risque (0-100)", donnees.map((d) => arrondiPython(d.score_risque, 0))],
    ["Rang (1 = le plus exposé)", donnees.map((d) => `${d.rang} / ${NB_COMMUNES}`)],
    ["Altitude médiane du sol", donnees.map((d) => `${nombreFr(d.alt_mediane_m, 1)} m`)],
    ["Surface en cuvette", donnees.map((d) => `${arrondiPython(d.pct_depression, 0)} %`)],
    ["Eau stagnante détectée (satellite)", donnees.map((d) => `${nombreFr(d.pct_eau_stagnante_moyen, 2)} %`)],
    ["Eau permanente", donnees.map((d) => `${nombreFr(d.pct_eau_permanente, 1)} %`)],
    ["Surface terrestre", donnees.map((d) => `${nombreFr(d.surface_km2, 1)} km²`)],
    ["Fiabilité du classement", donnees.map((d) =>
      d.classement_robuste ? "Stable" : `Incertain (rang ${d.rang} → ${d.rang_altitude_seule} selon les indicateurs)`)],
    ["Détection satellite", donnees.map((d) =>
      d.alerte_detection_s1 ? "Aucune eau détectée (limite radar en bâti dense)" : "Eau détectée")],
  ];
}

/** « A », « A et B », « A, B et C ». */
export function enumerer(noms: string[]): string {
  return noms.length === 1 ? noms[0] : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

const NOMS_INDICATEURS: Record<Indicateur, string> = {
  altitude: "l'altitude du sol",
  cuvettes: "la part de surface en cuvette",
  eau: "l'eau détectée par satellite",
};

/** Synthèse conditionnelle (sans IA), avec des **gras** au format Markdown comme dans app.py. */
export function syntheseComparaison(donnees: ProprietesCommune[], pct: Record<Indicateur, Map<string, number>>): string {
  const tri = [...donnees].sort((a, b) => b.score_risque - a.score_risque);
  const [premier, ...suivants] = tri;
  const parties = [
    `**${tri.length} communes comparées** : **${premier.commune}** a le score le plus élevé ` +
      `(${arrondiPython(premier.score_risque, 0)}/100, rang ${premier.rang}), suivie de ` +
      suivants.map((d) => `**${d.commune}** (${arrondiPython(d.score_risque, 0)}/100, rang ${d.rang})`).join(" puis de ") + ".",
  ];

  const ecart = premier.score_risque - tri[1].score_risque;
  if (ecart < 10)
    parties.push(`L'écart entre ${premier.commune} et ${tri[1].commune} n'est que de ${arrondiPython(ecart, 0)} points : ` +
      "à ce niveau de précision, leur exposition est à considérer comme proche.");

  // Indicateur qui sépare le plus la commune la plus exposée de la moins exposée
  const dernier = tri[tri.length - 1];
  const ecarts = (["altitude", "cuvettes", "eau"] as Indicateur[]).map(
    (k) => [k, pct[k].get(premier.commune)! - pct[k].get(dernier.commune)!] as const);
  const [cle, maxEcart] = ecarts.reduce((m, e) => (e[1] > m[1] ? e : m));
  if (maxEcart > 15) {
    const valeur = (d: ProprietesCommune) =>
      cle === "altitude" ? `${nombreFr(d.alt_mediane_m, 1)} m`
      : cle === "cuvettes" ? `${arrondiPython(d.pct_depression, 0)} %`
      : `${nombreFr(d.pct_eau_stagnante_moyen, 2)} %`;
    parties.push(`La différence entre ${premier.commune} et ${dernier.commune} tient surtout à ` +
      `${NOMS_INDICATEURS[cle]} (${valeur(premier)} contre ${valeur(dernier)}).`);
  }
  const contraires = ecarts.filter(([, v]) => v < -15).map(([k]) => NOMS_INDICATEURS[k]);
  if (contraires.length)
    parties.push(`À l'inverse, ${dernier.commune} est plus exposée sur ${enumerer(contraires)}.`);

  const incertains = tri.filter((d) => !d.classement_robuste).map((d) => d.commune);
  const radar = tri.filter((d) => d.alerte_detection_s1).map((d) => d.commune);
  if (incertains.length || radar.length) {
    const prudence: string[] = [];
    if (incertains.length)
      prudence.push((incertains.length === 1 ? "le classement de " : "les classements de ") + enumerer(incertains) +
        (incertains.length === 1 ? " est incertain" : " sont incertains"));
    if (radar.length)
      prudence.push(`aucune eau n'a été détectée par satellite à ${enumerer(radar)}, ce qui peut refléter la limite du radar en bâti dense`);
    parties.push(`**Attention** : ${prudence.join(" ; ")}.`);
  } else {
    parties.push("Les classements de ces communes sont stables selon les indicateurs retenus.");
  }
  return parties.join(" ");
}
