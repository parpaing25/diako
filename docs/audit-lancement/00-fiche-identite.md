# 00 — Fiche d'identité de Diako (Phase 0)

Audit pré-lancement de `https://diako.fonenako.mg`, établi le **05/09/2026**.
Tout chiffre porte sa source ; **« vérifié »** = relu à la source ce jour, **« NON VÉRIFIÉ »** = déduit ou déclaré, pas contrôlé.

## 1. Ce qu'est le site

| Rubrique | Constat | Source |
|---|---|---|
| **But** | Réseau social malgache du voyage : un fil de récits de voyageurs, un annuaire d'établissements (hôtels, restaurants, agences, loueurs) avec leurs tarifs, un référentiel de lieux, de sites, de plats et d'événements. Diako **met en relation**, ne vend rien et n'encaisse rien. | `CLAUDE.md:3-4`, `CLAUDE.md:24-25`, pied de page du site (« Nous ne vendons pas de séjours ») |
| **Type** | Application monopage (SPA) React installable (PWA), données et authentification Supabase, hébergement mutualisé o2switch (Apache + trois scripts PHP : envoi d'images, partage OG, sitemap). | `package.json`, `public/api/*.php`, `public/sitemap.php`, `public/manifest.json` |
| **Langue / marché** | Français uniquement (`<html lang="fr">`), cible Madagascar. Aucune version malgache ni anglaise. | `index.html`, crawl du 05/09 |
| **Audiences** | ① Voyageurs (Malgaches et francophones) qui cherchent où dormir, où manger, quand partir. ② Professionnels : 7 métiers déclarés à l'inscription (hôtellerie, restauration, guide, agence, transport, artisanat, autre) qui revendiquent et renseignent leur fiche. ③ Administration : Andry (super-admin) et le bot de collecte `bot-diako` qui alimente l'annuaire. | `src/pages/Bienvenue.tsx`, migration `0069`, `docs/A-APPLIQUER.md` |
| **Modèle économique** | Aucun paiement au lancement. Le schéma prévoit une mise en avant (`featured_until`, `promo_codes`, 0 ligne) : monétisation future par fiches mises en avant — **NON VÉRIFIÉ** (à confirmer, question Q5). | `CLAUDE.md:26`, comptage tables du 05/09 |
| **Réglementaire** | Hébergeur en France, base en UE (Supabase `eu-west-3`) → **RGPD applicable** au traitement. Madagascar : loi n° 2014-038 sur la protection des données (CMIL). Pas de vente aux consommateurs européens → l'European Accessibility Act ne s'applique pas juridiquement ; **WCAG 2.2 AA reste la barre de qualité retenue**. Aucun cookie tiers, aucun traceur externe ; mesure d'audience maison (`page_views`, sans cookie). Pages légales présentes mais courtes : mentions 216 mots, confidentialité 242, CGU 409. | `docs/supabase-config-manuelle.md`, `src/pages/{Mentions,Confidentialite,Cgu}.tsx`, en-têtes HTTP du 05/09 |

## 2. Parcours critiques (6)

| # | Parcours | Écrans | État constaté le 05/09 |
|---|---|---|---|
| P1 | **Découvrir et lire** : accueil → récit ou fiche → contacter (WhatsApp / « Demander ») | `/` → `/post/:id`, `/p/:slug` | Fonctionne (crawl 49 URL). LCP accueil 4,3 s sur mobile réel : lent. |
| P2 | **Chercher où dormir / manger** dans une ville | `/recherche`, `/lieu/:slug`, `/carte` | Fonctionne. 248 destinations sur 508 dans le sitemap. |
| P3 | **S'inscrire et publier un récit** | `/auth` → e-mail de confirmation → `/bienvenue` → `/publier` | Formulaire vérifié (8 caractères mini côté client). **Bout en bout NON VÉRIFIÉ** (aucun compte de test créé en production). E-mails de confirmation encore en anglais (config Supabase). |
| P4 | **Pro : revendiquer et renseigner sa fiche** | `/pro`, `/pro/:slug`, `/publier` (assistant) | Écran atteint ; dossier de revendication : 0 en base. Bout en bout NON VÉRIFIÉ. |
| P5 | **Planifier** : quand partir, y aller, projet de voyage | `/quand-partir`, `/y-aller`, `/projet` | Fonctionne (1 demande de voyage en base). |
| P6 | **Messagerie et notifications** | `/messages`, `/notifications` | Écrans branchés, 0 message et 0 notification en base : jamais exercés par un usage réel. |

## 3. Stack et maturité

| Élément | Valeur vérifiée | Source |
|---|---|---|
| Front | Vite 5.4.21, React 18.3.1, TypeScript 5.9.3 strict, Tailwind, shadcn/ui, react-router 6.30, Leaflet 1.9.4 | `node_modules/*/package.json` (résolus) |
| Données | `@supabase/supabase-js` 2.111.0 ; projet `eifrwecaszzqrdwjjjbu` ; 103 fichiers de migration jusqu'à `0119` ; 2 Edge Functions (`agent-diako`, `send-push`) | `supabase/migrations/`, `supabase/functions/` |
| Taille du code | 48 645 lignes TS/TSX ; 37 routes déclarées dans `src/App.tsx` | `find src \| wc -l`, `src/App.tsx` |
| Qualité | typecheck ✅, **lint ❌ (1 erreur `no-useless-escape`, `src/components/Prix.tsx:60`)**, 72 tests unitaires ✅ (5 fichiers), **0 test de bout en bout**, CI = typecheck + lint + test + build (pas d'audit de dépendances, pas de Lighthouse) | `$TEMP/qa-*.log`, `.github/workflows/ci.yml` |
| Déploiement | FTP vers o2switch (`redeploy.sh` + `scripts/verifier_deploiement.py`). **La production sert le build de la branche `feat/bot-collecte-diako`** (`index-NcW107pc.js`), 35 commits devant `main` : `main` ≠ prod. | `git log main..feat/bot-collecte-diako`, `dist/index.html` vs en ligne |
| Observabilité | Journal d'erreurs maison (`journal_erreurs`, 14 lignes), vues maison (`page_views`, 1 163 lignes, 71 sur 24 h). Pas de Sentry, pas de RUM, pas d'alerte. | comptage SQL du 05/09 |

### Volumétrie recomptée en base le 05/09/2026 (jamais reprise d'un document)

| Table | Lignes | Lecture |
|---|---|---|
| `profiles` | **3** | Le site n'a pas encore d'utilisateurs : les 3 comptes sont ceux de l'équipe. |
| `posts` visibles (`status='published'`) | 213 (418 au total, 205 masqués au nettoyage du 03/09) | Fil alimenté par le bot de collecte, pas par des voyageurs. |
| `comments` / `messages` / `notifications` / `follows` / `reviews` | **0 / 0 / 0 / 0 / 0** | Aucune fonction sociale n'a jamais été exercée en réel. |
| `pages` publiées / non publiées | 3 412 / 277 | 277 fiches du bot invisibles (décision en attente, `docs/A-APPLIQUER.md`). |
| `places` / `attractions` / `dishes` / `events` publiés | 22 707 / 2 521 / 95 / 88 | Référentiel riche, c'est la force du site. |
| `tours` (circuits) | 1 (et 0 prix, 0 jour, 0 inclusion) | La page `/circuit/:slug` est **cassée** (voir 01). |
| `page_views` 24 h | 71 | Trafic = auditeurs et robots (bingbot présent dans le journal d'erreurs). |

**Maturité : pré-lancement.** Le référentiel et l'annuaire sont prêts ; la couche sociale n'a jamais été éprouvée par un vrai public.

## 4. Trois références concurrentes

| Référence | Ce qu'elle fait mieux | Ce que Diako fait mieux |
|---|---|---|
| **Google Maps / TripAdvisor** (annuaire + avis, référence de fait pour Madagascar) | Volume d'avis, photos, horaires, itinéraires, multilingue | Tarifs datés en ariary, plats malgaches, « quand partir » par destination, contact direct WhatsApp |
| **Petit Futé / Routard Madagascar** (guides éditoriaux) | Rédaction éditoriale, fiabilité perçue | Mise à jour vivante par les établissements eux-mêmes, gratuité, mobile |
| **Polarsteps / Wanderlog** (récits et carnets de voyage sociaux) | Expérience de publication (traces GPS, albums), communauté mondiale | Ancrage local (fady, saisons, plats), fiches d'établissements liées aux récits |

Référence technique interne : **Fonenako** (même équipe, même hébergeur, même Supabase). Ses pièges déjà payés (limiteur o2switch, service worker, `select('*')`) s'appliquent tels quels.

## 5. Hypothèses de travail (déclarées, pas vérifiées)

- **H1** — Le lancement est une annonce publique sur Facebook (page Fonenako, 112 k abonnés) dans les semaines qui viennent : pic de visites depuis des mobiles Android d'entrée de gamme en 3G/4G, **derrière des adresses IP partagées** (CGNAT des opérateurs Telma / Orange / Airtel).
- **H2** — Aucune fonction payante au lancement ; les CGU n'ont donc pas à parler de prix.
- **H3** — La production doit servir `main` : l'écart `main` ≠ prod est un état transitoire à résorber avant le lancement.
- **H4** — Cible d'accessibilité WCAG 2.2 AA (barre de qualité), sans obligation légale EAA.
- **H5** — Les 277 fiches non publiées restent invisibles au lancement tant qu'Andry n'a pas tranché les 76 doublons probables.
- **H6** — Trafic des trois premiers mois inférieur à 1 000 visites par jour : le mutualisé o2switch suffit **si** son limiteur de requêtes est neutralisé (voir 02, Ops).

## 6. Questions bloquantes (5 maximum)

| # | Question | Ce que la réponse change |
|---|---|---|
| Q1 | **Date et canal de lancement ?** (post Facebook boosté, bouche-à-oreille, presse) | Dimensionne l'urgence de la protection contre le limiteur o2switch (429) et le plan de charge. |
| Q2 | **Un CDN gratuit (Cloudflare) devant o2switch est-il accepté ?** Cela demande de changer les serveurs DNS du domaine `fonenako.mg` chez le registrar. | C'est la correction la plus rentable de l'audit (429, HTTP/2, cache des images, TTFB). Sans elle, le plan B est une demande au support o2switch. |
| Q3 | **Les 277 fiches du bot non publiées : publier après dédoublonnage, ou garder invisibles au lancement ?** | Volume de l'annuaire et risque de doublons dans la recherche. |
| Q4 | **Faut-il fusionner `feat/bot-collecte-diako` dans `main` avant le lancement ?** (35 commits, la prod sert déjà ce build) | Sans fusion, un déploiement depuis `main` ferait régresser la production. |
| Q5 | **La mise en avant payante (`featured_until`, `promo_codes`) est-elle prévue au lancement ?** | Si oui : CGU, mentions légales (TVA, facturation) et parcours de paiement à auditer ; si non : retirer les traces de l'interface. |

Les hypothèses H1 à H6 sont jugées raisonnables : la Phase 1 s'enchaîne sans attendre les réponses.
