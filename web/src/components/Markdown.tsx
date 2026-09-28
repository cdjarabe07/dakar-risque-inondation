import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Texte Markdown du modèle (gras, listes, tableaux). Le HTML brut n'est pas interprété : aucune injection possible. */
export default function Markdown({ texte }: { texte: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{texte}</ReactMarkdown>
    </div>
  );
}
