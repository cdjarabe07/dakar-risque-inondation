import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Sur Vercel, les fonctions api/ sont exécutées par Node en modules ES, sans regroupement : un import relatif
// sans extension (« ./ia » au lieu de « ./ia.js ») fait planter la fonction au chargement (ERR_MODULE_NOT_FOUND).
const CODE_SERVEUR = ["api/expliquer.ts", "api/chat.ts", "src/lib/serveur-ia.ts", "src/lib/ia.ts",
  "src/lib/comparaison.ts", "src/lib/fiabilite.ts", "src/lib/risque.ts"];

describe("code exécuté par les fonctions Vercel", () => {
  it.each(CODE_SERVEUR)("%s : tous les imports relatifs portent l'extension .js", (fichier) => {
    const source = readFileSync(join(__dirname, "..", "..", fichier), "utf8");
    const sansExtension = [...source.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)].map((m) => m[1]).filter((c) => !c.endsWith(".js"));
    expect(sansExtension).toEqual([]);
  });
});
