# 02 — Audit détaillé par domaine (Phase 2)

Établi le 05/09/2026 sur `https://diako.fonenako.mg` (bundle `index-NcW107pc.js`, build du 03/09).
**Barème appliqué à chaque domaine, à partir de 100 :** P0 −25 (et le domaine devient bloquant), P1 −8, P2 −3, P3 −1. Effort en heures (H), impact ↑ (faible) ↑↑ (moyen) ↑↑↑ (fort).
Chaque constat est **vérifié** (source citée) sauf mention **NON VÉRIFIÉ**.

Sources principales : `$TEMP/crawl.json` (49 URL), `$TEMP/mesures.json` (8 tailles × 5 pages, INP, clavier, 3G, prod), `$TEMP/lcp-accueil.json`, en-têtes HTTP prod, SQL du 05/09 via le connecteur, advisors Supabase, `npm audit`, `qa-*.log`, config auth (API de gestion).

---

## 1. Performance & Core Web Vitals — **64 / 100** (poids 12)

Mesures **en production, réseau réel depuis Madagascar**, Chrome mobile émulé 390 × 844, première visite (cache vide, sans service worker) :

| Page | TTFB | FCP | LCP | Requêtes | Transfert | Élément LCP |
|---|---|---|---|---|---|---|
| `/` (accueil) — 3 mesures espacées de 45 s (`lcp-accueil.json`) | 542–557 ms | 564–588 ms | **3 076 / 2 616 / 2 552 ms** (médiane 2 616 ms). Une 1ʳᵉ mesure isolée à 4 280 ms, prise pendant l'épisode 429 de l'après-midi, n'a pas été reproduite. | 48–50 | **1 158–1 410 Ko** | image du 1ᵉʳ récit (`…/01.jpg`) |
| `/lieu/mahajanga` | 538 ms | 584 ms | 2 656 ms | 34 | 538 Ko | — |
| `/explorer` | 544 ms | 564 ms | 2 596 ms | 23 | 658 Ko | image de couverture |
| `/p/les-trois-metis` | 593 ms | 612 ms | 3 172 ms | 42 | **979 Ko** | — |

CLS accueil **0,007** ✅ · INP (proxy : 10 clics sur les onglets, le menu, une photo) **max 40 ms** ✅ · DOM 758 nœuds ✅ · 1 domaine tiers (Supabase) · **HTTP/1.1 seulement** (o2switch) · Brotli ✅ · coquille JS 230 Ko br.

**Chaîne du LCP de l'accueil** (3 traces du 05/09) : FCP ≈ 0,58 s → le JS (230 Ko br, HTTP/1.1) finit de s'exécuter ≈ 1,5 s → **première requête Supabase à 1 493–1 556 ms** (DNS + TCP + TLS sur un domaine encore inconnu) → dernière réponse à 2 171–2 729 ms → image LCP. Le serveur, lui, répond en 4 à 146 ms (chronométrage sous le rôle `anon` : `feed_filtre` 9,5 ms, `get_feed` 4,1 ms, `sites_par_region` 145,7 ms). **Le temps est perdu dans le réseau (attente du JS, puis connexion Supabase), pas dans la base.**

**Poids de l'accueil** (`poids-accueil.mjs`, 05/09) : **1 396 Ko** en première visite, dont **1 121 Ko = 35 images JPEG de `/uploads/`** (45–89 Ko chacune : toutes les diapositives des carrousels des 5 premiers récits sont téléchargées, pas seulement la première), 86 Ko `index-*.js`, 64 Ko `supabase-vendor`, 60 Ko `react-vendor`. Les variantes `.thumb.webp` (40 Ko) et `.w960.webp` (82 Ko) existent en ligne mais le fil charge l'original `.jpg` (`ImageProgressive.tsx:69` : `srcSet` à deux entrées seulement, sans `.w960`).

3G rapide (1,6 Mb/s, 150 ms) sur le build local (statique non compressé, Supabase réel) : LCP **5 920 ms**, borne haute.

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| PF1 | **LCP accueil 2,6–3,1 s** (zone « à améliorer », cible 2,5 s) sur la page qui reçoit tout le trafic de lancement ; 0 image en `fetchpriority="high"` **au premier rendu** (la 1ʳᵉ carte l'a, mais après l'arrivée des données), 28/68 images sans `width/height` | P1 | 2 h | ↑↑↑ | `<link rel="preconnect" href="https://eifrwecaszzqrdwjjjbu.supabase.co" crossorigin>` dans `index.html` (−300 à −500 ms) ; lancer les 4 RPC de l'accueil **avant** la fin du JS (`fetch` dans `app-init.js`, résultat repris par le client : −0,9 s) ; dimensions sur toutes les images. Patch 03-06. |
| PF2 | Aucun `preconnect`/`dns-prefetch` vers Supabase (`index.html` : 0 occurrence) | P1 | 0,2 h | ↑↑↑ | Inclus dans PF1. |
| PF7 | **1,4 Mo pour l'accueil en 3G** : 35 diapositives chargées pour 5 récits, originaux JPEG au lieu des variantes WebP existantes | P1 | 2 h | ↑↑↑ | Carrousel : ne monter que la diapositive courante et la suivante (IntersectionObserver), `srcSet` 480/960/1600 via `srcsetPour()` de `imageThumb.ts:34-36`. Cible : < 400 Ko. Patch 03-06. |
| PF3 | Fiche établissement à 979 Ko en première visite (images de galerie chargées d'emblée) | P2 | 2 h | ↑↑ | Galerie en `loading="lazy"` au-delà de la 1ʳᵉ image ; variante `.w960` maximum sur mobile. |
| PF4 | HTTP/1.1 : 40 requêtes en file sur 6 connexions | P2 | 1 h (DNS) | ↑↑ | CDN devant o2switch (Cloudflare gratuit : HTTP/3, cache des images, Brotli) — voir Ops. |
| PF5 | 46 requêtes pour l'accueil en 3G : 15 tuiles/icônes + polices d'icônes SVG par composant | P2 | 3 h | ↑ | Sprite SVG unique ; regrouper les 3 petits chunks < 5 Ko. |
| PF6 | Pas de budget de performance ni de mesure continue | P2 | 2 h | ↑↑ | Lighthouse CI en `ci.yml` avec budget LCP 2,5 s / 300 Ko (06). |

---

## 2. Sécurité — **59 / 100** (poids 15)

**Solide** : HTTPS 301 ✅ ; HSTS 1 an ✅ ; CSP présente (`default-src 'self'`, `object-src 'none'`, `base-uri`, `frame-ancestors`) ✅ ; `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` ✅ ; **RLS sur 100 % des tables** ✅ ; 0 policy sans sous-`select` sur `auth.uid()` ✅ ; `search_path` fixé sur les `SECURITY DEFINER` (l'advisor n'en signale qu'une : `dk_famille_carte`) ✅ ; envoi d'images : JWT vérifié côté serveur via `/auth/v1/user` ou clé serveur, dossier `uploads/` sans exécution PHP (`public/uploads/.htaccess`) ✅ ; `env.php` ne fuit rien (0 octet) ✅ ; **aucun secret dans le dépôt public** (seule la clé `anon`, publique par construction) ✅ ; `npm audit` : 0 critique, 3 hautes **toutes dans la chaîne de build** (non exposées en prod) ✅ ; RPC privées refusées à `anon` (`0106`) ✅ ; anti-énumération des propriétaires (booléen, jamais `owner_id`) ✅.

| # | Constat vérifié | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| SE1 | **Mot de passe : 6 caractères minimum côté serveur, aucune règle de complexité, HIBP désactivé** (config auth lue par l'API de gestion) alors que le client exige 8 (`Auth.tsx:69`). Un appel direct à l'API accepte « 123456 ». | P1 | 0,3 h | ↑↑ | Lancer `scripts/appliquer_config_auth.py` (déjà écrit, jamais exécuté : `password_min_length: 8`, `password_hibp_enabled: true`) **sur ordre explicite d'Andry**. |
| SE2 | **Aucun captcha à l'inscription** (`grep captcha|turnstile|hcaptcha src` = 0) avec `signup_open = true` : au premier partage Facebook, création de comptes en masse et spam du fil possibles. | P1 | 3 h | ↑↑ | Cloudflare Turnstile (gratuit) : `security_captcha_enabled` + `captcha_provider: turnstile` côté Supabase, widget dans `Auth.tsx`. Patch 03-05. |
| SE3 | `uri_allow_list` contient `http://localhost:8080/**` (redirections OAuth acceptées vers localhost) | P2 | 0,1 h | ↑ | Retirer de la liste (API de gestion ou tableau de bord). |
| SE4 | CSP : `'unsafe-inline'` sur `script-src` **n'est plus nécessaire** — `dist/index.html` ne contient aucun script en ligne (JSON-LD n'est pas exécuté ; `app-init.js` et le module sont externes ; 0 `onclick=`). Le commentaire `.htaccess:36-39` est périmé. | P2 | 0,3 h | ↑↑ | `script-src 'self'` ; garder `'unsafe-inline'` sur `style-src` (Leaflet et Radix posent des styles en ligne). Patch 03-02. |
| SE5 | HSTS sans `preload` | P3 | 0,1 h | ↑ | `max-age=63072000; includeSubDomains; preload` (ne soumettre à hstspreload.org qu'après accord : irréversible pour `fonenako.mg` entier). |
| SE6 | Sessions sans expiration (`sessions_timebox`, `sessions_inactivity_timeout` = 0) ; changement de mot de passe **sans ré-authentification** (`security_update_password_require_reauthentication = false`) | P2 | 0,2 h | ↑ | Inactivité 30 jours ; ré-authentification activée. Même script que SE1. |
| SE7 | **DMARC `p=none`** sur `fonenako.mg` (DNS lu le 05/09) : les mails `no-reply@diako.fonenako.mg` peuvent être usurpés sans rejet. SPF ✅ (`+a +mx +ip4:109.234.166.169 ~all`), DKIM ✅. | P2 | 0,2 h | ↑ | `v=DMARC1; p=quarantine; rua=mailto:contact.diako@gmail.com; pct=100` après 2 semaines de rapports en `p=none`. |
| SE8 | `page_views` : `INSERT` ouvert à `public` avec `with_check = true`, sans plafond (trigger `dk_compter_vue` incrémente des compteurs) : un script peut gonfler les vues de n'importe quelle fiche ou remplir la table. | P2 | 1 h | ↑ | Passer par une RPC `noter_vue(path)` avec `agent_rate_hit`-like par `sid` (max 60/min) ; ou contrainte de longueur + TTL. Patch 03-09. |
| SE9 | 138 avertissements `multiple_permissive_policies` (advisor) : lisibilité et coût par requête | P3 | 4 h | ↑ | Fusionner par table, en commençant par `posts`, `pages`, `profiles`. |
| SE10 | `www.diako.fonenako.mg` sert le site sans redirection : surface doublée, cookies/HSTS par hôte | P2 | 0,2 h | ↑ | Redirection 301 vers l'apex. Patch 03-02. |
| SE11 | Mise à niveau Postgres en attente (advisor) — correctifs de sécurité non appliqués | P3 | 0,5 h | ↑ | Planifier la mise à niveau depuis le tableau de bord (fenêtre de nuit, sauvegarde avant). |
| SE12 | `agent-diako` : limite **20 requêtes/min par IP** — derrière un CGNAT malgache, une IP = des centaines d'utilisateurs ; limite globale 600/min ✅ | P2 | 1 h | ↑ | Clé = `sid` (identifiant de session déjà présent dans `page_views`) plutôt que l'IP ; garder l'IP en second rideau à 200/min. |

Contrôle OWASP 2025 rapide : injection (RPC paramétrées, aucun SQL construit côté client) ✅ ; auth cassée (voir SE1/SE2/SE6) ⚠ ; exposition de données (colonnes énumérées, `select('*')` interdit, PII fermée par grants par colonne) ✅ ; XSS (React échappe ; `partage.php` : 1 seul appel `htmlspecialchars` pour plusieurs sorties — **à relire, NON VÉRIFIÉ ligne par ligne**) ⚠ ; SSRF (`partage.php` et `sitemap.php` n'appellent que l'URL Supabase fixe) ✅ ; téléversement (extension forcée, dossier sans exécution) ✅ ; journalisation (`journal_erreurs` sans alerte, voir 11) ⚠.

---

## 3. Design & UX — **87 / 100** (poids 10)

**Solide** : système de design cohérent (85 jetons, 43 classes `dk-*`, 50 composants shadcn), mode sombre ✅, états vides et d'erreur avec action (`Etats.tsx`) ✅, `ErrorBoundary` avec bouton « Recharger » ✅, squelettes de chargement ✅, vocabulaire « Demander » respecté (aucun « Réserver ») ✅, corail `#F4633A` jamais porteur de texte (contrastes recalculés AA) ✅, `DESIGN-HANDOFF.md` présent.

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| UX1 | **Invite d'installation PWA affichée dès la première visite**, par-dessus le texte du premier récit (capture 390 px du 05/09, `InstallPrompt.tsx:56`) | P2 | 0,5 h | ↑↑ | N'afficher qu'à la 2ᵉ visite (`localStorage` compteur) ou après 2 pages vues, jamais sur `/auth`. Patch 03-06. |
| UX2 | Ligne d'auteur du récit rognée sous les puces de filtre (capture 390 px) | P2 | 0,5 h | ↑ | Marge haute de la 1ʳᵉ carte = hauteur des puces collantes (`scroll-margin-top`). |
| UX3 | 22 textes < 12 px sur l'accueil (11 px : « MADAGASIKARA », étiquettes du menu, « il y a 3 j », compteurs « 1/2 » ; 10 px : « bientôt ») ; 75 sur `/explorer` | P2 | 1 h | ↑ | Plancher 12 px (`text-xs` = 12 px, supprimer `text-[11px]`, `text-[10px]`). |
| UX4 | `/pro/:slug` d'une fiche d'autrui : « Vous ne gérez pas cette fiche » **sans issue** | P3 | 0,3 h | ↑ | Lien « Voir la fiche publique » + « Revendiquer ». |
| UX5 | Le menu expose 24 entrées dont 2 « bientôt » (`Circuits`, `Guides`) : entrées vers des écrans vides, contraires à `CLAUDE.md:30-31` même signalées | P3 | 0,3 h | ↑ | Masquer tant que `pret: false` (ne garder l'annonce que dans le pied de page). |
| UX6 | 35 espacements en px arbitraires hors échelle (`grep -c 'text-\[\|p-\[\|m-\['`) ; maquette de référence `Diako Design Final.dc.html` **absente du dépôt** | P3 | 2 h | ↑ | Ramener à l'échelle ; versionner ou lier la maquette (claude.ai/design). |

---

## 4. Mobile — **80 / 100** (poids 12)

Mesuré sur 5 pages × 8 tailles (360, 390, 414, 768, 1024, 1280, 1536, et paysage 844 × 390) : **0 débordement horizontal** ✅ ; champs à 16 px sur mobile (0 < 16 px, anti-zoom iOS) ✅ ; `viewport-fit=cover` ✅ ; manifeste complet (icônes 192/512 + maskable, raccourcis, `share_target`) ✅ ; service worker : coquille précachée, `offline.html` ✅ ; `theme-color` clair/sombre ✅.

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| MO1 | **50 cibles sur 109 sous 44 × 44 px** sur l'accueil à 390 px : puces de filtre 32 px de haut, boutons d'en-tête 36 px (règle du projet `CLAUDE.md:47` : 44 × 44) | P2 | 1 h | ↑↑ | `min-h-11` sur les puces et boutons d'icône ; garder l'aspect avec `py-1.5` + zone tactile étendue (`before:` pseudo-élément). |
| MO2 | **Cibles < 24 px** (WCAG 2.5.8) : bouton « plus » 25 × 23, lien « Ouvrir » 34 × 16 dans chaque carte de récit (les liens dans le texte sont exemptés) | P2 | 0,5 h | ↑ | `min-h-6 px-2` sur ces deux contrôles. |
| MO3 | LCP 3G ≈ 5,9 s (borne haute, build local) — le public cible est en 3G (`CLAUDE.md:5`) | P1 | (= PF1) | ↑↑↑ | PF1 + CDN. |
| MO4 | `share_target` du manifeste (`POST /publier`) : un partage Android arrive sur le mur de connexion et **le contenu partagé est perdu** | P2 | 2 h | ↑ | Stocker titre/texte/photos en `sessionStorage` avant redirection vers `/auth`, restaurer après connexion. |
| MO5 | `offline.html` : « Hors ligne - Fonenako », charte bleue Fonenako | P2 | 0,3 h | ↑ | Rebrander (patch 03-08). |
| MO6 | Paysage 844 × 390 : navigation basse + en-tête = 120 px sur 390 de haut (31 % de l'écran) | P3 | 1 h | ↑ | Masquer la barre basse en paysage court (`@media (max-height: 420px)`). |

---

## 5. Accessibilité (WCAG 2.2 AA) — **77 / 100** (poids 8)

**Solide** : `lang="fr"` ✅ ; repères `banner/main/nav/contentinfo/search` ✅ ; **0 bouton sans nom, 0 image sans `alt`** sur 49 pages ✅ ; anneau de focus `2 px solid` visible sur les 18 premiers éléments tabulés ✅ ; `prefers-reduced-motion` respecté (4 règles) ✅ ; contrastes texte recalculés AA après le correctif « or-fort » (08/2026) ✅ ; toasts en région `aria-live` (sonner) ✅ ; Échap ferme le panneau de l'agent ✅.

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| AC1 | **Pas de h1 sur l'accueil** (1.3.1 / 2.4.6) | P1 | 0,3 h | ↑↑ | h1 « Où dormir, où manger et avec qui partir à Madagascar » au-dessus du fil (patch 03-03). |
| AC2 | **Champ sans étiquette** : `ChampLieu.tsx:209` (`role=combobox`, placeholder seul) sur `/quand-partir` et partout où `ChampLieu` sert (3.3.2 / 4.1.2) | P1 | 0,2 h | ↑↑ | `aria-label` propagé par prop, valeur par défaut « Destination ». Patch 03-07. |
| AC3 | Focus initial posé dans le `main` : la 1ʳᵉ tabulation arrive sur « Découvrir » ; le lien d'évitement et l'en-tête ne sont atteints qu'en Maj+Tab | P3 | 0,3 h | ↑ | Ne forcer le focus sur `main` qu'après une navigation interne, pas au premier chargement. |
| AC4 | Textes < 12 px (voir UX3) et cibles < 24 px (MO2) | P2 | (idem) | ↑ | idem. |
| AC5 | Écran d'erreur générique « Recharger » sans `role="alert"` **NON VÉRIFIÉ** (`ErrorBoundary.tsx` non relu en entier) | P3 | 0,1 h | ↑ | Ajouter `role="alert"`. |
| AC6 | Aucun test d'accessibilité automatisé (axe) dans la CI | P2 | 1 h | ↑↑ | `@axe-core/playwright` sur 6 pages (06). |

---

## 6. SEO / GEO — **67 / 100** (poids 8)

**Solide** : sitemap dynamique 6 436 URL avec `lastmod` et images ✅ ; `robots.txt` complet, groupes IA explicites ✅ ; JSON-LD sur toutes les pages (jusqu'à 4 blocs par fiche) ✅ ; Open Graph + Twitter ✅ ; **aperçus de partage servis aux robots sans JS** (`partage.php`, `.htaccess:86-88`) ✅ ; titres descriptifs avec compteurs réels ✅ ; `<noscript>`/squelette HTML statique pour les robots sans JS (`index.html:115`) ✅.

| # | Constat vérifié | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| SO1 | **Canonique = accueil sur 18 pages** (T2 de 01) : légales, recherche, auth, pro… | P1 | 1 h | ↑↑ | `useSEO` sur chaque page publique (patch 03-03). |
| SO2 | **Aucun `noindex`** : écrans 404 (HTTP 200), fiches inexistantes, écrans privés indexables | P1 | 1 h | ↑↑ | Option `noindex` dans `useSEO` ; posée sur NotFound, Auth, Bienvenue, Compte, Parametres, Favoris, Messages, Notifications, Admin, Pro*, résultats de recherche, `/user/:id`. Patch 03-03. |
| SO3 | Pas de h1 sur l'accueil | (= AC1) | | | |
| SO4 | Sitemap : `/pro` (privée), `/circuits` et `/guides` (vides), `/recherche` (canonique faux) ; `lastmod` accueil figé au 01/08 | P2 | 0,3 h | ↑ | `sitemap.php:78,98,108,111,113`. Patch 03-03. |
| SO5 | `www` sans redirection (contenu dupliqué) | P2 | (= SE10) | ↑ | |
| SO6 | Description identique sur 20 pages ; descriptions de fiches à 41–89 caractères | P2 | 2 h | ↑ | `useSEO` partout ; description = 155 premiers caractères de `long_desc`. |
| SO7 | Titres de récits « Récit à Hell-Ville — Diako » indistincts | P2 | 0,3 h | ↑ | Titre = début du corps + lieu. |
| SO8 | **Pas de `llms.txt`** (les groupes IA du `robots.txt` sont invités sans carte) ; JSON-LD sans `sameAs`/`areaServed` sur l'organisation | P2 | 1 h | ↑↑ | `public/llms.txt` (patch 03-03) ; enrichir `Organization`. |
| SO9 | `/admin` absent de `robots.txt` | P3 | 0,1 h | ↑ | Ajouter aux 5 groupes. |
| SO10 | Aucune Search Console / Bing Webmaster vérifiée **NON VÉRIFIÉ** (pas d'accès) | P2 | 0,5 h | ↑↑ | Vérifier le domaine, soumettre le sitemap, surveiller les soft-404. |

---

## 7. Pages & contenu — **73 / 100** (poids 8)

**Solide** : 3 412 fiches, 22 707 lieux, 2 521 sites, 95 plats, 88 événements ; 213 récits nettoyés du chrome Facebook (1 résiduel volontaire) ; pages légales existantes ; pied de page avec avertissement « ne vend pas de séjours » ✅.

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| CO1 | **Pages légales incomplètes au regard du RGPD (art. 13)** : ni responsable de traitement nommé, ni base légale, ni durées de conservation, ni sous-traitants (Supabase, o2switch), ni droits et voie de recours (CNIL/CMIL) — 242 mots | P1 | 3 h | ↑↑ | Réécrire `Confidentialite.tsx` et `Mentions.tsx` (gabarits dans 04). |
| CO2 | **Aucune page « À propos », « Aide/FAQ » ni « Contact »** : pour une marque inconnue, la confiance se construit sur ces trois pages (qui vérifie les prix ? est-ce gratuit ? comment revendiquer ?) | P1 | 4 h | ↑↑↑ | Construites dans 04 (`/a-propos`, `/aide`), câblées dans `App.tsx`, le pied de page et le sitemap. |
| CO3 | Contact « Nous écrire » et suppression de compte → **`contact.fonenako@gmail.com`** (`Footer.tsx:49`, `Parametres.tsx:222`) | P2 | 0,2 h | ↑ | `contact.diako@gmail.com` (compte existant, `Admin.tsx:15`). Patch 03-08. |
| CO4 | 277 fiches du bot non publiées dont 76 doublons probables — décision en attente | P2 | 2 h | ↑↑ | Trancher (Q3), SQL prêt dans `docs/A-APPLIQUER.md`. |
| CO5 | `/evenements` : 27 573 caractères d'un bloc, 183 liens | P2 | 2 h | ↑ | Curseur 20 par page. |
| CO6 | 0 commentaire, 0 avis, 2 réactions : la preuve sociale est vide au lancement | P3 | — | ↑↑ | Amorcer avec l'équipe (10 récits signés de vraies personnes, 30 réactions) avant l'annonce. |
| CO7 | « Circuits · bientôt » et « Guides · bientôt » visibles dans le pied de page et le menu | P3 | (= UX5) | | |

---

## 8. Parcours fonctionnels — **66 / 100** (poids 12)

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| FN1 | **`/circuit/:slug` cassé** : RPC 400 `column tour_prices_1.pax_min does not exist` (`Circuit.tsx:66-72` contre le schéma réel). L'unique circuit est illisible. | P1 | 1,5 h | ↑↑ | Patch 03-04 (requête + rendu alignés sur `base_pax`, `jour/titre/detail/nuitee`, `libelle/inclus`). |
| FN2 | **Inscription de bout en bout NON VÉRIFIÉE** (aucun compte de test créé en prod) ; e-mails de confirmation **en anglais, gabarits d'usine** (config auth lue le 05/09 ; `docs/supabase-config-manuelle.md §3` « À FAIRE ») | P1 | 0,3 h + test 0,5 h | ↑↑↑ | Lancer `appliquer_config_auth.py` (sur ordre), puis un test réel avec une adresse jetable (07). |
| FN3 | Inscription Google : retour sur `/` sans passer par `/bienvenue` → jamais de choix voyageur/pro (`docs/RESTE-A-FAIRE.md`, `Auth.tsx:106-112`) | P1 | 1 h | ↑↑ | `redirectTo: /bienvenue` + garde « profil incomplet » sur `/publier`. |
| FN4 | Revendication pro : NON VÉRIFIÉE de bout en bout ; 0 dossier en base ; l'exigence de pièces n'est que côté client (`RESTE-A-FAIRE.md`) | P2 | 2 h | ↑↑ | Contrainte dans `revendiquer_page` (au moins une pièce non nulle) + test à deux comptes. |
| FN5 | Messagerie et notifications jamais exercées (0 ligne) | P2 | 1 h de test | ↑↑ | Scénario à deux comptes dans 07. |
| FN6 | `/compte` tire `mon_activite` et `mes_publications` avant de connaître l'utilisateur (2 × 401) | P3 | 0,3 h | ↑ | Garde `if (!user) return` dans les sous-composants (`Compte.tsx:156,408`). |
| FN7 | `share_target` perdu pour un non-connecté | P2 | (= MO4) | | |
| FN8 | Suppression de compte = un toast qui dit d'écrire un e-mail (`Parametres.tsx:221-224`) ; **aucune fonction d'effacement ni d'export en base** (0 fonction `*compte*`, `*export*`, `*supprim*` hors admin) | P2 | 3 h | ↑↑ | RPC `supprimer_mon_compte()` (anonymisation des récits, suppression `auth.users` par Edge Function) + export JSON. Patch 03-11. |

---

## 9. Qualité du code — **75 / 100** (poids 7)

**Solide** : TypeScript strict, `typecheck` vert, 72 tests unitaires verts (5 fichiers), migrations numérotées avec blocs de contrôle, `types.ts` régénéré, commentaires qui expliquent le *pourquoi*, scripts de vérification de déploiement et de contrat client/base.

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| CQ1 | **`npm run lint` échoue** (1 erreur `no-useless-escape` `src/components/Prix.tsx:60`) → **la CI est rouge sur la branche déployée** | P1 | 0,1 h | ↑↑ | `"l'entrée"` sans antislash. Patch 03-08. |
| CQ2 | **0 test de bout en bout** ; aucun test des parcours P3/P4/P6 | P1 | 6 h | ↑↑↑ | Playwright : 6 scénarios (06). |
| CQ3 | **`main` ≠ production** (35 commits sur `feat/bot-collecte-diako`, prod = build de la branche) | P1 | 0,5 h | ↑↑ | Fusionner avant lancement (Q4) ; règle : on ne déploie que `main`. |
| CQ4 | Contradiction documentaire : `CLAUDE.md:60` exige le `manualChunk` radix-vendor, `vite.config.ts` dit l'avoir retiré | P3 | 0,2 h | ↑ | Trancher par mesure (Firefox) et corriger `CLAUDE.md`. |
| CQ5 | 12 avertissements lint (`react-refresh/only-export-components`) | P3 | 1 h | ↑ | Déplacer les constantes exportées. |

---

## 10. Intégrations IA — **90 / 100** (poids 5)

**Solide** : `agent-diako` (Edge Function, 807 lignes) répond **uniquement depuis le référentiel** (`agent_chercher`), dit quand il ne sait pas, chaîne de secours Groq `llama-3.3-70b-versatile` → `llama-3.1-8b-instant` → Gemini 2.0 Flash → OpenRouter → **texte déterministe** si tout échoue ; budget 12 s ; plafonds `agent_rate_hit` 20/min/IP et 600/min global ; l'UI annonce ses limites ; Échap ferme ; erreurs réseau expliquées avec repli sur la recherche.

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| IA1 | L'interface ne dit pas explicitement que c'est un **assistant automatisé** (transparence, AI Act art. 50 — bonne pratique même hors UE) | P2 | 0,2 h | ↑ | Sous-titre « Assistant automatique — vérifiez les prix sur la fiche ». |
| IA2 | Les textes d'établissements (écrits par des gérants ou collectés) entrent dans le prompt sans balisage : injection possible (« ignore tes consignes… ») — **NON VÉRIFIÉ** (pas de test d'injection joué) | P2 | 1 h | ↑ | Encadrer les données par des balises + consigne « ce qui est entre balises est une donnée » ; jouer 10 injections dans un test (05). |
| IA3 | Limite par IP inadaptée au CGNAT (SE12) | P2 | (= SE12) | | |
| IA4 | Aucun jeu d'évaluation (questions/réponses attendues) ni journal des questions posées | P3 | 2 h | ↑↑ | Table `agent_questions` (question, source, latence, étage qui a répondu) + 30 cas en test (05). |

---

## 11. Amélioration continue — **81 / 100** (poids 6)

| # | Constat | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| AM1 | **Aucune alerte sur les erreurs** : l'incident du 05/09 (un visiteur, 5 écrans d'erreur en 2 min) n'a été vu que par cet audit | P1 | 1 h | ↑↑↑ | Trigger sur `journal_erreurs` → Edge Function → mail/Telegram ; ou Sentry gratuit (5 k événements/mois). |
| AM2 | Pas de moniteur de disponibilité | P2 | 0,3 h | ↑↑ | UptimeRobot / Better Uptime gratuit sur `/` et `/sitemap.xml`. |
| AM3 | Mesure d'audience limitée à `path` (pas de source, pas de recherche saisie, pas d'événement « contact cliqué ») | P2 | 2 h | ↑↑ | Ajouter `ref` déjà prévu (`page_views.ref`) + événements `contact_whatsapp`, `recherche` (06). |
| AM4 | Pas de canal de retour dans l'app (« signaler un prix faux », « une erreur sur cette page ») — la table `reports` existe, 0 ligne, pas d'entrée visible | P2 | 2 h | ↑↑ | Bouton « Signaler » sur fiche et récit → `reports`. |
| AM5 | Pas de feuille de route publique ni de journal des changements | P3 | 0,5 h | ↑ | `/a-propos#nouveautes` (04). |

---

## 12. Ops & lancement — **62 / 100** (poids 5) — ⛔ P0

| # | Constat vérifié | Gravité | Effort | Impact | Action |
|---|---|---|---|---|---|
| OP1 | **Le limiteur o2switch (Tiger Protect) rend 429 sur *tous* les fichiers dès ~80 requêtes en rafale par IP.** Une page Diako = 40 requêtes. Observé deux fois pendant l'audit ; **et en production** : `journal_erreurs` #10–14, un Samsung A15 en 4G a vu l'écran d'erreur sur `/compte`, `/recherche`, `/pro`, `/favoris`, `/gouts` entre 11:51 et 11:53 UTC le 05/09 ; bingbot pareil sur `/plats` et `/carte`. Mécanisme : un morceau JS refusé → `vite:preloadError` → `surModuleAbsent` fait `e.preventDefault()` **même quand il ne recharge pas** (`main.tsx:35-45`), l'import résout `undefined` → React : « Cannot read properties of undefined (reading 'default') » → écran d'erreur. Derrière un CGNAT, le compteur est **partagé entre visiteurs**. | **P0** | 2 h + DNS | ↑↑↑ | (a) Désactiver la règle par défaut Tiger Protect pour le domaine (cPanel → TigerProtect → règles) ou demander au support une limite ≥ 600/min ; (b) **CDN Cloudflare gratuit** devant l'origine (les fichiers `/assets/*` immuables et `/uploads/*` ne touchent plus o2switch) ; (c) correctif client : réessai d'import après 1,5 s avant l'écran d'erreur, `preventDefault` seulement quand on recharge. Patch 03-01. |
| OP2 | `main` ≠ prod (CQ3) | | | | |
| OP3 | Sauvegardes Supabase : dépend du plan (Free = aucune sauvegarde automatique) — **NON VÉRIFIÉ** | P2 | 0,5 h | ↑↑ | Vérifier le plan ; sinon `pg_dump` hebdomadaire par script planifié (`scripts/sauvegarde_base.py`). |
| OP4 | Pas d'environnement de préproduction (les migrations partent en prod via le connecteur, après accord) | P2 | 2 h | ↑ | Branche Supabase de test ou projet `diako-preprod`. |
| OP5 | Pas de runbook d'incident (qui regarde quoi, comment revenir en arrière) | P2 | 1 h | ↑↑ | `07-checklist-lancement.md §Retour arrière`. |
| OP6 | `redeploy.sh` peut annoncer « terminé » après un timeout FTP — mitigé par `scripts/verifier_deploiement.py` | P3 | — | | Garder la vérification du hash obligatoire. |
| OP7 | Postgres à mettre à niveau (SE11) | P3 | | | |
| OP8 | Codes 403/500 Apache non personnalisés | P3 | 0,2 h | ↑ | `ErrorDocument` (patch 03-02). |

---

## Récapitulatif des P0 et P1

| Gravité | Nombre | Références |
|---|---|---|
| **P0** | 1 | OP1 (limiteur 429 + écran d'erreur — incident réel du 05/09) |
| **P1** | 19 | PF1, PF2, PF7, SE1, SE2, MO3, AC1, AC2, SO1, SO2, CO1, CO2, FN1, FN2, FN3, CQ1, CQ2, CQ3, AM1 |

Le P0 a un correctif prêt (03-01 : réessai côté client + limiteur/CDN côté serveur) et se re-mesure en une heure : le blocage est **levable avant le lancement**, ce qui fonde la décision de 08.
