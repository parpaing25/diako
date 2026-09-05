# 01 — Cartographie des routes (Phase 1)

**Méthode.** 37 routes lues dans `src/App.tsx` ; 49 URL parcourues le 05/09/2026 avec Chrome piloté (agent utilisateur Android réel, 390 × 844, attente 6,5 s par page) : statut du document, titre, description, canonique, `meta robots`, h1, JSON-LD, sous-requêtes 4xx, erreurs JS, texte d'erreur à l'écran. Le parcours a été fait sur **le build de production servi en local** (`dist/` identique au bundle en ligne, `index-NcW107pc.js`) parce que le limiteur o2switch a rendu **HTTP 429 dès la 3ᵉ page** en parcours direct — ce 429 est lui-même un constat (voir §6). Les vérifications d'en-têtes, de redirections et de DNS ont été faites **sur la production**, espacées.

Sources : `$TEMP/crawl.json` (49 entrées), `$TEMP/crawl.log`, `public/sitemap.php`, `public/robots.txt`, `src/lib/nav.ts`, `src/hooks/useSEO.ts`.

## 1. Constats transversaux (valent pour toutes les routes)

| # | Constat vérifié | Gravité | Preuve |
|---|---|---|---|
| T1 | **Toute URL rend HTTP 200, même inexistante** (SPA sur Apache : `/cette-route-nexiste-pas`, `/p/nexiste-pas-du-tout`, `/assets/nexiste-pas.js`, `/llms.txt` → `200 text/html`). Aucune page ne porte `meta robots noindex` : les écrans « n'existe pas » sont **indexables** (soft 404), et les écrans privés (`/compte`, `/admin`, `/messages`…) aussi. | **P1** | `curl` prod 05/09 ; `crawl.json` : `robots: null` sur 49/49 |
| T2 | **Canonique = page d'accueil sur 18 pages** : toute page qui n'appelle pas `useSEO` garde le `<link rel="canonical" href="https://diako.fonenako.mg/">` statique d'`index.html:24`. Touche `/mentions`, `/cgu`, `/confidentialite`, `/recherche`, `/auth`, `/pro`, `/publier`, `/compte`… Google lit « je suis un doublon de l'accueil » → pages légales et recherche non indexées. | **P1** | `index.html:24`, `crawl.json` (`canonical: "/"`), liste des pages sans `useSEO` : Admin, Attente, Auth, Bienvenue, Cgu, Compte, Confidentialite, EspacePro, Favoris, Index, Mentions, Messages, NotFound, Notifications, Parametres, ProConsole, Publier, Recherche |
| T3 | **Description identique (159 caractères, celle de l'accueil) sur 20 pages** — même cause que T2. | P2 | `crawl.json` `desc=159` |
| T4 | **`www.diako.fonenako.mg` répond 200 sans redirection** vers l'hôte canonique : deux hôtes servent le même contenu. `/explorer/` (barre finale) répond aussi 200 sans redirection. | P2 | `curl -I https://www.diako.fonenako.mg/` → `200`, pas de `Location` |
| T5 | **Aucun h1 sur l'accueil** (2 h2 de pied de page seulement) ; h1 présent sur 44 des 49 pages. | P1 (SEO + a11y) | `crawl.json` `/` `h1: []` ; évaluation Playwright 05/09 |
| T6 | HTTP → HTTPS : 301 ✅. HSTS 1 an `includeSubDomains` sans `preload`. CSP présente (voir 02-Sécurité). | ✅ / P3 | en-têtes prod 05/09 |
| T7 | `/offline.html` (page hors-ligne du service worker) titre **« Hors ligne - Fonenako »** : mauvaise marque, fond bleu Fonenako. | P2 | `public/offline.html:6` |
| T8 | **Pied de page « Nous écrire » → `mailto:contact.fonenako@gmail.com`** : le contact de Diako part vers la boîte de Fonenako. | P2 | snapshot `/publier` 05/09, `src/components/Footer.tsx` |

## 2. Tableau des routes

Statut = HTTP du document (toujours 200, cf. T1) + ce que l'écran montre. « Protégée » = écran de connexion pour un visiteur anonyme (état vérifié). Profondeur = clics depuis l'accueil (≤ 3 exigé).

| Route | Type | Statut | Problème | Action |
|---|---|---|---|---|
| `/` | Publique, fil | 200 · OK | **Pas de h1** (T5). 28 images sur 68 sans `width/height`, 0 image en `fetchpriority="high"` (règle `CLAUDE.md:48-49`), invite d'installation PWA affichée dès la 1ʳᵉ visite par-dessus le récit. LCP 4,3 s mobile réel. | h1 visuellement discret « Où dormir, où manger et avec qui partir à Madagascar » ; `fetchpriority="high"` + dimensions sur la 1ʳᵉ image ; différer l'invite PWA à la 2ᵉ visite. |
| `/auth` | Publique | 200 · OK | Canonique = accueil (T2). Champs et boutons nommés ✅. Mot de passe 8 caractères côté client, **6 côté serveur** (config Supabase). | `noindex` ; aligner le serveur (script `scripts/appliquer_config_auth.py`, à lancer sur ordre d'Andry). |
| `/bienvenue` | Protégée | 200 · écran de connexion | Atteint uniquement par le lien de confirmation e-mail ; un inscrit Google n'y passe jamais (`docs/RESTE-A-FAIRE.md`). | `noindex` ; rediriger le retour OAuth vers `/bienvenue` tant que le profil n'est pas complété. |
| `/compte` | Protégée | 200 · écran de connexion | **2 RPC tirées avant de savoir si l'utilisateur est connecté** (`mon_activite`, `mes_publications` → 401 en console). | Attendre `user` avant les appels (`src/pages/Compte.tsx:156,408`). |
| `/explorer` | Publique | 200 · OK | 75 textes sous 12 px, 21 cibles sous 44 px (390 px). | Voir 02-Mobile. |
| `/villes` | Publique | 200 · OK | — | — |
| `/recherche` (+ `?q=`) | Publique | 200 · OK | Canonique = accueil ; `robots.txt` interdit `/recherche?` mais la page sans paramètre est dans le sitemap avec un canonique faux. | `useSEO` avec canonique `/recherche` ; `noindex` sur les résultats (`?q=`). |
| `/publier` | Protégée | 200 · écran « Connectez-vous pour publier » avec h1 ✅ | Canonique = accueil. Le `share_target` du manifeste (`POST /publier`) tombe sur ce mur pour un non-connecté : le partage depuis Android est perdu. | `noindex` ; conserver le partage en attente jusqu'à la connexion (`sessionStorage`). |
| `/p/:slug` | Publique, fiche | 200 · OK (2 fiches testées) | Description courte (41 et 89 caractères). 3 à 4 blocs JSON-LD ✅. | Compléter la description à partir de `long_desc`. |
| `/pro` | Protégée | 200 · h1 « Espace professionnel », mur de connexion | **Dans le sitemap** (`sitemap.php:113`) alors que c'est un écran privé sans contenu public. | Sortir du sitemap **ou** construire une vraie page vitrine « Pour les professionnels » (voir 04). |
| `/pro/:slug` | Protégée | 200 · « Vous ne gérez pas cette fiche » | Comportement correct pour un tiers. | `noindex`. |
| `/parametres` | Protégée | 200 · écran de connexion | — | `noindex`. |
| `/admin` | Protégée (rôle) | 200 · « Cet espace est réservé » | — | `noindex` ; ajouter `Disallow: /admin` dans `robots.txt` (absent). |
| `/favoris` | Protégée | 200 · « Mon carnet » | — | `noindex`. |
| `/carte` | Publique | 200 · OK, Leaflet, 15 tuiles chargées, 0 bouton sans nom | Filtres de 32 px de haut. | Voir 02-Mobile. |
| `/lieu/:slug` | Publique, destination | 200 · OK (2 testées) | Seules **248 destinations sur 508** sont dans le sitemap (filtre `is_touristique`). Choix éditorial défendable. | Documenter le critère ; vérifier que les 260 autres portent bien `noindex` ou un canonique vers leur région. |
| `/plat/:slug` | Publique | 200 · OK | Description 59 caractères. | Enrichir. |
| `/plats` | Publique | 200 · OK, h1 « 95 plats malgaches » | — | — |
| `/gouts` | Publique (contenu perso) | 200 · OK | **C'est la page où l'utilisateur réel du 05/09 a vu l'écran d'erreur** (voir 02-Ops). | — |
| `/circuits` | Publique | 200 · état vide « Circuits · bientôt » | Route marquée `pret: false` dans `nav.ts:105` mais **liée depuis le pied de page et dans le sitemap** (`sitemap.php:108`). | Retirer du sitemap tant que `pret: false`. |
| `/circuit/:slug` | Publique | **200 · page vide, RPC 400** | **`column tour_prices_1.pax_min does not exist`** : `src/pages/Circuit.tsx:66-72` demande `tour_prices(pax_min, pax_max…)`, `tour_days(day_no, title, km…)`, `tour_inclusions(label, included)` ; la base a `tour_prices(base_pax, price_ar, price_unit)`, `tour_days(jour, titre, detail, place_id, nuitee)`, `tour_inclusions(libelle, inclus, sort_order)`. L'écran est écrit contre un schéma qui n'existe pas. Orphelin : aucune page ne lie vers l'unique circuit. | **P1** — corriger la requête et le rendu (patch dans 03), ou retirer la route tant que `/circuits` est « bientôt ». |
| `/sites` | Publique | 200 · OK, 2 451 sites | — | — |
| `/site/:slug` | Publique | 200 · OK | — | — |
| `/location` | Publique | 200 · OK, 162 liens | Texte 10 356 caractères : page longue, mais structurée. | — |
| `/evenements` | Publique | 200 · OK, 183 liens | Texte 27 573 caractères sur une page : lourd en 3G. | Pagination par curseur (déjà la règle du projet). |
| `/projet` | Publique | 200 · OK | — | — |
| `/quand-partir` | Publique | 200 · OK | **1 champ sans étiquette** : la boîte de recherche de destination (`input#:r0:`, `role=combobox`) n'a ni `<label>` ni `aria-label`, seulement un `placeholder`. | `aria-label="Destination"` (patch 03). |
| `/y-aller` | Publique | 200 · OK | — | — |
| `/guides` | Publique | 200 · état vide | `pret: false` (`nav.ts:125`), **0 guide en base**, mais dans le sitemap (`sitemap.php:111`). | Retirer du sitemap tant que vide. |
| `/guides/:slug` | Publique | Non testée (0 guide) | Route morte tant qu'il n'y a pas de contenu. | — |
| `/messages` | Protégée | 200 · « Vos messages » | 0 message en base : jamais exercé. | `noindex` ; test bout en bout avec 2 comptes avant lancement. |
| `/notifications` | Protégée | 200 · « Vos notifications » | 0 notification en base : jamais exercé. | idem. |
| `/user/:id` | Publique (profil) | 200 · OK | Titre « Diako — Diako » sur le profil du compte Diako (nom = marque). `robots.txt` interdit `/user/` ✅ mais **213 récits du sitemap lient vers des profils** : interdit d'explorer, pas d'indexer (URL peut apparaître sans contenu). | `noindex` sur `/user/:id` pour fermer proprement. |
| `/post/:id` | Publique, récit | 200 · OK | Titre « Récit à Hell-Ville — Diako » : sans l'auteur ni le sujet, deux récits du même lieu ont le même titre. | Titre = 60 premiers caractères du corps + lieu. |
| `/mentions`, `/confidentialite`, `/cgu` | Publiques, légales | 200 · OK | **Canonique = accueil** (T2) → non indexables. Textes courts (216 / 242 / 409 mots) : pas de responsable de traitement nommé, pas de durée de conservation, pas de mention du sous-traitant Supabase ni de l'hébergeur. | `useSEO` avec canonique propre ; compléter (voir 04). |
| `*` (404) | Système | **200** · « Cette page n'existe pas », h1 ✅, lien retour ✅ | Statut 200 (T1). Titre « Page introuvable — Diako » ✅. | `noindex` sur `NotFound.tsx` ; impossible de rendre un vrai 404 en SPA sans pré-rendu : accepter, mais fermer l'indexation. |
| `/offline.html` | Système (SW) | 200 · OK | Marque Fonenako (T7). | Rebrander (patch 03). |
| Écran d'erreur JS | Système | `ErrorBoundary` : « Recharger » ✅ + journalisation | Le message technique n'est pas montré à l'utilisateur ✅ ; **mais l'écran s'affiche pour une cause évitable** (morceau JS non chargé, voir 02-Ops). | Réessai automatique de l'import avant l'écran d'erreur (patch 03). |
| 403 / 500 serveur | Système | Non personnalisés (pages Apache o2switch par défaut) | Un 500 PHP (`o2upload.php`) rendrait la page brute d'Apache. | `ErrorDocument 500 /offline.html` dans `.htaccess` (page neutre, même style). |

## 3. Sitemap et robots — écarts

Sitemap dynamique `public/sitemap.php` (lu le 05/09 : **6 436 URL**, 6 341 `lastmod`) :

| Famille | URL | Remarque |
|---|---|---|
| `/p/` | 3 412 | = fiches publiées ✅ |
| `/site/` | 2 451 | ✅ |
| `/lieu/` | 248 | sur 508 destinations (filtre touristique) |
| `/post/` | 213 | = récits visibles ✅ |
| `/plat/` | 95 | ✅ |
| statiques | 17 | dont **`/pro` (privée), `/circuits` et `/guides` (vides, « bientôt »)**, `/recherche` (canonique faux) |

`robots.txt` : complet et commenté (groupes IA GPTBot, ClaudeBot, PerplexityBot… avec leurs propres `Disallow`). Manques : **`/admin` absent** de tous les groupes ; **pas de `llms.txt`** (le fichier annoncé aux agents IA n'existe pas, `/llms.txt` → HTML de l'accueil).

`lastmod` de l'accueil figé au `2026-08-01` (`sitemap.php:78`) alors que le fil change tous les jours : passer à `date('Y-m-d')`.

## 4. Liens cassés, redirections, orphelins, profondeur

- **Liens cassés (internes)** : 0 lien vers une route inconnue sur les 49 pages ; 1 page cassée par sa propre requête (`/circuit/:slug`, RPC 400).
- **Sous-requêtes 4xx** : `/compte` (2 × 401 avant connexion), `/circuit/:slug` (400). Aucun 5xx.
- **Redirections** : HTTP→HTTPS 301 ✅ ; `www` → rien ❌ ; barre finale → rien (doublon toléré par le routeur, canonique à poser).
- **Orphelins** : `/circuit/nosy-iranja-1-nosy-be-sido-tours` (aucun lien entrant, `/circuits` vide) ; `/guides/:slug` (0 guide). `/favoris`, `/notifications`, `/parametres` ne sont atteignables que depuis le menu compte : normal.
- **Impasses** : `/publier` pour un non-connecté (mur de connexion, mais avec un bouton « Créer mon compte » ✅) ; `/pro/:slug` d'une fiche d'autrui (« Vous ne gérez pas cette fiche » **sans lien de sortie** autre que la navigation globale → ajouter « Voir la fiche publique »).
- **Profondeur** : toutes les pages publiques sont à ≤ 3 clics (accueil → onglet → liste → fiche). Le menu « Ouvrir le menu » expose 24 entrées (`nav.ts`) : dense mais à 1 clic.

## 5. Sécurité des routes protégées — état vérifié

Pour un visiteur anonyme, chaque route protégée rend un écran de connexion **sans fuite de données** (aucune sous-requête réussie sur des données privées ; les deux RPC de `/compte` répondent 401 vide). Les RPC privées `chercher_etablissements_par_nom`, `mes_publications`, `mon_activite` refusent `anon` (grants vérifiés par migration `0106` et REST). Le bouton Google est actif en production (`app_flags.google_login = true`).

## 6. Le 429 du crawl — un constat de lancement

Le parcours direct de la production a reçu **HTTP 429** (page de blocage o2switch « Tiger Protect ») après ~80 requêtes en quelques secondes depuis une seule IP, deux fois pendant l'audit (le 05/09 en Playwright, puis en Chrome piloté). Une page Diako déclenche ~40 requêtes ; un mobile qui ouvre trois pages en une minute est donc au seuil. À Madagascar, les mobiles sortent derrière des IP partagées (CGNAT) : **plusieurs visiteurs simultanés partagent le compteur**. Le journal d'erreurs de production montre déjà un visiteur Android réel (Samsung A15, 4G) tombé sur l'écran d'erreur **cinq fois en deux minutes** le 05/09 entre 11:51 et 11:53 UTC, sur `/compte`, `/recherche`, `/pro`, `/favoris`, `/gouts`, et bingbot sur `/plats` et `/carte` — le symptôme exact d'un morceau JS refusé en 429 (cause détaillée et correctifs dans 02-Ops et 03).
