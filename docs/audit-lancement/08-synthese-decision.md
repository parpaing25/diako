# 08 — Synthèse et décision (une page, pour décider)

**Site audité :** diako.fonenako.mg · **Date :** 5 septembre 2026 · **Méthode :** 49 pages parcourues, 8 tailles d'écran, mesures réelles depuis Madagascar, base et configuration relues à la source. Le détail est dans 00 → 07.

## La décision : **NO-GO aujourd'hui — GO CONDITIONNEL atteignable en une semaine de travail (≈ 35 h)**

| Critère de la grille | Exigé pour GO | Constaté |
|---|---|---|
| Note globale pondérée | ≥ 85 (GO) / ≥ 75 (conditionnel) | **72 / 100** |
| Points bloquants (P0) | 0 | **1** — le limiteur de l'hébergeur fait tomber le site en erreur pour un visiteur réel (vu aujourd'hui) |
| Tous les domaines ≥ 70 | oui | **4 domaines sous 70** : sécurité (59), parcours (66), SEO (67), exploitation (62) |

## Ce qui va bien (et qu'il ne faut pas casser)

- **Le fond est solide** : 3 412 établissements, 22 707 lieux, 2 451 sites, 95 plats, 88 événements ; un design cohérent, un mode sombre, aucune page qui déborde sur 8 tailles d'écran, des boutons tous nommés, un focus clavier visible partout, des aperçus de partage WhatsApp/Facebook qui marchent.
- **La base est bien verrouillée** : chaque table protégée ligne par ligne, aucun secret dans le code public, images vérifiées à l'envoi, assistant IA qui ne répond que depuis le référentiel.
- **Les choix éditoriaux sont sains** : aucun prix inventé, « Demander » et jamais « Réserver », un fil nettoyé des publicités (205 masquées le 03/09).

## Ce qui bloque — et combien ça coûte de le lever

| # | Le problème, en une phrase | Preuve | Correctif | Heures |
|---|---|---|---|---|
| 1 | **Un visiteur qui ouvre trois pages en une minute peut voir un écran d'erreur** : l'hébergeur o2switch coupe les fichiers au-delà de ~80 requêtes par adresse IP, et à Madagascar des centaines de mobiles partagent la même adresse. C'est arrivé aujourd'hui à un vrai visiteur, cinq fois en deux minutes. | `journal_erreurs` #10–14 ; 2 × 429 pendant l'audit | Désactiver la règle par défaut « Tiger Protect » **ou** mettre Cloudflare (gratuit) devant le site ; réessai automatique côté client | 3 |
| 2 | **Un mot de passe de 6 caractères passe, sans vérification de fuite, sans captcha** : le jour de l'annonce Facebook, des comptes en masse peuvent polluer le fil. | config auth relue | Lancer le script déjà écrit (`appliquer_config_auth.py`) + Turnstile | 3,5 |
| 3 | **Les e-mails de confirmation sont en anglais, gabarits d'usine** : premier contact avec la marque raté. | config auth | même script | (inclus) |
| 4 | **Google ne peut pas indexer correctement** : pas de titre h1 sur l'accueil, pages légales déclarées « doublons de l'accueil », pages d'erreur indexables, `www` en double. | crawl 49 pages | 03-03 | 3 |
| 5 | **L'accueil pèse 1,4 Mo** (35 photos chargées pour 5 récits) pour un public en 3G ; LCP 2,6–3,1 s. | mesures prod | 03-06 | 4 |
| 6 | **La page d'un circuit est cassée** (écrite contre des colonnes qui n'existent pas) et la CI est rouge (1 erreur de lint). | RPC 400 ; `qa-lint.log` | 03-04, 03-08 | 1,5 |
| 7 | **Rien ne dit qui est derrière Diako ni comment revendiquer sa fiche** (pas d'À propos, d'Aide, de Contact ; contact = adresse Fonenako ; politique de confidentialité incomplète). | crawl ; textes | Pages construites (04) | 6 |
| 8 | **Personne n'est prévenu quand ça casse** (l'incident d'aujourd'hui n'a été vu que par l'audit) ; pas de moniteur. | `journal_erreurs` | Alerte + moniteur (03-10) | 1,5 |
| 9 | **La production ne correspond pas à `main`** (35 commits sur une branche) : un déploiement depuis `main` ferait régresser le site. | `git log` | Fusionner, déployer depuis `main` | 1 |
| 10 | **Les parcours d'inscription, de publication, de revendication et de messagerie n'ont jamais été joués par un vrai compte** (0 message, 0 commentaire, 0 dossier en base) ; aucun test automatisé de parcours. | comptages | Checklist 07-B (à la main) + 7 tests Playwright | 11 |

**Total : ≈ 35 heures.** Après ces dix actions, la note projetée est **86 / 100, 0 P0, tous domaines ≥ 80 → GO.**

## Trois questions à trancher (elles conditionnent le calendrier)

1. **Cloudflare devant o2switch ?** (changement des serveurs DNS de `fonenako.mg` chez le registrar — touche aussi Fonenako et AKORA). C'est la meilleure réponse au problème n° 1 ; le plan B est une demande au support o2switch.
2. **Les 277 fiches créées par le bot et invisibles** (76 doublons probables) : publier après dédoublonnage, ou lancer sans ?
3. **Qui signe les mentions légales** (personne ou société, NIF/STAT) — nécessaire pour la page Confidentialité.

## Cinq propositions « 2026 » pour après le lancement

| # | Proposition | Ce que ça change | Coût |
|---|---|---|---|
| 1 | **Diako sur WhatsApp** : poser sa question à l'assistant depuis WhatsApp, en malgache ou en français | Le canal n° 1 du pays, sans rien installer | 3 semaines ; ≈ 0,04 € par conversation au-delà de 1 000/mois |
| 2 | **Guides hors ligne par région** : télécharger Nosy Be ou l'Isalo (fiches + cartes + photos légères) avant de partir | Utilisable sans réseau, là où le réseau manque | 3 semaines |
| 3 | **Prix confirmés chaque mois** : rappel WhatsApp aux gérants, badge « prix confirmé le … », déclassement automatique sinon | Tient la promesse « vrais tarifs » dans la durée | 2 semaines |
| 4 | **Modération assistée** des récits et photos (spam, publicité déguisée, numéros dans le texte) avec file de validation humaine | Le fil reste un fil de voyageurs quand le volume monte | 2 semaines, modèle gratuit à ce volume |
| 5 | **Version malgache** de l'interface, relue par Andry | Ouvre le site à la majorité des voyageurs du pays | 1 semaine + relecture |

## En une phrase

Diako est prêt sur le fond et fragile sur la façade : une semaine de travail ciblé — hébergement, authentification, indexation, poids des images, pages de confiance, alertes — le fait passer de 72 à 86, et de NO-GO à GO.

---

## Journal d'exécution de la session d'audit (05/09/2026, après-midi)

Ce qui a été **fait et vérifié** sur la branche `feat/bot-collecte-diako` (deux commits : `docs(audit)` et `fix(lancement)`) :

| Étape | Résultat |
|---|---|
| Corrections appliquées | 36 fichiers modifiés, 4 créés (`chargerPage.ts`, `APropos.tsx`, `Aide.tsx`, `llms.txt`) — détail dans `03-corrections/README.md` |
| `npm run typecheck` | 0 erreur |
| `npm run lint` | **0 erreur** (12 avertissements `react-refresh` préexistants) — la CI redevient verte |
| `npm test` | 72 tests, 5 fichiers, tous verts |
| `npm run build` | `dist/assets/index-DMJprdwR.js`, 76 morceaux, 8 entrées précachées |
| Contrôle local du build (Chrome piloté, 23 URL) | canonique propre sur `/mentions` `/cgu` `/confidentialite` `/recherche` ; `noindex` sur `/auth` `/compte` 404 `/recherche?q=` et les 7 écrans « introuvable » ; h1 sur `/` ; `/a-propos` et `/aide` rendues ; `/circuit/nosy-iranja-…` s'affiche (plus de RPC 400) ; `/quand-partir` combobox nommé « Destination » ; 0 débordement à 390 px |
| Morceau JS bloqué (`Gouts-*.js`) | réessai, puis écran « Quelque chose s'est mal passé / Recharger » — **plus d'erreur `reading 'default'`** ; débloqué : la page revient |
| **Déploiement** | ⏳ **refusé par le classificateur de la session** (écriture de production). À lancer par Andry : `bash ~/.deploy-sites/redeploy.sh diako && python scripts/verifier_deploiement.py` (le hash attendu en ligne est `index-DMJprdwR.js`), puis `curl -sI https://www.diako.fonenako.mg/` → 301, `curl -s https://diako.fonenako.mg/llms.txt \| head -2`. |

**Ce qui n'est pas dans le code et attend un ordre** : configuration d'authentification (`python scripts/appliquer_config_auth.py` après complément 03-05 §1), captcha Turnstile, migrations 0120–0121, DMARC, limiteur o2switch / Cloudflare, fusion dans `main`.
