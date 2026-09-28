// Fonction Vercel : POST /api/chat {commune, question, historique} → réponse à une question libre sur la commune.
import { traiterChat } from "../src/lib/serveur-ia";

export function POST(requete: Request): Promise<Response> {
  return traiterChat(requete);
}
