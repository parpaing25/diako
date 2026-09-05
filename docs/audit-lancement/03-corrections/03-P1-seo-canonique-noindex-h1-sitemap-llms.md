# 03-03 — P1 · SEO : canonique par page, `noindex` sur les écrans privés et les soft-404, h1 de l'accueil, sitemap, `llms.txt`, robots

**Constats (02-SO1, SO2, SO4, SO8, SO9, AC1).** 18 pages gardent le canonique statique de l'accueil ; aucun `noindex` nulle part ; pas de h1 sur `/` ; sitemap avec `/pro`, `/circuits`, `/guides`, `/recherche` ; pas de `llms.txt` ; `/admin` absent de `robots.txt`.

## 1. `src/hooks/useSEO.ts` — option `noindex` et canonique toujours posé

```diff
 export interface MetaSEO {
   titre?: string;
   description?: string;
   image?: string;
   url?: string;
   type?: "website" | "article" | "profile";
+  /** Écran privé, résultat de recherche, page « introuvable » : ne pas indexer. */
+  noindex?: boolean;
 }
 
-export function useSEO({ titre, description, image, url, type = "website" }: MetaSEO) {
+export function useSEO({ titre, description, image, url, type = "website", noindex = false }: MetaSEO) {
   useEffect(() => {
     ...
     canonique.href = adresse;
+
+    // ⚠ `noindex` est posé ET retiré : sans le retrait, une page privée
+    //   visitée avant une fiche laisserait la fiche non indexable.
+    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
+    if (noindex) {
+      if (!robots) {
+        robots = document.createElement("meta");
+        robots.name = "robots";
+        document.head.appendChild(robots);
+      }
+      robots.content = "noindex, follow";
+    } else if (robots) {
+      robots.remove();
+    }
 
     return () => {
       ...
       if (can) can.href = SITE;
+      document.querySelector('meta[name="robots"]')?.remove();
     };
-  }, [titre, description, image, url, type]);
+  }, [titre, description, image, url, type, noindex]);
 }
```

## 2. Poser `useSEO` sur les 18 pages qui ne l'appellent pas

| Page | Appel à ajouter |
|---|---|
| `Index.tsx` | `useSEO({ url: "/" })` (canonique explicite ; titre et description = défauts) |
| `Mentions.tsx` | `useSEO({ titre: "Mentions légales", description: "Éditeur, hébergeur et responsable du traitement de Diako.", url: "/mentions" })` |
| `Confidentialite.tsx` | `useSEO({ titre: "Confidentialité", description: "Quelles données Diako conserve, pourquoi, combien de temps, et vos droits.", url: "/confidentialite" })` |
| `Cgu.tsx` | `useSEO({ titre: "Conditions d'utilisation", description: "Les règles d'usage de Diako : publier, revendiquer une fiche, signaler.", url: "/cgu" })` |
| `Recherche.tsx` | `useSEO({ titre: q ? \`« ${q} »\` : "Rechercher", url: "/recherche", noindex: Boolean(q) })` — la page nue est indexable, les résultats non |
| `NotFound.tsx` | remplacer `useDocumentTitle("Page introuvable")` par `useSEO({ titre: "Page introuvable", noindex: true })` |
| `Auth.tsx`, `Bienvenue.tsx`, `Attente.tsx`, `Compte.tsx`, `Parametres.tsx`, `Favoris.tsx`, `Messages.tsx`, `Notifications.tsx`, `Admin.tsx`, `EspacePro.tsx`, `ProConsole.tsx`, `Publier.tsx` | `useSEO({ titre: "<titre actuel>", noindex: true })` |
| `Profil` (`/user/:id`) | ajouter `noindex: true` à l'appel existant (cohérent avec `Disallow: /user/` — un `Disallow` empêche d'explorer, pas d'indexer l'URL) |
| Fiches introuvables (`PagePro`, `Destination`, `Plat`, `Site`, `Post`, `Circuit` en état `absent`) | `useSEO({ titre: "<Fiche> introuvable", noindex: true })` dans la branche `absent` |

## 3. h1 de l'accueil — `src/pages/Index.tsx`, en tête du contenu (avant le bloc des catégories)

```tsx
{/* Le h1 dit ce qu'est le site en une ligne : c'est la seule page sans titre
    de contenu, et Google comme un lecteur d'écran en ont besoin. Discret
    visuellement (même taille que les titres de section), pas un slogan. */}
<h1 className="px-4 pt-3 text-base font-semibold text-foreground">
  Où dormir, où manger et avec qui partir à Madagascar
</h1>
```
Le `<p>` du squelette statique d'`index.html` qui porte déjà ce texte pour les robots sans JS peut rester : il est retiré au premier rendu (`removeShell`).

## 4. `public/sitemap.php`

```diff
-    ['/',                 '1.0', 'daily',   '2026-08-01'],
+    ['/',                 '1.0', 'daily',   date('Y-m-d')],   // le fil change chaque jour
 ...
-    ['/recherche',        '0.8', 'weekly',  '2026-08-01'],
+    ['/recherche',        '0.5', 'monthly', '2026-08-01'],   // page nue seulement ; les résultats sont noindex
 ...
-    ['/circuits',         '0.4', 'monthly', '2026-08-15'],
+    // ['/circuits' ...]  ← remis quand nav.ts passe pret: true
 ...
-    ['/guides',           '0.4', 'monthly', '2026-08-15'],
+    // ['/guides' ...]    ← idem, 0 guide en base le 05/09/2026
 ...
-    ['/pro',              '0.6', 'monthly', '2026-08-01'],
+    // ['/pro' ...]       ← écran privé (mur de connexion) ; remplacé par /aide#pro (04)
+    ['/a-propos',         '0.6', 'monthly', '2026-09-05'],
+    ['/aide',             '0.6', 'monthly', '2026-09-05'],
```

## 5. `public/robots.txt` — ajouter `Disallow: /admin` dans **chaque** groupe (`*`, GPTBot, ClaudeBot, PerplexityBot, et le 5ᵉ), juste après `Disallow: /parametres`. Ajouter en fin de fichier :

```
Sitemap: https://diako.fonenako.mg/sitemap.xml
```
(vérifier qu'il n'y est pas déjà : `grep -c '^Sitemap' public/robots.txt`).

## 6. `public/llms.txt` (nouveau) — la carte que les agents IA lisent

```
# Diako — voyage et tourisme à Madagascar

> Diako est un annuaire et un réseau social du voyage à Madagascar : hôtels, restaurants,
> agences et loueurs avec leurs tarifs datés en ariary, 508 destinations, 2 451 sites naturels
> et culturels, 95 plats malgaches, récits de voyageurs. Diako met en relation ; il ne vend rien.

## Pages utiles
- [Destinations](https://diako.fonenako.mg/explorer) : où dormir et où manger par région et par ville
- [Quand partir](https://diako.fonenako.mg/quand-partir) : saisons mois par mois, destination par destination
- [Y aller](https://diako.fonenako.mg/y-aller) : temps de route réels entre villes
- [Atlas des plats](https://diako.fonenako.mg/plats) : les plats malgaches et où les manger
- [Sites et parcs](https://diako.fonenako.mg/sites) : parcs nationaux, réserves, plages, patrimoine
- [Carte](https://diako.fonenako.mg/carte)
- [À propos](https://diako.fonenako.mg/a-propos) · [Aide](https://diako.fonenako.mg/aide)

## Données
- Sitemap : https://diako.fonenako.mg/sitemap.xml (fiches /p/, destinations /lieu/, sites /site/, plats /plat/, récits /post/)
- Chaque fiche porte un JSON-LD (LocalBusiness / Hotel / Restaurant / TouristAttraction) avec adresse, téléphone et fourchette de prix quand ils sont connus.
- Les prix sont ceux déclarés par les établissements, datés ; au-delà de 6 mois sans confirmation la fiche affiche « Nous consulter ».

## Ce qu'il ne faut pas faire
- Ne pas présenter Diako comme un site de réservation : il n'y a ni paiement ni disponibilité.
- Les profils de membres (/user/) ne sont pas destinés à l'indexation.
```

## Vérification

```bash
npm run build && node $TEMP/crawl.mjs   # DK_SITE=http://127.0.0.1:8788 : robots ≠ null sur les privées, canonical propre sur /mentions
curl -s https://diako.fonenako.mg/sitemap.xml | grep -c '<loc>https://diako.fonenako.mg/pro</loc>'   # attendu 0
curl -s https://diako.fonenako.mg/llms.txt | head -3
```
Puis Search Console : « Pages → Non indexées → Soft 404 » doit tomber à 0 sous 30 jours.
