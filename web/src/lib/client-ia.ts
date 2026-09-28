// Appels aux fonctions serveur de l'IA depuis le navigateur.
// Si le serveur est injoignable, la réponse pré-rédigée est construite ici, à partir des données déjà chargées.
import { donneesIA, reponseSecours, secoursChat } from "./ia";
import type { ProprietesCommune } from "./risque";
import type { ReponseIA } from "./serveur-ia";

export type { ReponseIA };
export type MessageChat = { role: "user" | "assistant"; content: string };

/** Le serveur coupe Groq à 5 s ; on laisse une marge pour le réseau avant de basculer en local. */
const DELAI_CLIENT_MS = 12_000;

async function appeler(chemin: string, corps: unknown): Promise<ReponseIA> {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_CLIENT_MS);
  try {
    const r = await fetch(chemin, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps), signal: arret.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as ReponseIA;
  } finally {
    clearTimeout(minuterie);
  }
}

export async function demanderExplication(p: ProprietesCommune, toutes: ProprietesCommune[]): Promise<ReponseIA> {
  try {
    return await appeler("/api/expliquer", { commune: p.commune });
  } catch {
    return {
      texte: reponseSecours(donneesIA(p, toutes)), source: "secours",
      note: "Réponse pré-rédigée affichée car le serveur de l'assistant IA est injoignable.",
    };
  }
}

export async function demanderReponse(
  p: ProprietesCommune, toutes: ProprietesCommune[], question: string, historique: MessageChat[],
): Promise<ReponseIA> {
  try {
    return await appeler("/api/chat", { commune: p.commune, question, historique });
  } catch {
    return { texte: secoursChat(donneesIA(p, toutes), "serveur injoignable"), source: "secours", note: "" };
  }
}
