// Logique serveur de l'IA (utilisée par les fonctions Vercel api/expliquer.ts et api/chat.ts).
// La clé Groq ne quitte jamais le serveur : elle est lue dans process.env.GROQ_API_KEY.
import {
  construirePrompt, DELAI_MAX_MS, donneesIA, LONGUEUR_MAX_QUESTION, MODELE, NB_MESSAGES_HISTORIQUE,
  reponseSecours, secoursChat, SYSTEME, systemeChat, type DonneesIA,
} from "./ia.js";
import type { CollectionCommunes, ProprietesCommune } from "./risque.js";

export interface ReponseIA {
  texte: string;
  source: "groq" | "secours";
  /** Mention affichée en petit sous la réponse (modèle et durée, ou motif du secours). */
  note: string;
}

type Message = { role: "system" | "user" | "assistant"; content: string };
type Fetch = typeof fetch;

// Les modèles gpt-oss écrivent des tirets et espaces insécables que certains affichages font disparaître
const nettoyer = (t: string) => t.replace(/[‑‐]/g, "-").replace(/[  ]/g, " ").trim();

/** Appel à Groq coupé au bout de `delai` ms au total. Renvoie le texte, ou le motif d'échec. */
export async function appelGroq(messages: Message[], maxTokens: number, options: {
  cle?: string; delai?: number; fetch?: Fetch;
} = {}): Promise<{ texte: string } | { raison: string }> {
  const cle = options.cle ?? process.env.GROQ_API_KEY;
  if (!cle) return { raison: "clé GROQ_API_KEY absente" };
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), options.delai ?? DELAI_MAX_MS);
  try {
    const r = await (options.fetch ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        model: MODELE, messages, temperature: 0.3, max_completion_tokens: maxTokens, reasoning_effort: "low",
      }),
      signal: arret.signal,
    });
    if (r.status === 401) return { raison: "clé API refusée" };
    if (r.status === 429) return { raison: "trop de requêtes en peu de temps, réessayez dans une minute" };
    if (!r.ok) return { raison: `erreur HTTP ${r.status}` };
    const json = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const texte = nettoyer(json.choices?.[0]?.message?.content ?? "");
    return texte ? { texte } : { raison: "réponse vide" };
  } catch (e) {
    return { raison: (e as Error).name === "AbortError" ? "timeout" : `erreur ${(e as Error).name}` };
  } finally {
    clearTimeout(minuterie);
  }
}

// --- Données : relues côté serveur à partir du nom de la commune (jamais fournies par le client) ---

let cacheDonnees: ProprietesCommune[] | null = null;

export async function chargerDonneesServeur(urlRequete: string, fetchImpl: Fetch = fetch): Promise<ProprietesCommune[]> {
  if (!cacheDonnees) {
    const r = await fetchImpl(new URL("/data/communes.geojson", urlRequete));
    if (!r.ok) throw new Error(`données introuvables (${r.status})`);
    cacheDonnees = ((await r.json()) as CollectionCommunes).features.map((f) => f.properties);
  }
  return cacheDonnees;
}

export function viderCacheDonnees() { cacheDonnees = null; }

// --- Limite par visiteur (protège le quota Groq) -------------------------------------------------
// En mémoire : chaque instance de fonction compte séparément, c'est donc une protection « au mieux ».

export const LIMITE_PAR_MINUTE = 10;
const appels = new Map<string, number[]>();

export function depasseLimite(visiteur: string, maintenant = Date.now()): boolean {
  const recents = (appels.get(visiteur) ?? []).filter((t) => maintenant - t < 60_000);
  const depasse = recents.length >= LIMITE_PAR_MINUTE;
  if (!depasse) recents.push(maintenant);
  appels.set(visiteur, recents);
  return depasse;
}

export function viderLimites() { appels.clear(); }

const visiteur = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "inconnu";

const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json; charset=utf-8" } });

const RAISON_LIMITE = "trop de requêtes en peu de temps, réessayez dans une minute";

async function lireRequete(req: Request, fetchImpl: Fetch): Promise<{ d: DonneesIA; corps: Record<string, unknown> } | Response> {
  if (req.method !== "POST") return json({ erreur: "méthode non autorisée" }, 405);
  let corps: Record<string, unknown>;
  try {
    corps = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ erreur: "corps JSON invalide" }, 400);
  }
  const toutes = await chargerDonneesServeur(req.url, fetchImpl);
  const p = toutes.find((c) => c.commune === corps.commune);
  if (!p) return json({ erreur: "commune inconnue" }, 400);
  return { d: donneesIA(p, toutes), corps };
}

/** POST /api/expliquer {commune} → explication du risque (Groq, ou texte pré-rédigé). */
export async function traiterExplication(req: Request, options: { fetch?: Fetch; cle?: string; delai?: number } = {}) {
  const lu = await lireRequete(req, options.fetch ?? fetch);
  if (lu instanceof Response) return lu;
  const { d } = lu;
  const secours = (raison: string): ReponseIA => ({
    texte: reponseSecours(d), source: "secours",
    note: `Réponse pré-rédigée affichée car l'assistant IA n'a pas répondu (${raison}).`,
  });
  if (depasseLimite(visiteur(req))) return json(secours(RAISON_LIMITE));
  const t0 = Date.now();
  const r = await appelGroq(
    [{ role: "system", content: SYSTEME }, { role: "user", content: construirePrompt(d) }], 900, options);
  if ("raison" in r)
    return json(secours(r.raison === "timeout" ? `pas de réponse en ${Math.round((options.delai ?? DELAI_MAX_MS) / 1000)} s` : r.raison));
  return json({
    texte: r.texte, source: "groq",
    note: `Généré par IA (${MODELE} via Groq) en ${((Date.now() - t0) / 1000).toFixed(1)} s, à partir des seules données de l'observatoire.`,
  } satisfies ReponseIA);
}

/** POST /api/chat {commune, question, historique} → réponse à une question libre sur la commune. */
export async function traiterChat(req: Request, options: { fetch?: Fetch; cle?: string; delai?: number } = {}) {
  const lu = await lireRequete(req, options.fetch ?? fetch);
  if (lu instanceof Response) return lu;
  const { d, corps } = lu;
  const question = String(corps.question ?? "").trim().slice(0, LONGUEUR_MAX_QUESTION);
  if (!question) return json({ erreur: "question vide" }, 400);
  // Historique : 3 derniers échanges, rôles et longueurs contrôlés
  const historique: Message[] = (Array.isArray(corps.historique) ? corps.historique : [])
    .slice(-NB_MESSAGES_HISTORIQUE)
    .filter((m): m is Message => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .filter((m) => m.content.trim());

  const secours = (raison: string): ReponseIA => ({ texte: secoursChat(d, raison), source: "secours", note: "" });
  if (depasseLimite(visiteur(req))) return json(secours(RAISON_LIMITE));
  const r = await appelGroq(
    [{ role: "system", content: systemeChat(d) }, ...historique, { role: "user", content: question }], 700, options);
  if ("raison" in r) return json(secours(r.raison));
  return json({ texte: r.texte, source: "groq", note: "" } satisfies ReponseIA);
}
