// Fonction Vercel : POST /api/expliquer {commune} → explication du risque par l'IA (ou texte pré-rédigé).
import { traiterExplication } from "../src/lib/serveur-ia";

export function POST(requete: Request): Promise<Response> {
  return traiterExplication(requete);
}
