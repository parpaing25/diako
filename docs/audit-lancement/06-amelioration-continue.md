# 06 — Amélioration continue (Phase 4)

Ce qui existe le 05/09/2026 : `page_views` (path, ref, sid — 1 163 lignes), `journal_erreurs` (14 lignes, sans alerte), `reports` (table vide, aucun bouton), `docs/A-APPLIQUER.md` (journal de décisions), CI = typecheck + lint + test + build.

## 1. Mesurer — ce qu'il faut savoir chaque semaine

| Question | Mesure | Source | À construire |
|---|---|---|---|
| Combien de visiteurs, d'où | sessions (`sid`) par jour, `ref` (déjà en colonne, jamais rempli côté client : `document.referrer` à envoyer) | `page_views` | 0,5 h client |
| Ce qu'ils cherchent | requêtes saisies dans `/recherche` et dans l'agent, avec 0 résultat en tête | table `recherches (q, n_resultats, sid, created_at)` via RPC plafonnée | 1 h |
| Est-ce qu'ils contactent | clics « Demander », WhatsApp, appel, sur quelle fiche | table `evenements (type, cible, sid)` — 4 types au plus | 1 h |
| Est-ce que ça casse | erreurs par jour, par route, par navigateur | `journal_erreurs` + alerte (03-10 §3) | 1 h |
| Est-ce que c'est rapide | LCP/INP réels (web-vitals, 1 envoi par session, sans tiers) | table `vitals (lcp, inp, cls, route, reseau, sid)` | 1 h |
| Est-ce que les pros viennent | inscriptions pro, revendications, fiches complétées (`completeness`) | SQL sur `profiles`, `page_claims`, `pages` | requête hebdo |

Tout reste **sans cookie et sans tiers** (pas de bannière à ajouter) : `sid` est un identifiant de session en `sessionStorage`, jamais recoupé avec le compte.

Tableau de bord : une page `/admin/mesures` (réservée `is_admin()`) avec 6 chiffres et 3 courbes, ou — plus vite — une requête SQL enregistrée dans le tableau de bord Supabase, relue le lundi. Le rapport hebdomadaire peut suivre le modèle du skill `fonenako-rapport-hebdo`.

## 2. Écouter — le retour des utilisateurs

- **Bouton « Signaler »** sur chaque fiche et chaque récit (`reports` existe : `reporter_id`, motif) : « prix faux », « fermé », « pas à sa place », « autre ». File dans `/admin` ; réponse sous 48 h.
- **« Un prix a changé ? »** sur la fiche : un pro ou un voyageur propose un tarif daté ; le pro valide (règle « le prix ne voyage jamais seul »).
- **Boîte de contact** : `/aide#contact` (04) + `contact.diako@gmail.com` ; un canal WhatsApp Diako dès qu'il existe.
- **5 entretiens** de 20 minutes avec des voyageurs et 5 avec des gérants, dans le mois qui suit le lancement : ce qu'ils ont cherché, ce qu'ils n'ont pas trouvé.

## 3. Livrer — la boucle

| Cadence | Rituel |
|---|---|
| À chaque changement | `npm run typecheck && npm run lint && npm test` ; build ; **déploiement depuis `main` seulement** ; `python scripts/verifier_deploiement.py` ; 3 mesures `lcp-accueil.mjs` si le fil ou les images ont bougé |
| CI (03-10) | + `npm audit`, Playwright (7 scénarios lecture seule), axe, Lighthouse CI avec budget (LCP 2,5 s / 500 Ko / 35 requêtes) |
| Hebdomadaire (lundi) | rapport : visites, recherches sans résultat, contacts, erreurs, LCP p75, inscriptions pro ; 3 décisions au plus dans `docs/A-APPLIQUER.md` |
| Mensuel | advisors Supabase (sécurité + performance), `npm outdated`, revue des 138 policies (03-09 §4), sauvegarde testée (restauration sur un projet de test) |
| Trimestriel | re-passer cet audit (Phases 1 et 2 sont scriptées : `crawl.mjs`, `mesures.mjs`, `lcp-accueil.mjs`, `poids-accueil.mjs` — 40 minutes) |

## 4. Prioriser — la règle

Une seule file, dans `docs/A-APPLIQUER.md`, chaque entrée avec : **preuve** (chiffre + source), **impact** (qui, combien), **effort** (heures), **décision** (fait / à faire / refusé et pourquoi). Ce qui n'a pas de preuve chiffrée attend d'en avoir une. C'est déjà la pratique du dépôt ; l'audit ne fait que la nommer.

## 5. Premiers 30 jours après lancement — jalons

| Jour | Objectif mesurable | Si raté |
|---|---|---|
| J+1 | 0 erreur `reading 'default'` ; 0 429 vu par un moniteur réaliste ; e-mail de confirmation reçu en < 1 min | revenir sur 03-01 / 03-10 |
| J+7 | LCP p75 réel ≤ 2,5 s ; ≥ 20 comptes ; ≥ 5 récits écrits par des personnes hors équipe | 03-06 ; relance sur la page Fonenako |
| J+14 | ≥ 3 fiches revendiquées par leur gérant ; 0 soft-404 dans Search Console | appels directs à 10 hôtels d'Ampefy/Nosy Be |
| J+30 | ≥ 50 contacts (WhatsApp/Demander) tracés ; taux d'erreur < 0,5 % des sessions ; rapport hebdo tenu 4 fois | revoir le parcours P1 avec les entretiens |
