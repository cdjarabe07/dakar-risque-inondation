import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** En développement uniquement : exécute les fonctions api/*.ts (les mêmes que sur Vercel) derrière /api/…
 *  La clé Groq est lue dans la variable d'environnement GROQ_API_KEY du terminal qui lance `npm run dev`. */
function apiLocale(): Plugin {
  return {
    name: 'api-locale',
    configureServer(serveur) {
      serveur.middlewares.use(async (req, res, suite) => {
        const route = req.url?.match(/^\/api\/(expliquer|chat)$/)
        if (!route) return suite()
        try {
          const module = await serveur.ssrLoadModule(`/api/${route[1]}.ts`)
          const morceaux: Buffer[] = []
          for await (const m of req) morceaux.push(m as Buffer)
          const entetes = Object.entries(req.headers).filter((e): e is [string, string] => typeof e[1] === 'string')
          const requete = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: entetes,
            body: req.method === 'POST' ? Buffer.concat(morceaux) : undefined,
          })
          const reponse: Response = await module.POST(requete)
          res.statusCode = reponse.status
          reponse.headers.forEach((valeur, cle) => res.setHeader(cle, valeur))
          res.end(Buffer.from(await reponse.arrayBuffer()))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ erreur: (e as Error).message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiLocale()],
  // MapLibre 6 lance son worker comme module ES (new Worker(url, { type: "module" }))
  worker: { format: 'es' },
})
