// Fonction Vercel : POST /api/expliquer {commune} → explication du risque par l'IA (ou texte pré-rédigé).
// Sur Vercel (Node, modules ES), les imports relatifs doivent porter l'extension .js ;
// TypeScript et Vite la font correspondre au fichier .ts.
import { traiterExplication } from "../src/lib/serveur-ia.js";

export function POST(requete: Request): Promise<Response> {
  return traiterExplication(requete);
}
