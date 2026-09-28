// Fonction Vercel : POST /api/chat {commune, question, historique} → réponse à une question libre sur la commune.
// Sur Vercel (Node, modules ES), les imports relatifs doivent porter l'extension .js ;
// TypeScript et Vite la font correspondre au fichier .ts.
import { traiterChat } from "../src/lib/serveur-ia.js";

export function POST(requete: Request): Promise<Response> {
  return traiterChat(requete);
}
