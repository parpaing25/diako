# 03-01 — P0 · Un morceau JS refusé (429, coupure) ne doit plus finir en écran d'erreur

**Constat (02-OP1).** `journal_erreurs` #10–14 (05/09, Samsung A15, 4G) et #8–9 (bingbot) : « Cannot read properties of undefined (reading 'default') » à `Lazy`. Le fichier existe bien en ligne (`/assets/Gouts-BDhAYm79.js` → 200 `application/javascript`) : il a été **refusé à ce visiteur-là** (429 du limiteur o2switch, ou coupure 4G). Le gestionnaire `surModuleAbsent` (`src/main.tsx:35-45`) appelle `e.preventDefault()` dans tous les cas ; or, pour Vite, `preventDefault()` sur `vite:preloadError` signifie « n'émets pas l'erreur » : l'`import()` résout alors `undefined`, et `React.lazy` plante en lisant `.default`. Après le seul rechargement autorisé par session, chaque nouvel échec devient un écran « Recharger » — cinq fois en deux minutes pour ce visiteur.

**Correctif en trois parties.** (1) Réessayer l'import une fois après 1,5 s (le temps que le limiteur se relâche) ; (2) ne neutraliser l'événement **que** si l'on recharge ; (3) ne pas cacher la cause : journaliser « morceau refusé » avec le statut.

## 1. `src/lib/chargerPage.ts` (nouveau)

```ts
import { lazy, type ComponentType } from "react";

/**
 * `React.lazy` avec UN réessai.
 *
 * 🔴 POURQUOI. Sur o2switch, une rafale de ~80 requêtes depuis une IP rend 429
 *    sur TOUS les fichiers pendant quelques secondes ; en 4G malgache derrière un
 *    CGNAT, plusieurs visiteurs partagent ce compteur. Un `import()` refusé une
 *    fois est presque toujours accepté 1,5 s plus tard. Sans réessai, l'écran
 *    d'erreur s'affichait (journal_erreurs #10-14, 05/09/2026).
 *
 * ⚠ Un seul réessai : au deuxième échec on laisse l'erreur remonter — c'est
 *   `main.tsx` qui décide alors de recharger (une fois par session) ou de
 *   montrer l'ErrorBoundary.
 */
export function chargerPage<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
  attenteMs = 1500
) {
  return lazy(async () => {
    try {
      const m = await importer();
      if (!m || !m.default) throw new Error("module sans export default");
      return m;
    } catch (premiere) {
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
```

## 2. `src/App.tsx` — remplacer `lazy(() => import(...))` par `chargerPage(() => import(...))`

```diff
-import { lazy, Suspense } from "react";
+import { Suspense } from "react";
+import { chargerPage } from "@/lib/chargerPage";
 ...
-const Auth = lazy(() => import("./pages/Auth"));
+const Auth = chargerPage(() => import("./pages/Auth"));
```
(même remplacement pour les 30 déclarations `lazy(` de `src/App.tsx:21-51` — `sed -i 's/= lazy(() => import/= chargerPage(() => import/' src/App.tsx`.)

## 3. `src/main.tsx:35-45` — ne neutraliser l'événement que si l'on recharge

```diff
 function surModuleAbsent(e: Event) {
-  e.preventDefault();
   try {
-    if (sessionStorage.getItem(CLE_RECHARGE)) return;
+    if (sessionStorage.getItem(CLE_RECHARGE)) return; // 2e échec : l'erreur remonte, l'ErrorBoundary prend la main
     sessionStorage.setItem(CLE_RECHARGE, "1");
   } catch {
-    // Navigation privée sans stockage : on ne recharge pas plutôt que risquer
-    // une boucle qu'on ne saurait plus arrêter.
     return;
   }
+  // ⚠ preventDefault SEULEMENT ici : pour Vite il veut dire « ne lève pas
+  //   l'erreur », et l'import résout alors `undefined` — ce qui donnait
+  //   « reading 'default' » dans React.lazy quand on ne rechargeait pas.
+  e.preventDefault();
   window.location.reload();
 }
```

## 4. `src/components/ErrorBoundary.tsx` — dire la vraie cause

Dans `componentDidCatch`, si `error.message` contient `dynamically imported module` ou `reading 'default'`, journaliser `source: "chunk"` et afficher : « La connexion a été coupée pendant le chargement. Réessayez : ça marche presque toujours du deuxième coup. » (le bouton « Recharger » existant reste).

## 5. Côté serveur — la vraie cause (à faire en parallèle, hors code)

- **cPanel o2switch → Outils → TigerProtect → Gérer les règles de sécurité → domaine `diako.fonenako.mg` → « Sécurité par défaut o2switch » : Off** (ou demander au support un seuil ≥ 600 requêtes/min/IP, en expliquant le CGNAT mobile malgache).
- **Cloudflare (plan gratuit) devant l'origine** : les 40 fichiers d'une page sont servis depuis le cache Cloudflare, o2switch ne voit plus qu'`index.html` et les appels PHP. Réglages : proxy orange sur `diako`, SSL « Full (strict) », règle de cache `/assets/*` et `/uploads/*` = « Cache Everything, 1 an », `/sitemap.xml` et `/partage.php` = bypass. HTTP/3 activé. Cela répond aussi à PF4.

## Vérification

1. `npm run typecheck && npm run lint && npm test` (jamais en parallèle d'un `vite build`).
2. En local : DevTools → Network → bloquer `Gouts-*.js` → ouvrir `/gouts` : le réessai doit réussir après avoir débloqué dans les 1,5 s ; sinon, l'écran d'erreur affiche le nouveau message.
3. Après déploiement : `python scripts/verifier_deploiement.py` puis, 24 h plus tard, `select count(*) from journal_erreurs where message like '%reading ''default''%' and created_at > now() - interval '1 day'` → attendu : 0.
