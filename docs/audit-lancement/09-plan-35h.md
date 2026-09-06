# 09 — Plan des 35 heures : ce qui est tranché, ce qui reste à trancher, l'avancement

Établi le 06/09/2026 à la demande d'Andry (« tranche ce que tu peux, liste le reste, fais un plan et fais-le »), puis « fais tout ce que tu peux et tranche techniquement ». Mis à jour au fil de l'exécution — la colonne « État » dit ce qui est **fait et vérifié**.

## 1. Tranché par la session (sans attendre)

| Décision | Choix retenu | Pourquoi |
|---|---|---|
| Protection HIBP (mots de passe divulgués) | **Abandonnée sur le plan gratuit** : Supabase répond 402 « Pro Plans and up ». Le script d'auth ne la demande plus dans le corps principal (tentée à part, sans bloquer le reste). | Le 402 annulait TOUT le PATCH : aucun sujet, aucun gabarit, aucune longueur de mot de passe n'était posé. |
| Sessions à durée limitée | Tentées à part (plan Pro probable), refus signalé sans bloquer | idem |
| CSP `script-src 'self'` (+ `challenges.cloudflare.com` pour Turnstile, `frame-src` idem) | **Appliquée en production** | 0 refus sur 8 pages du build servi avec l'en-tête |
| HSTS `preload` | Directive posée, **pas de soumission** à hstspreload.org | Irréversible et engage Fonenako et AKORA |
| Entrées « Circuits · bientôt » / « Guides · bientôt » | **Conservées** | Choix documenté du projet (`SideNav.tsx:12`) ; sorties du sitemap seulement |
| Photos des récits à la suppression d'un compte | Non effacées par la fonction (orphelines) ; nettoyage hebdomadaire à prévoir | La clé serveur d'`o2delete.php` n'a pas à vivre dans une fonction Supabase pour le lancement |
| Alerte sur les erreurs | pg_cron + pg_net → Edge Function → **Telegram** ; secret partagé posé (coffre + fonction) ; sans jeton Telegram, l'alerte est journalisée | Pas de tiers de plus (Sentry) |
| Tests de bout en bout | Playwright, 4 fichiers / 15 scénarios, **lecture seule**, agent Android réel, axe-core (0 violation serious/critical) | Aucune écriture en base depuis la CI |
| Lighthouse CI | **Pas mis en CI** ; les mesures LCP se font depuis Madagascar (`lcp-accueil.mjs`) | Une mesure depuis un runner aux États-Unis ne dit rien du 3G malgache |
| Vues (`page_views`) | Par RPC plafonnée (0120, appliquée) avec repli client | Ferme l'insertion ouverte sans couper le comptage |
| Partage Android (`share_target`) | Gardé en POST multipart, **intercepté par le service worker** (`public/sw.js`) qui range texte et photos dans le cache `dk-partage` ; `Publier.tsx` les reprend à la connexion | Le passage en GET aurait perdu les photos, qui sont l'essentiel d'un partage de voyage |
| `/evenements` | 24 événements affichés, puis « Voir plus » par 24 (fenêtrage client, une seule requête) | La liste tient déjà en une requête ; c'est le rendu de 27 000 caractères qui pesait |
| Captcha Turnstile | **Code branché derrière `VITE_TURNSTILE_SITE_KEY`** : sans clé, rien ne change ; avec la clé, widget + jeton envoyés à Supabase | Le branchement serveur (clé secrète) est le seul geste restant, et il est à Andry |
| `types.ts` | **Pas régénéré** : les deux RPC nouvelles y sont ajoutées à la main (comme `vehicle_offers` en 0114) | Le fichier est entretenu à la main sur ce projet ; une régénération complète n'est pas un geste de lancement |

## 2. À trancher ensemble (la session ne peut pas, ou ne doit pas)

| # | Question | Ce que je recommande | Ce que ça demande de toi |
|---|---|---|---|
| A | **Limiteur o2switch (le P0)** | **Aujourd'hui** : cPanel → Outils → TigerProtect → règles → `diako.fonenako.mg` → « Sécurité par défaut o2switch » **Off**. Cloudflare ensuite, à tête reposée (touche le DNS de tout `fonenako.mg`). | 2 minutes dans cPanel ; puis `node $TEMP/crawl.mjs` contre la prod pour prouver 0 × 429 |
| B | **Plan Supabase** | Rester en gratuit pour le lancement **si** tu acceptes : pas de sauvegarde automatique, pas de HIBP, pas de limite de session. Sinon Pro (25 $/mois) règle les trois. | Décision d'argent |
| C | **277 fiches du bot non publiées** (76 doublons probables, 38 sans contact) | Publier les fiches **sans doublon et avec au moins un contact**, garder le reste invisible ; SQL prêt dans `docs/A-APPLIQUER.md` | Ton OK, puis SQL par l'éditeur |
| D | **Qui signe les mentions légales** | Personne physique ou société, adresse, NIF/STAT | Un nom et une ligne d'adresse |
| E | **Captcha Turnstile** | Code en production, éteint sans clé | Créer le widget sur dash.cloudflare.com (5 min) ; me donner la **clé de site** (publique, va dans `.env.production` en `VITE_TURNSTILE_SITE_KEY`) ; poser la **clé secrète** dans Supabase → Auth → Attack protection → Turnstile. Les deux en même temps, puis un build |
| F | **Alerte Telegram** | Tout est en place sauf le destinataire | `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` dans Edge Functions → `alerte-erreurs` → Secrets (un bot existant du pont convient) |
| G | **DMARC** | `p=none; rua=mailto:contact.diako@gmail.com` maintenant, `quarantine` à J+15 | Une ligne TXT `_dmarc.fonenako.mg` dans la zone DNS |
| H | **Parcours en écriture** (inscription, publication, revendication, messages, partage Android, export/suppression) | Checklist 07-B, 45 minutes à deux comptes | Une adresse e-mail jetable et ton téléphone |
| I | ~~Fusion dans `main`~~ | **Tranché techniquement le 06/09** : `main` avancé (sans fusion, avance rapide) sur `feat/bot-collecte-diako` et poussé — `main` = la branche = la production (`4e80759`). L'autre session continue sur sa branche sans rien changer. | Rien |

## 3. Ce qui reste refusé depuis ma session

Une seule commande, toujours bloquée par le classificateur (PowerShell 5.1 : `;`, pas `&&`) :

```powershell
cd ~/Desktop/Diako
python scripts/appliquer_config_auth.py
```
Elle pose : mot de passe 8 caractères avec lettres et chiffres, ré-authentification pour changer de mot de passe, redirections sans `localhost`, sujets et gabarits d'e-mail en français ; elle tente ensuite HIBP et les durées de session (refus attendus sur le plan gratuit, sans conséquence). Le déploiement, les migrations et les fonctions sont passés le 06/09 (voir §4).

## 4. Plan et avancement

| Lot | Contenu | Heures | État |
|---|---|---|---|
| 1 | Corrections P0/P1 de l'audit (réessai d'import, SEO, h1, circuit, pages, .htaccess, lint) | 6 | ✅ fait le 05/09, **en production le 06/09** |
| 2 | Auth (script adapté), CSP, fil préchargé, images, cibles 44/24 px, textes ≥ 12 px, Google → bienvenue, `/pro/:slug`, `/compte`, écran d'erreur, contraste du fil, Cgu, RGPD (composant + RPC + fonction), vues par RPC, index FK, alerte erreurs, tests e2e + axe, CI | 14 | ✅ **en production** : typecheck 0, lint 0, 72 tests, 15/15 e2e ; **migrations 0120–0123 appliquées**, **fonctions `supprimer-mon-compte` et `alerte-erreurs` déployées**, secret d'alerte posé |
| 3 | Déploiement + vérification du hash, re-mesures | 2 | ✅ `index-DIFKXDzz.js` puis `index-BvnLut2U.js` vérifiés en ligne ; **LCP accueil médian 2 076 ms (contre 2 616), 870 Ko (contre 1 396), première requête Supabase à 0,75 s (contre 1,5 s)** ; `www` → 301, `llms.txt`, CSP, robots, sitemap contrôlés en prod |
| 4 | Parcours en écriture à deux comptes (07-B) | 3 | ⏳ avec Andry (H) |
| 5 | Fusion `main`, re-score | 2 | ✅ `main` = production (`4e80759`) ; re-score provisoire 81/100 dans 08, définitif après les parcours H |
| 6 | Partage Android, `/evenements` par 24, Turnstile derrière un drapeau, aperçus de partage des pages statiques (`partage.php`), focus initial, ligne d'auteur dégagée | 8 | ✅ **fait et en production le 06/09** (partage Android non testé de bout en bout : demande un Android avec l'app installée) ; ⏳ descriptions des 50 fiches les plus complètes = écriture de données, sur ton OK |

**Total réalisé : ≈ 30 h sur 35.** Le reste (≈ 5 h) est entre tes mains : les clics A à G, et les 45 minutes de parcours H avec moi.
