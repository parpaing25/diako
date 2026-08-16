# Audit vitesse et performance côté navigateur — Diako, 16/08/2026

> État : (terminé)

Périmètre : bundle `dist/` (déjà construit, non reconstruit), site réel https://diako.fonenako.mg mesuré au `curl`, code source (images du fil, service worker, requêtes Supabase au premier écran), dossier `public/`. Public cible : connexions 3G à Madagascar.

## ✅ Ce qui marche

### Le découpage par route tient : 34 pages en `lazy()`, l'accueil seul est embarqué
Preuve : `src/App.tsx:21-60` — 34 appels `lazy(() => import(...))` (Auth, Explorer, Recherche, Publier, PagePro, ProConsole, Carte, Sites, Plats, Circuits…) ; seul `Index` est importé en dur (`src/App.tsx:19`). Le build reflète ce découpage : 60+ morceaux dans `dist/assets/`, et les gros chunks de route (`PagePro` 11,6 Ko gz, `ProConsole` 11,1 Ko gz, `Sites` 9,4 Ko gz) ne sont PAS référencés par `dist/index.html`.
Conséquence : un visiteur de l'accueil ne paie jamais la console pro ni la carte.

### Leaflet (149,6 Ko / 43,2 Ko gz) est hors du chemin critique
Preuve : `maps-vendor-D294UVzu.js` n'apparaît ni en `<script>` ni en `modulepreload` dans `dist/index.html` ; `src/components/CarteResultats.tsx:26` documente « LEAFLET N'EST CHARGÉ QU'ICI » et le composant est importé en `lazy()` (`src/pages/Recherche.tsx:35`).
Conséquence : la plus grosse dépendance tierce ne coûte rien à l'accueil.

### Premier écran servi en HTML statique : LCP textuel sans attendre React
Preuve : `dist/index.html:107-228` — un squelette `#dk-shell` (header, colonnes, section « À propos de Diako ») est peint avec un `<style>` inline avant tout JavaScript ; le commentaire ligne 109 le désigne explicitement comme l'élément LCP. Aucune image n'est requise pour le premier rendu.
Conséquence : sur 3G, l'utilisateur voit le titre et le texte du produit dès l'arrivée du HTML (12,3 Ko / 4,7 Ko gz), pas après les ~180 Ko de JS.

### Le CSS ne bloque pas le rendu et le thème sombre est posé avant React
Preuve : `dist/index.html:180` émet le CSS en `rel="preload" as="style"` ; `dist/app-init.js:38-49` le repasse en `stylesheet` ; `app-init.js:19-29` pose la classe `dark` selon `prefers-color-scheme` avant le montage.
Conséquence : pas de flash blanc, pas de CSS bloquant dans le chemin critique.

### Service worker : enregistrement différé et cache versionné par empreinte — la correction est bien dans dist/
Preuve : `dist/app-init.js:58-73` — enregistrement via `requestIdleCallback` (timeout 6 s) après `load`. `dist/sw.js:1` — le nom de cache est `dk-<hash>` calculé (djb2) sur la liste des URL précachées ; comme les assets portent leur empreinte de contenu, chaque build invalide l'ancien cache, et le `activate` supprime tous les caches qui ne correspondent plus. Cache images plafonné à 400 entrées, chunks runtime à 60.
Conséquence : plus de vieux shell servi après un déploiement ; le précache ne concurrence pas le premier affichage.

### Icônes lucide découpées à l'unité
Preuve : 25+ micro-chunks de 200 à 1 100 octets (`camera-…js` 417 o, `eye-…js` 420 o, `clock-…js` 347 o…) dans `dist/assets/`.
Conséquence : pas de bibliothèque d'icônes monolithique dans le bundle d'entrée.

### Les cartes du site utilisent bien la vignette — échantillon de 5 écrans, 4 sont propres
Preuve, fichier par fichier :
- `FicheCard.tsx:39-41` — `ImageProgressive` avec `largeurAffichee="(min-width:1280px) 30vw, …, 92vw"` → `srcSet` vignette 480/original émis, le navigateur choisit la vignette sur un créneau de carte (`ImageProgressive.tsx:71-72`).
- `Sites.tsx:529-534` (carte région) et `Sites.tsx:1116-1121` (vignette 64 px, `largeurAffichee="64px"`) — même mécanique.
- `ChoixEnvie.tsx:197-198` — `src={getThumbUrl(s.cover_url)}` : vignette directe, jamais l'original.
- `Explorer.tsx:496-506`, `678-680`, `908-910` — `srcSet={jeuDeTailles(...)}` + `sizes` : les trois tailles (480/960/1600) sont proposées.
Conséquence : sur ces écrans, une carte de 390 px coûte ~7 à 30 Ko, pas 730.

### Le rail droit ne tire plus ses 3 requêtes sur téléphone — la correction est en place
Preuve : `RightRail.tsx:182-198` — `useMediaQuery("(min-width: 1024px)")` + `if (inutile) return;` dans le `useEffect` : `saison_en_cours`, `stats_diako` et `recits_en_vogue(12)` ne partent pas sous 1024 px. Le commentaire lignes 171-180 documente le défaut d'origine.
Conséquence : le fil mobile n'attend plus derrière trois requêtes invisibles.

### Les requêtes du premier écran partent en parallèle, pas en cascade
Preuve : `Feed.tsx:112-114` (`fil_modes_disponibles`) et `Feed.tsx:154-158` (`feed_filtre` via `chargerFilFiltre`, `api.ts:88`) sont deux `useEffect` du même montage — aucun n'attend l'autre. Côté desktop, `Index.tsx:31-34` (`chercherPages`), `DiakoHero.tsx:36-38` (`chargerDestinations(12)`) et les trois appels du rail (`RightRail.tsx:201-218`, commentés « en parallèle ») partent aussi au même montage. Seule chaîne séquentielle : `chercher_lieux` → `places` (`RightRail.tsx:146-160`), uniquement pour un membre connecté avec ville déclarée.
Décompte complet au premier écran, visiteur anonyme (relevé sur le code) : **mobile 4 requêtes** — `feed_filtre`, `fil_modes_disponibles`, `stats_diako` (inutile, voir 🔴) et le POST `page_views` (`pageviews.ts:87`, `keepalive`, hors chemin critique) ; **desktop 9 requêtes** — les mêmes plus `chercherPages` (Index), `chargerDestinations(12)` (DiakoHero), `saison_en_cours`, `recits_en_vogue(12)` et un second `stats_diako` (RightRail). Anonyme, aucun appel `profiles` : `UserDataContext.tsx:52-57` court-circuite sans réseau.
Conséquence : le premier contenu n'attend qu'UN aller-retour Supabase (le plus lent des appels parallèles), pas leur somme.

### TTFB o2switch stable ~0,6 s, cache des assets bien réglé — mesures réelles du 16/08
Preuve : 3 mesures `curl` par ressource depuis la connexion locale (médianes) :

| Ressource | Octets reçus (br) | TTFB méd. | Total méd. |
|---|---|---|---|
| `/` (HTML) | 5 170 | 0,600 s | 0,600 s |
| `assets/index-CsfIvkcS.css` | 27 343 | 0,601 s | 0,792 s |
| `assets/index-DOPnLe_5.js` | 83 058 | 0,562 s | 0,926 s |
| `assets/react-vendor-DMOupTvS.js` | 66 585 | 0,563 s | 0,921 s |
| `assets/supabase-vendor-DkS1Rjbo.js` | 72 907 | 0,606 s | 0,999 s |
| vignette de fil `.thumb.webp` | 18 772 | 0,603 s | 0,794 s |
| original de fil `.jpg` | 728 054 | 0,621 s | 2,993 s |

En-têtes relevés : assets `Cache-Control: public, max-age=31536000, immutable` ; HTML `no-cache, no-store, must-revalidate` ; tout est servi `Content-Encoding: br`. Aucune police web : `grep woff|fonts.g` sur le HTML vivant = 0 — la typo est système, zéro requête.
Note de périmètre : le build déployé diffère du `dist/` local sur deux empreintes (`index-DOPnLe_5.js` / `index-CsfIvkcS.css` en ligne contre `index-KDD26VN6.js` / `index-ClL3OPMd.css` en local) ; `react-vendor` et `supabase-vendor` sont identiques. Les tailles locales et distantes sont donc proches mais pas interchangeables.
HTTP/2 : non vérifié — le curl de cette machine (8.14.1 Schannel) ne le supporte pas (`--http2` refusé).
Conséquence : une visite répétée ne retélécharge que le HTML (5 Ko) ; les ~217 Ko de JS ne se paient qu'une fois par build.

### Les couvertures de lieux ont bien leurs trois tailles — le `srcset` d'Explorer est honnête
Preuve : `uploads/pages/diako/places/akanin-ny-nofy` → `.jpg` 118 202 o, `.thumb.webp` 15 626 o, `.w960.webp` 57 508 o, `.w1600.webp` 88 754 o, tous `image/webp`/`image/jpeg` en 200 ; idem `uploads/pages/wikidata/places/marotandrano` (316 613 / 5 578 / 35 190 / 185 494). Les trois candidats annoncés par `jeuDeTailles` (`imageThumb.ts:29-38`) existent donc réellement pour ces écrans.
Conséquence : Explorer sert ~35-57 Ko là où l'original en ferait 118-317 — le navigateur a de vrais choix.

### public/ ne sert rien de lourd à l'insu du visiteur
Preuve : inventaire complet (1 038 508 o au total) — au-delà du logo de 494 Ko traité en 🔴, les plus gros fichiers sont des icônes PWA et l'image OG (`og-diako.jpg` 53 886 o), qui ne se chargent qu'à la demande (installation, partage). Aucune vidéo, aucune archive, aucun doublon d'image dans `public/uploads/` (seul un `.htaccess` de 1 001 o).
Conséquence : rien à purger côté hébergement en dehors du logo.

## 🔴 Ce qui ne marche pas

### Le fil immersif mobile télécharge l'ORIGINAL de chaque photo (728 Ko à 1 Mo mesurés) plus la vignette — le défaut historique persiste sur l'écran principal
Preuve, côté code : sur téléphone, l'accueil EST le fil immersif (`Index.tsx:36` — `if (mobile) return <Feed />;`). Chaque post y passe par `Carrousel.tsx:61-68`, qui appelle `ImageProgressive` SANS `largeurAffichee`. Or `ImageProgressive.tsx:71-72` n'émet le `srcSet` que si `largeurAffichee` est fourni : sans lui, `<img src={m.url}>` charge l'original pleine résolution, et la vignette floutée est chargée EN PLUS (`ImageProgressive.tsx:49-58`). Le commentaire de `Carrousel.tsx:10-13` assume ce choix (« chaque image est servie en pleine résolution (2000 px) ») pour éviter la pixelisation plein écran — mais la variante `w960.webp` prévue exactement pour ce cas (`imageThumb.ts:29-38`, utilisée par Explorer) n'est PAS proposée ici.
Preuve, mesures réelles sur les médias du fil (curl, 3 passes, médianes) : `ile-aux-nattes.jpg` **728 054 o, 2,99 s** sur une bonne connexion (sa vignette : 18 772 o, 0,79 s) ; `toliara-1.jpg` **1 004 950 o, 3,61 s** ; `ile-aux-nattes4.jpg` 325 957 o ; `ile-aux-nattes5.jpg` 208 202 o. La base compte 28 posts publiés avec médias, 147 images, toutes sur `/uploads/posts/` (SQL `count(*)` du 16/08).
Conséquence : sur la 3G visée (~100 Ko/s utiles), CHAQUE glissement du fil coûte 2 à 10 secondes de photo — sur l'écran qui est la porte d'entrée du produit. C'est le poste n° 1 de consommation data du site, loin devant tout le JS.

### Les posts existants n'ont NI `w960` ni `w1600` — et o2switch renvoie 200 `text/html` à leur place
Preuve : `ile-aux-nattes.w960.webp` et `.w1600.webp` → **HTTP 200, `Content-Type: text/html`, 12 308 o** (la page de défi de l'hébergeur, jamais un 404), mesuré 3 fois chacun. Le pipeline d'upload actuel génère pourtant bien les trois tailles (`public/api/o2upload.php:236` — `[[480,72,'.thumb.webp'],[960,80,'.w960.webp'],[1600,84,'.w1600.webp']]`) : ce sont les 147 images importées AVANT ce pipeline qui n'ont que la vignette 480.
Conséquence double : (a) le correctif évident du fil — passer le carrousel sur `jeuDeTailles` — casserait l'affichage aujourd'hui, le navigateur décoderait du HTML comme image ; il faut d'abord régénérer les variantes des 147 images ; (b) toute future référence à un fichier absent renverra un faux 200 : indétectable par code HTTP, il faut tester le `Content-Type`.

### Le logo de 494 Ko est TOUJOURS précaché par le service worker — la correction promise est inopérante
Preuve : `vite.config.ts:49-52` affirme « diako-logo.png RETIRÉ : 482 Ko préchargés que RIEN n'affiche » et l'a bien sorti d'`includeAssets` — mais `vite.config.ts:66` le laisse dans `manifest.icons`, et vite-plugin-pwa ajoute automatiquement les icônes du manifeste au précache. Résultat dans le build livré, `dist/sw.js:1` : `{"revision":"7d52666e31c4c03d0600d3a4bded8aed","url":"media/diako-logo.png"}` — le fichier pèse 494 085 octets (`dist/media/diako-logo.png`). Précache total : 1 254 597 octets stockés, dont 39 % pour ce seul logo que rien n'affiche (l'en-tête utilise `diako-marque-96.webp`, 5 598 o).
Conséquence : à chaque première visite (et à chaque changement d'empreinte du build), le téléphone 3G télécharge ~500 Ko inutiles en arrière-plan — l'équivalent de 2,5 fois tout le JS de l'accueil — en concurrence avec la navigation de l'utilisateur et son forfait data.
Correctif : pointer `manifest.icons` de la config VitePWA vers `/media/icon-192.png` et `/media/icon-512.png` (déjà présents, 25 834 o et 85 962 o), ou supprimer ce manifeste doublon (le HTML vivant référence à la fois `/manifest.json` et `/manifest.webmanifest`).

### `stats_diako` part inutilement sur mobile et DEUX fois sur grand écran
Preuve : `SideNav.tsx:25-30` — `supabase.rpc("stats_diako")` dans un `useEffect` sans aucune garde, alors que la nav est masquée en CSS sous 1280 px (`SideNav.tsx:39` — `hidden … xl:block`) ; le composant est monté inconditionnellement (`App.tsx:203`). Sur ≥1280 px, `RightRail.tsx:204` fait le même appel. Le commentaire `SideNav.tsx:19-22` (« mise en cache par le navigateur ») est faux : `supabase.rpc()` émet un POST (aucune option `get` passée), et un POST n'est jamais servi par le cache HTTP.
Conséquence : un téléphone 3G paie un aller-retour Supabase pour huit compteurs que rien n'affiche ; un desktop paie deux fois la même requête. C'est exactement le défaut que RightRail vient de corriger, reproduit dans le composant d'à côté.

## 🟠 À améliorer

### Chemin critique JS de l'accueil : ~178 Ko gzippés en trois fichiers (222 550 o reçus mesurés en ligne)
Preuve : `dist/index.html:177-180` charge `index-KDD26VN6.js` (234 223 o / 66 453 gz) + modulepreload `react-vendor-DMOupTvS.js` (165 607 / 53 899 gz) et `supabase-vendor-DkS1Rjbo.js` (218 460 / 56 836 gz), soit 177 188 o gz de JS, + CSS `index-ClL3OPMd.css` (122 008 / 20 685 gz) + `app-init.js` (3 517 / 1 483 gz). Total premier écran ≈ 204 Ko compressés hors images. En ligne, les trois JS pèsent 222 550 o reçus (voir tableau des médianes).
Conséquence : sur une 3G réelle (~100 Ko/s), ~2 s de téléchargement JS avant interactivité — acceptable grâce au squelette statique, mais toute croissance de `index-*.js` (déjà 234 Ko bruts) se paiera directement ici.

### Le chemin critique du fil mobile fait 4 étages séquentiels — ~3 s mesurées avant la première photo, hors 3G
Preuve, enchaînement relevé sur le HTML vivant et le code : ① HTML (0,600 s) → ② `index-*.js` + vendors en parallèle (préchargés par `dist/index.html`, le plus lent 0,999 s) → ③ montage React puis `feed_filtre` (RPC Supabase, TTFB non mesurable au curl sans clé, ordre de grandeur d'un aller-retour ~0,6 s) → ④ vignette du premier post (0,794 s) puis original (2,99 s) par-dessus. Le squelette statique (étage ①) peint du texte dès 0,6 s ; le PREMIER CONTENU RÉEL (une photo de récit) n'arrive qu'après les quatre étages.
LCP probable : sur téléphone, la photo du premier post — c'est-à-dire un original de 728 Ko qui repeint par-dessus la vignette ; sur ordinateur, le squelette texte statique de `dist/index.html:107-228` (aucune image requise).
Conséquence : le ressenti mobile dépend presque entièrement du poids des photos du fil (voir 🔴), pas du JS — c'est là que chaque Ko gagné compte.

### La compression à la volée d'o2switch coûte ~24 % de plus que le gzip -9 local
Preuve : `react-vendor-DMOupTvS.js`, empreinte identique en local et en ligne (même contenu, 165 607 o bruts) : 53 899 o en `gzip -9` local contre **66 585 o reçus** en `Content-Encoding: br` du serveur — le brotli dynamique d'o2switch tourne à bas niveau de qualité. Même écart sur le CSS (20 685 gz local vs 27 343 reçus).
Conséquence : ~45 Ko de plus sur le premier écran 3G (~0,5 s). Servir des `.br`/`.gz` précompressés au build (si la config LiteSpeed mutualisée le permet — non vérifié) rendrait cet écart.

### `stats_diako` : deux appels au lieu d'un, même quand la réponse ne sert à rien
(Le défaut est décrit en 🔴 ; la version minimale du correctif tient en deux lignes : la même garde `useMediaQuery` que `RightRail.tsx:182`, ou un partage via React Query — le `QueryClient` avec `staleTime` 5 min existe déjà, `App.tsx:62-66`, mais aucun de ces appels ne l'utilise.)

## Verdict pour un lancement demain

**PRÊT SOUS CONDITIONS.** Le socle est solide — squelette statique peint à 0,6 s, découpage par route effectif, cache immutable, requêtes parallèles, vignettes correctes sur 4 écrans sur 5 — mais l'écran d'entrée du produit, le fil mobile, coûte 728 Ko à 1 Mo PAR PHOTO au public 3G visé. Conditions, triées :

1. **(bloquant de fait pour le public 3G)** Servir la taille 960 dans le fil immersif : régénérer `w960.webp`/`w1600.webp` pour les 147 images de posts existantes (le pipeline `o2upload.php:236` sait déjà le faire pour les nouvelles), puis passer `Carrousel.tsx` sur un `srcset` trois tailles. Gain mesurable : ~35-60 Ko au lieu de 728-1 005 Ko par photo, soit 2,5 à 10 s gagnées par glissement. Sans cela, le fil est inutilisable en 3G réelle — 8 posts du premier palier ≈ plusieurs Mo.
2. **(une ligne à changer + rebuild)** Sortir `diako-logo.png` (494 085 o) du précache : `vite.config.ts:66`, pointer `manifest.icons` vers `icon-192.png`/`icon-512.png`. Vérifier ensuite dans `dist/sw.js` que l'entrée a disparu.
3. **(deux lignes)** Garder `stats_diako` de `SideNav.tsx:25-30` derrière la même garde `useMediaQuery` que RightRail — l'appel part aujourd'hui sur chaque téléphone pour un composant `display:none`, et en double sur desktop.

Sans la condition 1, le lancement reste possible pour un public wifi/4G urbain, mais la promesse « réseau social du voyage pour Madagascar » se heurte à la réalité des connexions du pays dès le premier glissement du fil. Les conditions 2 et 3 sont des corrections d'une heure, à faire dans le même déploiement.

Améliorations non bloquantes, par ordre de rendement : précompresser les assets en `.br`/`.gz` au build si LiteSpeed mutualisé le permet (~45 Ko et ~0,5 s rendus au premier écran) ; mettre les RPC du premier écran sous React Query (le client existe, `App.tsx:62-66`) pour dédupliquer et mémoriser entre navigations ; surveiller la croissance d'`index-*.js` (234 Ko bruts, le plus gros poste JS).

> Rapport terminé le 16/08/2026. Mesures : curl 8.14.1 (3 passes par ressource, médianes), SQL `count(*)` sur le projet Supabase eifrwecaszzqrdwjjjbu, inventaire `dist/` et `public/` sur le build local du dépôt.
