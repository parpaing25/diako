# 03 — Corrections : index et état d'application

Chaque fiche porte le constat (référence dans 02), le correctif prêt à l'emploi et sa vérification. Colonne « Appliqué » = ce que la session d'audit du 05/09/2026 a réellement changé dans le dépôt (branche `feat/bot-collecte-diako`), par opposition à ce qui reste à faire par Andry ou sur son ordre.

| Fiche | Gravité | Contenu | Appliqué le 05/09 |
|---|---|---|---|
| [01 — morceau JS refusé, réessai](01-P0-morceau-js-refuse-reessai.md) | **P0** | `chargerPage.ts` (réessai d'import), `main.tsx` (`preventDefault` seulement si rechargement), `App.tsx` (36 pages) ; limiteur o2switch / Cloudflare | ✅ code · ⏳ **limiteur o2switch ou Cloudflare : Andry** (Q2) |
| [02 — .htaccess](02-P1-htaccess-www-csp-hsts-erreurs.md) | P1/P2 | `www` → apex, HSTS `preload`, `ErrorDocument`, CSP sans `unsafe-inline` | ✅ www, HSTS, ErrorDocument · ⏳ **CSP : à tester avec l'en-tête en local avant** (fiche §c) · ⏳ soumission hstspreload.org : décision d'Andry |
| [03 — SEO](03-P1-seo-canonique-noindex-h1-sitemap-llms.md) | P1 | `useSEO` avec `noindex`, 15 pages migrées, h1 accueil, sitemap, `llms.txt`, robots `/admin` | ✅ tout, sauf `noindex` sur les branches « introuvable » des fiches (`PagePro`, `Destination`, `Plat`, `Site`, `Post`, `Circuit`) et sur `/user/:id` — ⏳ 0,5 h |
| [04 — circuit](04-P1-circuit-schema.md) | P1 | `Circuit.tsx` aligné sur `tour_prices/tour_days/tour_inclusions` réels | ✅ code · ⏳ test de contrat client/base à ajouter |
| [05 — authentification](05-P1-auth-mot-de-passe-captcha-mails.md) | P1 | mot de passe 8 + HIBP + complexité, sessions, redirections, gabarits FR, captcha Turnstile, DMARC, retour Google sur `/bienvenue` | ⏳ **tout est une écriture de production : sur ordre d'Andry** (`python scripts/appliquer_config_auth.py` après complément §1) ; Turnstile 3 h ; DMARC = DNS |
| [06 — performance](06-P1-performance-accueil.md) | P1 | preconnect, préchargement du fil dans `app-init.js`, `srcsetPour`, diapositives à la demande, invite PWA | ✅ preconnect + invite PWA · ⏳ préchargement du fil, carrousel, variantes WebP (≈ 3 h, à mesurer après) |
| [07 — accessibilité](07-P1-accessibilite.md) | P1/P2 | `aria-label` du combobox, cibles 44/24 px, textes 12 px, focus initial, `role="alert"` | ✅ `ChampLieu` (`etiquette`, défaut « Destination »), `role="alert"` sur NotFound · ⏳ cibles, textes, focus (2 h) ; passer `etiquette` explicite sur `/y-aller` (« Ville de départ » / « Ville d'arrivée ») |
| [08 — lint, hors-ligne, contact](08-P1-lint-offline-contact.md) | P1/P2 | `Prix.tsx:60`, `offline.html` Diako, `contact.diako@gmail.com`, `/compte` avant connexion, `CLAUDE.md` radix | ✅ lint, offline, contact (pied de page, Paramètres, Mentions) · ⏳ `/compte` (P3), `CLAUDE.md` |
| [09 — base](09-P2-base-vues-index-fk.md) | P2 | `noter_vue` par RPC plafonnée, index FK sociales, `dk_famille_carte`, policies multiples | ⏳ **migrations 0120–0121 : à appliquer par le connecteur sur ordre** |
| [10 — CI, tests, alertes](10-P1-ci-tests-alertes.md) | P1 | `npm audit`, Playwright ×7, axe, Lighthouse CI + budget, alerte `journal_erreurs`, moniteur | ⏳ 8 h + réglages externes (UptimeRobot, Telegram) |
| [11 — RGPD](11-P2-rgpd-suppression-export.md) | P2 | RPC `mes_donnees()`, Edge Function `supprimer-mon-compte`, FK `page_gestionnaires.ajoute_par` | ⏳ 2 h + déploiement de fonction (secret `service_role`) |

Pages construites (04) : `/a-propos`, `/aide`, `Confidentialite.tsx` réécrite, `Mentions.tsx` complétée — ✅ appliquées et câblées (`App.tsx`, pied de page, sitemap, `llms.txt`).

## Ce que la session a vérifié après application

Voir la fin de `08-synthese-decision.md` (journal d'exécution) : typecheck, lint, tests, build, déploiement et contrôle du hash en ligne, puis re-crawl local des 49 URL.
