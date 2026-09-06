# 03 — Corrections : index et état d'application

Chaque fiche porte le constat (référence dans 02), le correctif prêt à l'emploi et sa vérification. Colonne « Appliqué » = ce que les sessions d'audit des 05 et 06/09/2026 ont réellement changé dans le dépôt (branche `feat/bot-collecte-diako`), par opposition à ce qui reste à faire par Andry ou sur son ordre (écritures de production refusées par le classificateur de la session).

| Fiche | Gravité | Contenu | Appliqué |
|---|---|---|---|
| [01 — morceau JS refusé, réessai](01-P0-morceau-js-refuse-reessai.md) | **P0** | `chargerPage.ts` (réessai d'import), `main.tsx` (`preventDefault` seulement si rechargement), `App.tsx` (36 pages), écran d'erreur qui nomme la cause réseau ; limiteur o2switch / Cloudflare | ✅ code · ⏳ **limiteur o2switch (cPanel) ou Cloudflare : Andry** (09 §2 A) |
| [02 — .htaccess](02-P1-htaccess-www-csp-hsts-erreurs.md) | P1/P2 | `www` → apex, HSTS `preload`, `ErrorDocument`, **CSP `script-src 'self'`** | ✅ tout (CSP vérifiée le 06/09 : 0 refus sur 8 pages servies avec l'en-tête) · ⏳ soumission hstspreload.org : décision d'Andry |
| [03 — SEO](03-P1-seo-canonique-noindex-h1-sitemap-llms.md) | P1 | `useSEO` avec `noindex`, 22 pages migrées (privées, 404, résultats, fiches introuvables, profils), h1 accueil, sitemap, `llms.txt`, robots `/admin` | ✅ tout |
| [04 — circuit](04-P1-circuit-schema.md) | P1 | `Circuit.tsx` aligné sur le schéma réel, singulier « 1 jour » | ✅ code · ⏳ test de contrat client/base (script existant à étendre aux `tour_*`) |
| [05 — authentification](05-P1-auth-mot-de-passe-captcha-mails.md) | P1 | mot de passe 8 + lettres/chiffres, ré-authentification, redirections sans localhost, gabarits FR ; HIBP et sessions tentés à part (plan Pro) ; captcha Turnstile ; DMARC ; retour Google sur `/bienvenue` | ✅ script adapté au plan gratuit (`scripts/appliquer_config_auth.py`) — **à lancer par Andry** · ✅ Google → `/bienvenue` · ⏳ Turnstile (clé à créer, 09 §2 E) · ⏳ DMARC (DNS) |
| [06 — performance](06-P1-performance-accueil.md) | P1 | preconnect, **fil demandé avant React** (`app-init.js` + `Feed.tsx`), **trois variantes WebP** (`jeuDeTailles`), **diapositives à la demande** (`Carrousel.tsx`), invite PWA à la 2ᵉ visite | ✅ tout · ⏳ re-mesure en prod après déploiement (`lcp-accueil.mjs`, `poids-accueil.mjs`) |
| [07 — accessibilité](07-P1-accessibilite.md) | P1/P2 | `aria-label` du combobox, **cibles 44 px** (en-tête, puces du fil) et **≥ 24 px** (« plus », « Ouvrir »), **textes ≥ 12 px** (60 occurrences dans 31 fichiers), `role="alert"` | ✅ tout sauf le focus initial (P3) · ⏳ `etiquette` explicite sur `/y-aller` |
| [08 — lint, hors-ligne, contact](08-P1-lint-offline-contact.md) | P1/P2 | `Prix.tsx:60`, `offline.html` Diako, `contact.diako@gmail.com` (pied de page, Paramètres, Mentions, Cgu), `/compte` sans 401, `CLAUDE.md` radix | ✅ tout sauf `CLAUDE.md` radix (à mesurer sous Firefox) |
| [09 — base](09-P2-base-vues-index-fk.md) | P2 | **0120** `noter_vue` (client déjà branché, avec repli), **0121** 25 index FK + `dk_famille_carte` + `page_gestionnaires.ajoute_par` SET NULL, policies multiples | ✅ migrations écrites, client branché · ⏳ **application : ordre d'Andry** (classificateur) |
| [10 — CI, tests, alertes](10-P1-ci-tests-alertes.md) | P1 | `npm audit` prod, **Playwright 4 fichiers / 12 scénarios** (lecture seule, agent Android, axe-core), **0123** pg_cron + `alerte-erreurs` → Telegram ; moniteur | ✅ CI et tests écrits · ⏳ migration 0123 + fonction à déployer + secrets Telegram (09 §2 F) · ⏳ UptimeRobot (compte Andry) |
| [11 — RGPD](11-P2-rgpd-suppression-export.md) | P2 | `MesDonnees.tsx` (export JSON, suppression avec confirmation), **0122** `mes_donnees()`, fonction `supprimer-mon-compte` | ✅ client et code serveur écrits · ⏳ migration + fonction à déployer (ordre d'Andry) — en attendant, l'écran donne l'adresse et le délai |

Pages construites (04) : `/a-propos`, `/aide`, `Confidentialite.tsx` réécrite, `Mentions.tsx` complétée — ✅ appliquées et câblées.

Ce qui a été vérifié après application : `08-synthese-decision.md` (journal d'exécution) et `09-plan-35h.md` (avancement).
