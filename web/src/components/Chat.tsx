import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { demanderReponse, type MessageChat } from "../lib/client-ia";
import { LONGUEUR_MAX_QUESTION } from "../lib/ia";
import type { ProprietesCommune } from "../lib/risque";

const EXEMPLES = ["Pourquoi ce classement ?", "Quelles sont les limites des données ?", "Que faire chez moi en cas de forte pluie ?"];

/** Questions libres sur la commune sélectionnée. Le composant est recréé à chaque changement de commune
 *  (clé = nom de la commune dans App), ce qui remet la conversation à zéro. */
export default function Chat({ commune, toutes }: { commune: ProprietesCommune; toutes: ProprietesCommune[] }) {
  const [messages, setMessages] = useState<MessageChat[]>([]);
  const [question, setQuestion] = useState("");
  const [enCours, setEnCours] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => { fin.current?.scrollIntoView({ block: "nearest" }); }, [messages, enCours]);

  const envoyer = async (texte: string) => {
    const q = texte.trim();
    if (!q || enCours) return;
    const historique = messages;
    setMessages([...historique, { role: "user", content: q }]);   // la question s'affiche tout de suite
    setQuestion("");
    setEnCours(true);
    const r = await demanderReponse(commune, toutes, q, historique);
    setMessages((m) => [...m, { role: "assistant", content: r.texte }]);
    setEnCours(false);
  };

  return (
    <section className="chat" aria-label={`Questions sur ${commune.commune}`}>
      <h3>Questions sur {commune.commune}</h3>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && (
          <p className="discret">Posez une question sur cette commune : l'assistant répond à partir des seules données de l'observatoire.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bulle bulle-${m.role === "user" ? "utilisateur" : "assistant"}`}>
            {m.role === "user" ? m.content : <Markdown texte={m.content} />}
          </div>
        ))}
        {enCours && <div className="bulle bulle-assistant discret">L'assistant rédige sa réponse…</div>}
        <div ref={fin} />
      </div>
      <form className="chat-saisie" onSubmit={(e) => { e.preventDefault(); void envoyer(question); }}>
        <input
          aria-label="Votre question"
          placeholder="Ex. : Pourquoi ce classement ?"
          value={question}
          maxLength={LONGUEUR_MAX_QUESTION}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={enCours || !question.trim()}>Envoyer</button>
      </form>
      <div className="exemples">
        {EXEMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => void envoyer(ex)} disabled={enCours}>{ex}</button>
        ))}
      </div>
    </section>
  );
}
