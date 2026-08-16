# Audit TECHNIQUE — Diako, 16/08/2026

> État : (terminé)

Périmètre : le code tient-il ? Routes, chemins d'erreur, code mort, cohérence types.ts ↔ base,
TODO/console.log, ErrorBoundary, et le sujet chaud : accueil mobile vide sur Android/Chrome.

---

## 🔎 SUJET CHAUD — l'accueil mobile n'affiche rien : cause trouvée, correctif DÉJÀ EN PROD ce soir 20 h 25

**Le mécanisme, tracé composant par composant à 360 px.**

1. À 360 px, `useEstMobile()` rend `true` (src/hooks/useEstMobile.ts:15, seuil `max-width: 767px`) et
   `Index` retourne **uniquement `<Feed />`** (src/pages/Index.tsx:36) — rien d'autre n'est en flux.
2. `Feed` en mobile ne rend que des éléments **`position: fixed`** : le squelette de chargement
   (`dk-skeleton fixed inset-x-0 bottom-0 top-14`, src/components/Feed.tsx:204) puis le fil
   (`fixed inset-x-0 bottom-0 top-14 … bg-black`, Feed.tsx:276). Le flux du `<main>` reste vide.
3. Or le conteneur de routes `<div key={pathname} className="dk-page">` (src/App.tsx:106) portait
   une animation d'entrée avec **`transform: translateY(6px) → none` et `fill-mode: both`**
   (version d'avant le correctif, vérifiée : `git show 57028b8:src/index.css` →
   `@keyframes dk-page { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }`).
   Avec `both`, Blink garde la dernière image-clé résolue en `matrix(1,0,0,1,0,0)` — l'identité,
   mais **pas `none`**. Un élément dont le transform n'est pas `none` devient le **bloc conteneur**
   de tous ses descendants `position: fixed`.
4. Conséquence : le fil `fixed inset-x-0 bottom-0 top-14` se calait sur un `.dk-page` de hauteur ~0
   au lieu du viewport → hauteur résolue 0. **Les publications étaient dans le DOM ; pas un pixel ne
   se peignait.** L'entête, le pied de page et la barre du bas, hors de `.dk-page`, restaient parfaits —
   d'où « rien entre les deux ». Le squelette de chargement étant lui aussi `fixed` (Feed.tsx:204),
   « pas de squelette » colle aussi. Ce mécanisme est documenté ligne par ligne — avec la mesure en
   navigateur `offsetParent = DIV.dk-page, height = 0` — dans src/index.css:715-733.

**L'état ce soir, mesuré en production :**

- Correctif commité aujourd'hui : `184c56e 2026-08-16 20:26:12 +0300 fix(mobile): l'accueil ne
  peignait pas un pixel — une animation de 6 px écrasait le fil à hauteur zéro`.
- Le CSS **live** est le CSS corrigé : `curl https://diako.fonenako.mg/` → `assets/index-CsfIvkcS.css`
  (même hachage que `dist/`), et dans ce fichier live (122 009 octets, code 200) :
  `@keyframes dk-page{0%{opacity:0}to{opacity:1}` — **opacité seule, 0 occurrence de `translateY(6px)`**.
- Le JS live = le JS du dist (`assets/index-DOPnLe_5.js` des deux côtés).
- Mise en ligne horodatée par le serveur : CSS `Last-Modified: 16 Aug 2026 17:24:56 GMT` (= 20:24:56
  heure de Tana), index.html 17:25:23 GMT, sw.js 17:25:47 GMT. L'heure exacte de la capture du
  propriétaire n'est pas connue de cet audit — **non vérifié** qu'elle précède 20 h 25. Ce qui est
  vérifié : le CSS fautif (`translateY(6px)` + `both`) était celui du dépôt jusqu'au commit de
  20 h 26, et le CSS en ligne depuis 20 h 25 est le corrigé.
- Le service worker ne piégera pas les anciens visiteurs : `/sw.js` est servi avec
  `Cache-Control: no-cache, no-store, must-revalidate` (mesuré par curl -I), et le SW live précache
  déjà les nouveaux hachages avec `skipWaiting()` + `clients.claim()` + purge des anciens caches
  (contenu de /tmp du sw.js live). À la **prochaine navigation**, un téléphone ayant l'ancienne
  version récupère le nouveau SW et la nouvelle coquille. Un simple rechargement (voire fermer/rouvrir
  l'onglet) suffit — pas de désinstallation à faire.
- Rien dans le journal d'erreurs côté Android ce soir : SQL `journal_erreurs` sur 48 h → 3 groupes
  seulement, aucun Android (2 en HeadlessChrome — l'outil de diagnostic parallèle —, 4 échecs de
  chargement de modules sur Firefox/Windows le 15/08). Cohérent : ce bug était purement CSS, le JS
  tournait sans erreur.

**Verdict sujet chaud : cause racine confirmée, correctif vérifié en prod. À faire vérifier par le
propriétaire sur SON téléphone après un rechargement ; si l'écran vide persistait APRÈS ça, ce serait
un autre défaut — non observé dans le code ni dans le journal.**

---

## ✅ Ce qui marche

- **Le correctif de l'accueil mobile est en production, vérifié octet par octet** — voir la section
  « Sujet chaud » ci-dessus : CSS live = CSS corrigé (hachage `index-CsfIvkcS.css` identique au dist,
  keyframes `dk-page` sans transform), horodaté 20 h 25 ce soir.
- **Un vrai journal d'erreurs client, branché et alimenté.** src/lib/journalErreurs.ts : capture
  `window.onerror` + `unhandledrejection` (:83-101), anonymisation (courriels/téléphones/UUID, :37-43),
  anti-rafale (10 max/session, doublons 30 s, :26-27), insert dans `public.journal_erreurs` avec
  chemin/navigateur/type de réseau. La table reçoit réellement des lignes (SQL 48 h : 6 lignes) —
  c'est grâce à elle qu'on sait que le bug mobile n'émettait aucune erreur JS.
- **Le service worker se met à jour proprement.** `/sw.js` servi en
  `no-cache, no-store, must-revalidate` (curl -I) ; le script précache le shell versionné et purge
  les caches obsolètes à l'activation (`skipWaiting` + `clients.claim`). Un déploiement ne laisse pas
  les téléphones prisonniers d'une vieille coquille — le défaut « coquille morte » a été corrigé
  aujourd'hui même (commit 52daefb, 18:55).
- **Le squelette statique d'index.html est redevenu cohérent avec React.** Le bandeau d'accueil
  supprimé côté React a aussi été retiré du squelette (index.html:190-203 documente le retrait ;
  grep « hero / Régions actives » sur le HTML live → 0 occurrence). Le point levé par
  docs/RESTE-A-FAIRE.md (« le squelette peint encore le bandeau supprimé ») est donc soldé.

- **Les chemins d'erreur existent et sont récupérables sur la quasi-totalité des écrans
  échantillonnés.** Un composant partagé `EtatErreur` (« Réessayer » + retour accueil,
  src/components/Etats.tsx:158-194) est utilisé par 14 fichiers (grep `EtatErreur` : Circuits,
  Circuit, Destination, Evenements, Explorer, Gouts, Guides, Plat, Plats, Projet, QuandPartir,
  Site, Sites, YAller + ChoixEnvie). Chaque page échantillonnée porte un état
  `chargement | ok | erreur` avec `catch` → `setEtat("erreur")` → rendu d'un bouton Réessayer :
  Explorer.tsx:117-186, Sites.tsx:111-411, Projet.tsx:75-255, Recherche.tsx:128-530,
  Destination.tsx:76-130. Le fil a son propre état d'erreur avec Réessayer (Feed.tsx:224-239).
  Sur les fiches, l'ordre des branches est correct (erreur AVANT introuvable) sur Destination:130,
  Site:136, Plat:116, Circuit:103, Guides:174 — deux exceptions, voir 🔴.
- **L'ErrorBoundary montre un vrai écran de secours et journalise.** src/components/ErrorBoundary.tsx:48-61 :
  « Quelque chose s'est mal passé » + cause probable (connexion) + bouton **Recharger**
  (`window.location.reload()`), et componentDidCatch envoie l'erreur au journal (:37-41) — React 18
  en prod ne repropage pas les erreurs de rendu vers `window.onerror`, ce trou est bouché. Monté
  avec `key={pathname}` autour des routes (App.tsx:209), donc une page plantée ne fige pas la
  navigation. Header/AgentDiako/InstallPrompt sont isolés avec `fallback={<div />}` (App.tsx:185,
  220, 223) : leur plantage est silencieux à l'écran mais journalisé.
- **Aucun lien interne ne mène vers une route non déclarée.** Inventaire des cibles statiques
  `to="…"` / `navigate("…")` de tout src/ (21 chemins distincts, de `/auth` ×20 à `/circuits` ×1) :
  chacun correspond à une `<Route>` de App.tsx:108-158. La route `*` a un écran 404 réel
  (NotFound, App.tsx:158).
- **Le code est propre côté marqueurs de chantier.** `grep TODO|FIXME|XXX|HACK` sur src/ (hors
  components/ui) → 1 seule occurrence, et c'est un commentaire décrivant un défaut DÉJÀ corrigé
  (ErrorBoundary.tsx:29). Aucun `console.log` de débogage dans les écrans — il en reste un seul,
  dans src/lib/imageCompression.ts:35 (voir 🟠) ; les `console.error` restants sont des garde-fous
  légitimes (ErrorBoundary:26, Etats.tsx:108 en DEV, grandesRegions.ts:78-82).
- **Deux mensonges de navigation recensés ce matin ont été corrigés dans la soirée.**
  ① Les entrées de menu vers les tables vides portent désormais `pret: false` — src/lib/nav.ts:97
  (/circuits) et :113 (/guides), avec le motif en commentaire (:91-96) : la pastille « bientôt »
  s'affiche AVANT le clic — et les tables sont bien toujours vides (SQL : tours=0, guides=0).
  ② Un bouton retour existe désormais « par construction » dans l'entête pour les 19 écrans qui
  n'en avaient aucun (commit 57028b8, 16/08 19:16).
- **Les 35 routes déclarées mènent toutes à un écran réel.** Chaque `lazy(() => import(...))` de
  App.tsx:21-60 correspond à un fichier existant de src/pages (36 fichiers relevés par glob ; le
  36e, Attente.tsx, est le seul orphelin — voir code mort). Chaque page échantillonnée rend soit du
  contenu, soit un état vide avec action, soit une erreur avec Réessayer — le triplet imposé par
  src/components/Etats.tsx. Deux « sources de vérité » de types profils/posts sont exactes
  colonne par colonne (voir 🔴 pour les trois tables qui ont décroché).

## 🔴 Ce qui ne marche pas

- **Sur /p/:slug — l'écran le plus partagé du produit — un échec réseau dit « Cet établissement
  n'existe pas ».** Preuve : src/pages/PagePro.tsx:354 `if (etat === "absente" || !fiche)` est testé
  AVANT :371 `if (etat === "erreur")`. Or au premier chargement, un échec réseau laisse `fiche` à
  `null` (init :118 ; le `catch` de charger() ne pose que `setEtat("erreur")`, :219-221) → la
  condition `!fiche` capte le cas et rend « Cet établissement n'existe pas — le lien est peut-être
  périmé » SANS bouton Réessayer. La branche erreur :371-383 (avec Réessayer) n'est atteignable que
  si une fiche déjà affichée échoue à se recharger. Conséquence : sur une 3G instable, celui qui
  ouvre un lien WhatsApp d'hôtel lit que l'établissement n'existe pas — c'est faux, et il ne
  reviendra pas.
- **Même défaut sur /post/:id, la cible des notifications et du partage.** src/pages/Post.tsx:96
  `if (etat === "absent" || !post)` passe avant :113 `if (etat === "erreur")` : un échec réseau au
  premier chargement affiche « Cette publication n'existe plus » au lieu d'une erreur récupérable.
  Les cinq autres fiches font l'inverse, correctement (Destination.tsx:130 puis :132, Site.tsx:136
  puis :143, Plat.tsx:116/118, Circuit.tsx:103/106, Guides.tsx:174/181) — c'est un défaut d'ordre
  de deux lignes, pas un défaut d'architecture.
- **/evenements affiche des dates FABRIQUÉES : « chaque année vers le 1 janvier » pour 40
  événements sur 42.** Chaîne complète : la base porte 42 événements publiés, **0 avec `starts_on`**
  et 40 `yearly` (SQL : events_publies=42, events_avec_date=0, events_yearly=40) ; `chargerEvenements`
  sélectionne pourtant `starts_on` et trie dessus (src/lib/decouverte.ts:344-348) ; puis
  Evenements.tsx:26-28 fait `new Date(debut)` avec `debut = null` → coercition JS vers l'époque
  Unix → **1 janvier 1970**, et la branche `yearly` (:29) imprime « chaque année vers le 1 janvier ».
  Le typage ne pouvait pas le signaler : types.ts:340 déclare `starts_on: string` NON NUL alors que
  la colonne est nullable en base (information_schema : is_nullable=YES) et vide à 100 %.
  Conséquence : la page du calendrier — celle qui doit prouver que le site connaît le terrain —
  annonce 40 fêtes « vers le 1 janvier ». C'est faux pour la quasi-totalité (Donia, baleines,
  litchis…), et un visiteur qui le remarque doute du reste du référentiel.
- **types.ts (écrit à la main) a décroché de la base sur 3 des 5 tables échantillonnées.**
  Comparaison intégrale Row ↔ information_schema.columns :
  · `profiles` : 18/18 colonnes, exactes ✅ · `posts` : 20/20, exactes ✅
  · `events` : **6 colonnes de la base absentes du type** — `mois`, `periode`, `source`,
    `confiance`, `recurrent`, `lieu_libre` (celles de la migration « saison », les seules remplies
    à 42/42) + la nullabilité mentie sur `starts_on` (voir ci-dessus). Le rail droit les lit déjà en
    contournant le typage par une interface locale (RightRail.tsx:41-44) — le garde-fou TypeScript
    est donc hors circuit exactement là où la donnée vit.
  · `places` : 2 colonnes absentes du type — `merged_into`, `ville_proche_id`.
  · `pages` : 1 colonne absente — `geo_source`.
  Le risque est documenté par le fichier lui-même (types.ts:446-451 : une colonne oubliée ne casse
  pas le type mais dégrade la requête entière en `GenericStringError[]`). Conséquence : tout écran
  futur qui voudra lire `events.periode` ou `places.ville_proche_id` via le client typé échouera à
  la compilation en accusant le mauvais endroit — ou sera « réparé » par un `as` qui éteint le
  typage, comme dans RightRail.

## 🟠 À améliorer

- **Un déploiement casse la navigation des sessions ouvertes : aucun rattrapage des chunks morts.**
  Preuve : journal_erreurs des 15/08 (SQL) — 4 × `error loading dynamically imported module:
  …/assets/Publier-C-YLUoKW.js` et `…/Recherche-CPka2Ldg.js` (hachages qui n'existent plus après
  redéploiement), et `grep -rn "preloadError" src/` → 0 résultat : l'événement `vite:preloadError`
  n'est pas écouté, donc pas de rechargement automatique. Conséquence : l'utilisateur qui a l'onglet
  ouvert pendant un déploiement clique sur « Publier » et tombe sur l'écran de plantage au lieu d'un
  simple rechargement transparent.
- **Le code mort recensé dans docs/RESTE-A-FAIRE.md est toujours mort — revérifié ce soir, item par
  item, après les 2 commits du jour.** Rien n'a été branché, rien n'a grossi :
  · src/pages/Attente.tsx : toujours orphelin — grep « Attente » sur src → 0 occurrence hors de sa
    propre définition ; aucune route dans App.tsx.
  · src/components/ui (shadcn) : toujours 48/50 fichiers sans importeur — seuls App.tsx
    (`ui/sonner`) et hooks/use-toast.ts (lui-même mort) importent depuis ce dossier.
  · src/lib/cache.ts : toujours 0 importeur (grep « lib/cache » sur src → rien).
  · hooks morts : useScrollRestore.ts, useRefreshOnFocus.ts, use-toast.ts — toujours aucun
    consommateur hors components/ui.
  · JSON-LD : `construireDestinationJsonLd` et `construireFAQ` toujours jamais appelés ;
    `poserJsonLd` ne vit que dans PagePro.tsx (6 occurrences). /lieu/:slug et /quand-partir
    n'émettent toujours aucune donnée structurée.
  · prechargerFiche() : toujours 1 seule occurrence (sa définition, prechargerRoute.ts:64).
  · RPC `agent_chercher` / `trajets_depuis` + enveloppes `agentChercher`/`trajetsDepuis` : toujours
    appelées par aucun écran.
  · src/components/guards/ et src/data/ : toujours des répertoires versionnés VIDES (ls -a → rien).
  Ce qui a bougé depuis le relevé : `pret: false` posé sur /circuits et /guides (nav.ts:97, :113),
  le bouton retour global dans l'entête (57028b8), et le bandeau statique d'index.html retiré.
  Conséquence du stock restant : ~750 lignes et 50 fichiers qui se relisent, se compilent et se
  maintiennent pour rien — et deux optimisations écrites (cache, préchargement de fiche) que
  l'utilisateur ne reçoit pas.
- **Un `console.log` de débogage tourne en production à chaque compression d'image.**
  src/lib/imageCompression.ts:35 (`console.log(\`Image compression: …\`)`) — et le module est
  vivant : 5 importeurs (Publier.tsx, Compte.tsx, ProConsole.tsx, AssistantEtablissement.tsx,
  justificatifs.ts). Sans gravité fonctionnelle, mais c'est du bruit visible dans la console de
  n'importe quel visiteur qui publie une photo.
- **Les chargements secondaires des fiches avalent leurs erreurs en silence.** PagePro.tsx:216-218 :
  `avisDe(...).catch(() => undefined)`, `ficheEstGardee(...)`, `recitsMentionnant(...)` — même motif
  sur Destination.tsx:109. Si la requête des avis échoue, la fiche affiche simplement « 0 avis »
  sans le dire. Dégradation acceptable, mais indistinguable d'une vraie absence de données.

## Verdict pour un lancement demain

**PRÊT SOUS CONDITIONS.** Le code tient : routes toutes réelles, chemins d'erreur récupérables
presque partout, ErrorBoundary honnête et journalisé, zéro TODO, et LE bloquant de la soirée —
l'accueil mobile vide — a sa cause prouvée et son correctif **vérifié en production à 20 h 25**.
Les conditions, triées :

1. **Confirmer l'accueil mobile sur le téléphone du propriétaire** — recharger la page (l'ancien
   service worker se remplace tout seul, sw.js est en no-store). Si l'écran vide persistait APRÈS
   rechargement, ce serait un défaut distinct, non observé dans le code ni dans journal_erreurs —
   revenir vers l'audit avec l'heure exacte pour croiser le journal.
2. **/evenements avant tout lancement public** : la page fabrique « chaque année vers le 1 janvier »
   pour 40 événements sur 42 (`new Date(null)` sur une colonne vide). Soit lire `periode`/`mois`
   (remplies à 42/42), soit masquer la ligne de date — mais ne pas lancer avec un calendrier faux
   sur la page qui incarne le sérieux du référentiel.
3. **Deux inversions de branches (4 lignes en tout)** : PagePro.tsx:354↔371 et Post.tsx:96↔113,
   pour qu'un échec réseau sur les deux écrans les plus partagés dise « réessayez » au lieu de
   « n'existe pas ».

Non bloquants mais à programmer : régénérer ou compléter types.ts (9 colonnes manquantes sur
3 tables, nullabilité mentie sur events.starts_on — c'est ce trou qui a laissé passer le bug des
dates), écouter `vite:preloadError` pour recharger au lieu de planter après un déploiement,
retirer le console.log d'imageCompression.ts:35, et purger le code mort (~750 lignes + 48 fichiers
shadcn, inchangé depuis le relevé du matin).
