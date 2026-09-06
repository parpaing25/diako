import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours de bout en bout (e2e/) — LECTURE SEULE.
 *
 * ⚠ Ces tests parlent à la base de PRODUCTION (il n'y a pas d'autre base) :
 *   ils ne créent aucun compte, ne publient rien, n'écrivent rien. Les
 *   parcours en écriture se jouent à la main (docs/audit-lancement/07).
 * ⚠ Agent utilisateur Android réel : Chromium nu reçoit une page 429 chez
 *   o2switch quand on vise la production ; ici on vise `vite preview`, mais
 *   la règle vaut pour toute mesure (CLAUDE.md, 05/09/2026).
 */
export default defineConfig({
  testDir: "e2e",
  // ⚠ `.e2e.ts` et non `.spec.ts` : vitest ramasse `*.spec.ts` par défaut et
  //   plantait sur ces fichiers (4 fichiers en échec le 06/09).
  testMatch: /.*\.e2e\.ts$/,
  timeout: 45_000,
  /* 🔴 UN SEUL OUVRIER. En parallele (3 par defaut), la suite rendait 4
     echecs sur 15 le 06/09/2026 — puis 2 AUTRES au passage suivant, et 15/15
     avec --workers=1 en 41 s. Trois Chromium plus le serveur de previsualisation
     ne tiennent pas dans la memoire de ce poste, et les appels partent tous
     vers la MEME base de production. Une suite qui echoue au hasard
     s'apprend a ignorer : elle ne vaut plus rien. Le gain de temps ne
     justifiait pas ca (1 min 20 contre 41 s). */
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Pixel 7"],
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4173 --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
