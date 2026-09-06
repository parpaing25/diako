# 09 — Plan des 35 heures : ce qui est tranché, ce qui reste à trancher, l'avancement

Établi le 06/09/2026 à la demande d'Andry (« tranche ce que tu peux, liste le reste, fais un plan et fais-le »). Mis à jour au fil de l'exécution — la colonne « État » dit ce qui est **fait et vérifié**.

## 1. Tranché par la session (sans attendre)

| Décision | Choix retenu | Pourquoi |
|---|---|---|
| Protection HIBP (mots de passe divulgués) | **Abandonnée sur le plan gratuit** : Supabase répond 402 « Pro Plans and up ». Le script d'auth ne la demande plus dans le corps principal (elle est tentée à part, sans bloquer le reste). | Le 402 annulait TOUT le PATCH : aucun sujet, aucun gabarit, aucune longueur de mot de passe n'était posé. |
| Sessions à durée limitée | Tentées à part (plan Pro probable), refus signalé sans bloquer | idem |
| CSP `script-src 'self'` (sans `unsafe-inline`) | **Appliquée** | 0 refus sur 8 pages du build servi avec l'en-tête (`verif-csp.mjs`, 06/09) |
| HSTS `preload` | Directive posée, **pas de soumission** à hstspreload.org | Irréversible et engage Fonenako et AKORA : décision d'Andry, pas nécessaire au lancement |
| Entrées « Circuits · bientôt » / « Guides · bientôt » dans le menu | **Conservées** | Choix documenté du projet (`SideNav.tsx:12` : « la pastille dit la vérité avant le clic ») ; sorties du sitemap seulement |
| Photos des récits à la suppression d'un compte | Non effacées par la fonction (orphelines, hors de tout lien) ; nettoyage hebdomadaire à prévoir | La clé serveur d'`o2delete.php` n'a pas à vivre dans une fonction Supabase pour le lancement |
| Alerte sur les erreurs | pg_cron + pg_net → Edge Function → **Telegram** (secrets à poser) ; repli : journal de la fonction | Pas de tiers de plus (Sentry) ; le canal Telegram existe déjà pour les bots |
| Tests de bout en bout | Playwright, 4 fichiers, **lecture seule**, agent Android réel, axe-core (0 violation serious/critical) | Aucune écriture en base depuis la CI (règle du 03/09) |
| Lighthouse CI | **Pas mis en CI** ; le budget brotli existant (200 Ko) reste, les mesures LCP se font depuis Madagascar (`lcp-accueil.mjs`) | Une mesure de temps depuis un runner GitHub aux États-Unis ne dit rien du 3G malgache |
| Vues (`page_views`) | Par RPC plafonnée (0120) avec repli client tant que la migration n'est pas passée | Ferme l'insertion ouverte sans couper le comptage |

## 2. À trancher ensemble (la session ne peut pas, ou ne doit pas)

| # | Question | Ce que je recommande | Ce que ça demande de toi |
|---|---|---|---|
| A | **Limiteur o2switch (le P0)** | **Aujourd'hui** : cPanel → Outils → TigerProtect → règles → `diako.fonenako.mg` → « Sécurité par défaut o2switch » **Off**. Cloudflare ensuite, à tête reposée (touche le DNS de tout `fonenako.mg`). | 2 minutes dans cPanel ; puis `node $TEMP/crawl.mjs` contre la prod pour prouver 0 × 429 |
| B | **Plan Supabase** | Rester en gratuit pour le lancement **si** tu acceptes : pas de sauvegarde automatique, pas de HIBP, pas de limite de session. Sinon Pro (25 $/mois) règle les trois. | Décision d'argent |
| C | **277 fiches du bot non publiées** (76 doublons probables, 38 sans contact) | Publier les fiches **sans doublon et avec au moins un contact**, garder le reste invisible ; SQL prêt dans `docs/A-APPLIQUER.md` | Ton OK, puis SQL par l'éditeur |
| D | **Qui signe les mentions légales** | Personne physique ou société, adresse, NIF/STAT | Un nom et une ligne d'adresse |
| E | **Captcha Turnstile** | Code prêt à brancher (03-05 §2) dès que la clé existe | Créer le widget sur dash.cloudflare.com (5 min), me donner la clé de site (publique) et poser la clé secrète dans Supabase → Auth → Attack protection |
| F | **Alerte Telegram** | Réutiliser un bot existant du pont des bots | Un jeton de bot + ton `chat_id`, à poser dans les secrets de la fonction `alerte-erreurs` |
| G | **DMARC** | `p=none; rua=mailto:contact.diako@gmail.com` maintenant, `quarantine` à J+15 | Une ligne TXT `_dmarc.fonenako.mg` dans la zone DNS |
| H | **Parcours en écriture** (inscription, publication, revendication, messages) | Checklist 07-B, 45 minutes à deux comptes | Une adresse e-mail jetable et ton téléphone |
| I | **Fusion dans `main`** | Avance rapide de `main` sur `feat/bot-collecte-diako` une fois le déploiement vérifié | Ton OK (l'autre session travaille sur cette branche) |

## 3. Les commandes qui n'ont pas pu partir de ma session (PowerShell 5.1 : `;` et non `&&`)

```powershell
cd ~/Desktop/Diako
bash ~/.deploy-sites/redeploy.sh diako ; python scripts/verifier_deploiement.py
python scripts/appliquer_config_auth.py
```
Migrations (éditeur SQL du tableau de bord, dans l'ordre, ou dis-moi « applique les migrations » et je réessaie par le connecteur) : `supabase/migrations/0120_vues_par_rpc_plafonnee.sql`, `0121_index_fk_et_search_path.sql`, `0122_mes_donnees.sql`, `0123_alerte_erreurs.sql`.
Fonctions (`npx supabase functions deploy supprimer-mon-compte --no-verify-jwt --use-api` et `alerte-erreurs`), ou « déploie les fonctions » et je réessaie.

## 4. Plan et avancement

| Lot | Contenu | Heures | État |
|---|---|---|---|
| 1 | Corrections P0/P1 de l'audit (réessai d'import, SEO, h1, circuit, pages, .htaccess, lint) | 6 | ✅ fait le 05/09, commit `95fbb7c`, build vérifié en local |
| 2 | Auth (script adapté au plan gratuit), CSP, fil préchargé avant React, images (3 variantes WebP, diapositives à la demande), cibles 44/24 px, textes ≥ 12 px, Google → bienvenue, sortie de `/pro/:slug`, `/compte` sans 401, écran d'erreur réseau, contraste du texte du fil, Cgu, export/suppression RGPD (composant + RPC + fonction), vues par RPC, index FK, alerte erreurs (cron + fonction), tests e2e + axe, CI (audit, Playwright) | 14 | ✅ **fait et vérifié le 06/09** : typecheck 0, lint 0 erreur, 72 tests unitaires, **15/15 tests de bout en bout** (dont axe sur 6 pages), build `index-DIFKXDzz.js`, contrôle local : 1 seul appel `feed_filtre` (promesse consommée), 16 requêtes d'images sur l'accueil au lieu de 35, boutons d'en-tête 44 × 44, captures 390 px relues · ⏳ migrations 0120–0123 et 2 fonctions : ordre d'Andry (09 §3) |
| 3 | Déploiement + vérification du hash, re-mesures (LCP, poids, crawl 49 URL sans 429), Search Console | 2 | ⏳ déploiement : commande à lancer par Andry |
| 4 | Parcours en écriture à deux comptes (07-B), corrections trouvées | 3 | ⏳ avec Andry |
| 5 | Fusion `main`, journal, fiches 03 mises à jour, re-score | 2 | ⏳ |
| 6 | Reste des fiches : `share_target` (partage Android), descriptions des 50 fiches les plus complètes, Turnstile branché, `/evenements` paginé, focus initial | 8 | ⏳ après les décisions A–H |
