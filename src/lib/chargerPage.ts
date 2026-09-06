import { lazy, type ComponentType } from "react";

/**
 * `React.lazy` avec UN réessai.
 *
 * 🔴 POURQUOI. Sur o2switch, une rafale de ~80 requêtes depuis une même IP
 *    rend HTTP 429 sur TOUS les fichiers pendant quelques secondes ; en 4G
 *    malgache, derrière l'IP partagée d'un opérateur, plusieurs visiteurs
 *    partagent ce compteur. Un `import()` refusé une fois est presque toujours
 *    accepté 1,5 s plus tard. Sans réessai, c'était l'écran d'erreur
 *    (journal_erreurs #10-14 du 05/09/2026 : cinq écrans en deux minutes pour
 *    un seul visiteur Samsung A15).
 *
 * ⚠ UN SEUL réessai : au deuxième échec on laisse l'erreur remonter — c'est
 *   `main.tsx` qui décide alors de recharger (une fois par session) ou de
 *   montrer l'ErrorBoundary. Réessayer en boucle transformerait une coupure
 *   en page qui clignote.
 *
 * ⚠ `m.default` est contrôlé : un module sans export par défaut (fichier
 *   servi en HTML par le repli SPA d'o2switch quand le hachage a changé) doit
 *   échouer franchement ici, pas dans le rendu de React.
 */
/**
 * 🔴 VITE NE REDEMANDE JAMAIS LE CSS D'UN MORCEAU DIFFERE. Son assistant
 *    de prechargement marque l'URL « deja tentee » AVANT de creer le <link>
 *    (`Fr[l]=!0` dans le bundle en ligne) : un echec reseau sur
 *    `maps-vendor-*.css` ouvrait /carte SANS le CSS de Leaflet — carte
 *    disloquee, aucune erreur, et un reessai qui ne change rien. On retire donc
 *    le lien mort et on en repose un nous-memes avant de rejouer l'import.
 */
async function reposerCss(url: string) {
  try {
    const fichier = url.replace(/^.*\//, "");
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((l) => {
      if (l.href.endsWith(fichier)) l.remove();
    });
    await new Promise<void>((resolve) => {
      const lien = document.createElement("link");
      lien.rel = "stylesheet";
      lien.href = url;
      lien.onload = () => resolve();
      lien.onerror = () => resolve();
      document.head.appendChild(lien);
      // Jamais bloquant : au pire on rejoue l'import sans attendre le CSS.
      setTimeout(resolve, 3000);
    });
  } catch {
    /* le reessai a lieu de toute facon */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- même signature que React.lazy
export function chargerPage<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  attenteMs = 1500
) {
  return lazy(async () => {
    try {
      const m = await importer();
      if (!m || !m.default) throw new Error("module sans export default");
      return m;
    } catch (premiere) {
      const message = premiere instanceof Error ? premiere.message : String(premiere);
      const css = /Unable to preload CSS for (\S+)/i.exec(message);
      if (css) await reposerCss(css[1]);
      await new Promise((r) => setTimeout(r, attenteMs));
      try {
        const m = await importer();
        if (!m || !m.default) throw new Error("module sans export default");
        return m;
      } catch {
        throw premiere;
      }
    }
  });
}
