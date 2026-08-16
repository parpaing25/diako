# Audit vitesse et performance côté navigateur — Diako, 16/08/2026

> État : (en cours)

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

## 🔴 Ce qui ne marche pas

### Le logo de 494 Ko est TOUJOURS précaché par le service worker — la correction promise est inopérante
Preuve : `vite.config.ts:49-52` affirme « diako-logo.png RETIRÉ : 482 Ko préchargés que RIEN n'affiche » et l'a bien sorti d'`includeAssets` — mais `vite.config.ts:66` le laisse dans `manifest.icons`, et vite-plugin-pwa ajoute automatiquement les icônes du manifeste au précache. Résultat dans le build livré, `dist/sw.js:1` : `{"revision":"7d52666e31c4c03d0600d3a4bded8aed","url":"media/diako-logo.png"}` — le fichier pèse 494 085 octets (`dist/media/diako-logo.png`). Précache total : 1 254 597 octets stockés, dont 39 % pour ce seul logo que rien n'affiche (l'en-tête utilise `diako-marque-96.webp`, 5 598 o).
Conséquence : à chaque première visite (et à chaque changement d'empreinte du build), le téléphone 3G télécharge ~500 Ko inutiles en arrière-plan — l'équivalent de 2,5 fois tout le JS de l'accueil — en concurrence avec la navigation de l'utilisateur et son forfait data.
Correctif : pointer `manifest.icons` de la config VitePWA vers `/media/icon-192.png` et `/media/icon-512.png` (déjà présents, 25 834 o et 85 962 o), ou supprimer ce manifeste doublon (voir 🟠).

## 🟠 À améliorer

### Chemin critique JS de l'accueil : ~178 Ko gzippés en trois fichiers
Preuve : `dist/index.html:177-180` charge `index-KDD26VN6.js` (234 223 o / 66 453 gz) + modulepreload `react-vendor-DMOupTvS.js` (165 607 / 53 899 gz) et `supabase-vendor-DkS1Rjbo.js` (218 460 / 56 836 gz), soit 177 188 o gz de JS, + CSS `index-ClL3OPMd.css` (122 008 / 20 685 gz) + `app-init.js` (3 517 / 1 483 gz). Total premier écran ≈ 204 Ko compressés hors images.
Conséquence : sur une 3G réelle (~100 Ko/s), ~2 s de téléchargement JS avant interactivité — acceptable grâce au squelette statique, mais toute croissance de `index-*.js` (déjà 234 Ko bruts) se paiera directement ici.

## Verdict pour un lancement demain

(à venir)
