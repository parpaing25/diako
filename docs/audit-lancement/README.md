# Audit pré-lancement de diako.fonenako.mg — 05/09/2026

Décision : **NO-GO à 72/100 aujourd'hui, GO conditionnel atteignable en ≈ 35 h** (projection 86). Le détail et l'ordre de lecture :

| Fichier | Pour qui | Contenu |
|---|---|---|
| [08-synthese-decision.md](08-synthese-decision.md) | **Andry, 5 minutes** | La décision, les 10 actions, les 3 questions à trancher, les 5 propositions 2026 |
| [00-fiche-identite.md](00-fiche-identite.md) | tous | Ce qu'est le site, ses parcours, sa volumétrie recomptée, hypothèses et questions |
| [01-cartographie-routes.md](01-cartographie-routes.md) | technique | 37 routes, 49 URL parcourues, sitemap/robots, orphelins, le 429 |
| [02-audit-detaille.md](02-audit-detaille.md) | technique | 12 domaines notés, chaque constat avec sa preuve et son action |
| [03-corrections/](03-corrections/README.md) | technique | 11 fiches de correctifs P0/P1/P2 prêts à l'emploi, et ce qui a déjà été appliqué |
| [04-pages-construites/](04-pages-construites/README.md) | technique + Andry (relecture) | `/a-propos`, `/aide`, Confidentialité et Mentions réécrites |
| [05-plan-ia.md](05-plan-ia.md) | produit | L'agent Diako aujourd'hui, ses écarts, 5 usages suivants avec coûts |
| [06-amelioration-continue.md](06-amelioration-continue.md) | produit + technique | Mesurer, écouter, livrer : rituels et jalons J+1 → J+30 |
| [07-checklist-lancement.md](07-checklist-lancement.md) | Andry + technique | À cocher avant l'annonce, parcours à jouer à la main, retour arrière, jour J |

**Méthode.** Chaque chiffre est relu à sa source le 05/09/2026 (base par le connecteur, configuration par l'API de gestion, pages par Chrome piloté avec un agent utilisateur Android réel, production depuis Madagascar). « Vérifié » et « NON VÉRIFIÉ » sont écrits explicitement. Les scripts de mesure (`crawl.mjs`, `mesures.mjs`, `lcp-accueil.mjs`, `poids-accueil.mjs`, `verif-apres.mjs`) sont dans le dossier temporaire de la session ; à recopier dans `scripts/audit/` pour rejouer l'audit en 40 minutes (voir 06 §3).

**Écritures de production qui attendent un ordre explicite d'Andry** (règle du dépôt) : configuration d'authentification (`scripts/appliquer_config_auth.py`), captcha, migrations 0120–0121, DMARC, limiteur o2switch / Cloudflare.
