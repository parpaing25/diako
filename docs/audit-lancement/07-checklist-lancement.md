# 07 — Checklist de lancement (Phase 4)

À cocher dans l'ordre. Chaque ligne dit **qui** (A = Andry, C = session Claude sur ordre, S = script) et **comment on sait que c'est fait**.

## A. Bloquant — avant toute annonce

- [ ] **A/C** Limiteur o2switch : règle par défaut Tiger Protect désactivée pour `diako.fonenako.mg` (cPanel → TigerProtect) **ou** Cloudflare activé (proxy orange, SSL Full strict, cache `/assets/*` et `/uploads/*`). Preuve : `node $TEMP/crawl.mjs` contre la prod (49 pages en 2 min) sans un seul 429. *(03-01 §5, Q2)*
- [ ] **C** Réessai d'import + `preventDefault` conditionnel déployés (`chargerPage.ts`, `main.tsx`). Preuve : 24 h sans `reading 'default'` dans `journal_erreurs`. *(03-01)*
- [ ] **A** `python scripts/appliquer_config_auth.py` lancé : mot de passe 8 + HIBP + gabarits FR + sessions + plus de localhost. Preuve : script « ✓ » + e-mail de test reçu en français. *(03-05)*
- [ ] **C** Captcha Turnstile branché sur inscription et connexion. Preuve : inscription impossible sans jeton (test `curl` sur `/auth/v1/signup` → 400 captcha). *(03-05 §2)*
- [ ] **C** `/circuit/:slug` corrigé (schéma réel). Preuve : la page rend le résumé, pas l'écran d'erreur. *(03-04)*
- [ ] **C** Lint vert (`Prix.tsx:60`). Preuve : CI verte sur la branche. *(03-08)*
- [ ] **A/C** `feat/bot-collecte-diako` fusionnée dans `main` ; **déploiement depuis `main`** ; `python scripts/verifier_deploiement.py` → hash en ligne = `dist/index.html`. *(02-CQ3, Q4)*
- [ ] **C** SEO : canonique par page, `noindex` sur privées/404/résultats, h1 accueil, sitemap sans `/pro` `/circuits` `/guides`, `llms.txt`, `/admin` dans robots. Preuve : `crawl.mjs` local → `robots` non nul sur 12 pages, canonical ≠ `/` sur `/mentions`. *(03-03)*
- [ ] **C** Pages `/a-propos` et `/aide` en ligne, liées dans le pied de page ; `Confidentialite` et `Mentions` réécrites (responsable, base légale, durées, sous-traitants, droits). Preuve : les 4 URL rendent leur h1 ; 0 `fonenako@gmail` dans `src/`. *(04, 03-08)*
- [ ] **C** Performance : preconnect + préchargement du fil + diapositives à la demande + variantes WebP. Preuve : `lcp-accueil.mjs` médiane ≤ 2 000 ms ; `poids-accueil.mjs` < 500 Ko. *(03-06)*
- [ ] **C** Alerte erreurs (cron + Telegram/mail) et moniteur de disponibilité. Preuve : une erreur provoquée en local de prod (`throw` depuis la console) déclenche l'alerte en < 15 min. *(03-10)*

## B. Parcours joués à la main (2 comptes jetables, 45 min) — A ou C avec A

| # | Parcours | Attendu | OK |
|---|---|---|---|
| 1 | Inscription e-mail → mail reçu (sujet « Diako — confirmez… », expéditeur `no-reply@diako.fonenako.mg`) → lien → `/bienvenue` → choix voyageur | profil créé, `profiles.type` renseigné | [ ] |
| 2 | Inscription Google → arrive sur `/bienvenue` (après 03-05 §5) | idem | [ ] |
| 3 | Publier un récit avec 2 photos depuis Android (partage depuis la galerie via `share_target`) | récit visible sur `/`, photos en WebP avec 3 variantes sur o2switch | [ ] |
| 4 | Compte B commente et réagit ; A reçoit la notification | `comments` = 1, `notifications` = 1, cloche à jour | [ ] |
| 5 | B écrit à A (messagerie) ; A répond depuis son téléphone | 2 `messages`, temps réel visible sans rafraîchir | [ ] |
| 6 | Compte pro : « Je suis un pro » → métier → revendiquer « Les Trois Métis » avec une pièce → dossier dans `/admin` → validation par Andry → `/pro/les-trois-metis` éditable → poser un tarif daté | `page_claims` = 1, `pages.owner_id` = B, prix affiché avec sa date | [ ] |
| 7 | Visiteur anonyme : `/p/les-trois-metis` → « Demander » / WhatsApp | le lien `wa.me` porte le bon numéro, message pré-rempli sans vocabulaire de réservation | [ ] |
| 8 | Paramètres : télécharger mes données, supprimer mon compte (B) | JSON reçu ; B disparu (`select … where author_id`) ; photos supprimées d'o2switch | [ ] |
| 9 | Mot de passe oublié | mail FR, lien fonctionne, nouveau mot de passe < 8 refusé **par le serveur** | [ ] |
| 10 | Hors ligne (mode avion après une visite) | `offline.html` Diako, retour automatique | [ ] |

## C. Contenu — avant l'annonce

- [ ] **A** Décision sur les 277 fiches non publiées (76 doublons probables) — SQL prêt dans `docs/A-APPLIQUER.md`. *(Q3)*
- [ ] **A + équipe** 10 récits signés de vraies personnes (pas « Diako »), 30 réactions, 5 commentaires : le fil ne doit pas avoir l'air vide au premier visiteur. *(02-CO6)*
- [ ] **A** Relecture des pages `/a-propos`, `/aide`, légales (noms, adresse, NIF/STAT si société). *(04)*
- [ ] **C** Descriptions ≥ 120 caractères sur les 50 fiches les plus complètes (`completeness desc`). *(02-SO6)*

## D. Sécurité et ops — la semaine du lancement

- [ ] **A** DMARC `rua=` posé ; `p=quarantine` à J+15. *(03-05 §4)*
- [ ] **A** Plan Supabase et sauvegardes vérifiés ; sinon `pg_dump` hebdo planifié. *(02-OP3)*
- [ ] **C** `.htaccess` : `www` → apex, HSTS preload (directive seule), CSP `script-src 'self'` **après test local avec l'en-tête**, `ErrorDocument`. *(03-02)*
- [ ] **C** Index des FK sociales + `dk_famille_carte` + `page_views` par RPC. *(03-09)*
- [ ] **A** Search Console et Bing Webmaster : domaine vérifié, sitemap soumis. *(02-SO10)*
- [ ] **A** Mise à niveau Postgres planifiée (nuit, après sauvegarde). *(02-SE11)*

## E. Retour arrière (runbook, 10 minutes)

1. **Site cassé après déploiement** : `git checkout main~1 -- dist`? Non — `dist/` n'est pas versionné : garder le `dist/` précédent dans `~/.diako-releases/<date>/` avant chaque déploiement (`scripts/release.ps1` de Fonenako, à copier), et le renvoyer par `ftp_deploy_robuste.py`. Vérifier le hash.
2. **Migration fautive** : chaque migration a son bloc de contrôle ; écrire la migration inverse (`0xxx_retour_…`) et l'appliquer par le connecteur sur ordre. Jamais de `drop` sans sauvegarde de la table (`create table _sauve_x as select * from x`).
3. **Vague de spam** : `update app_flags set actif=false where cle='signup_open'` (ferme les inscriptions en 1 requête) ; masquer par `posts.status='hidden'`.
4. **429 en masse** : Cloudflare « Under attack » off, règle Tiger Protect off, ou en dernier recours page statique `offline.html` avec `RewriteRule ^ /offline.html [L]`.
5. **Fuite de secret** : rotation dans `~/.diako-secrets` + secrets de fonction + `.env_diako` sur o2switch ; la clé `anon` n'est pas un secret.

## F. Jour J

- [ ] 08 h : `verifier_deploiement.py`, `lcp-accueil.mjs`, moniteur vert, alerte testée.
- [ ] Publication Facebook (recompter tout chiffre annoncé en base avant : règle marketing Fonenako du 03/09).
- [ ] H+1, H+4, H+24 : `journal_erreurs`, `page_views` par heure, 429 du moniteur, inscriptions, premiers récits.
- [ ] J+1 : réponse à chaque commentaire et message reçu ; liste des 3 corrections urgentes dans `A-APPLIQUER.md`.
