# Ce qu'il reste à faire avant le lancement

Mis à jour le 17/08/2026, après application des migrations.

## ✅ Les huit migrations sont appliquées

`0096` → `0103`, dans l'ordre, chacune vérifiée par son assertion finale. Le
connecteur Supabase a été rebranché ; la CLI reste inutilisable
(`permission denied to alter role cli_login_postgres`), donc **les migrations
passent par le connecteur, jamais par `supabase db push`**.

Deux d'entre elles ont refusé de passer, et avaient raison :

- **0098** — `authenticated` gardait `insert` et `update` sur
  `photo_propositions` par privilèges par défaut. Un membre connecté aurait pu
  insérer une photo déjà marquée « approuvée » sur n'importe quelle fiche du
  référentiel, **sans passer par la modération, en une seule requête**. La
  révocation ne nommait que `public` et `anon` — la leçon de 0083, resservie.
- **0103** — écrite en réponse à un symptôme minuscule (« la photo du compte ne
  change pas »), elle a mis au jour que **le profil ne se chargeait plus du tout
  pour aucun membre connecté** : la colonne `metier_pro` n'avait aucun droit de
  lecture, et `profiles` étant en grants par colonne, PostgreSQL refusait la
  requête entière — les quatorze autres colonnes avec elle.

## Trois gestes à faire à la main

1. **Le tableau de bord Supabase** — les cinq gabarits d'e-mail en français, la
   protection contre les mots de passe divulgués, la mise à jour de Postgres.
   Rien de tout cela ne passe par une migration.

2. **Regarder le premier récit du fil.** Il porte une photo de **Bora Bora**
   (Polynésie française) sous l'étiquette « Nosy Be », avec le texte « Bora
   Bora, l'île paradisiaque par excellence ». C'est une publication de test
   restée en ligne. Sur un site dont toute la promesse est « Madagascar raconté
   par ceux qui y vont », c'est la première chose que voit un visiteur. À
   retirer depuis `/admin` → Publications.

3. **Le limiteur d'o2switch.** Pendant les tests, Tiger Protect a répondu
   **429 sur la totalité des assets** — JS, CSS, manifeste — après une simple
   rafale depuis une seule adresse IP. La page devient alors entièrement
   blanche, sans message. Sur les réseaux mobiles malgaches, des milliers
   d'abonnés partagent une poignée d'adresses publiques : vu du limiteur, un
   lancement réussi ressemble beaucoup à une attaque. À relever ou désactiver
   depuis cPanel **avant** d'annoncer le site.

## Ce qui reste ouvert dans la liste de lancement

| Item | État |
|---|---|
| 1. La carte ne sort pas | ✅ cause trouvée et corrigée (morceau différé + cache empoisonné) |
| 2. Photos du fil lentes | ✅ 147 photos régénérées + `srcset` réel |
| 3. Recherche hors du rail | ✅ |
| 4. Paramètres hors du rail | ✅ |
| 5. Destinations empilées | ✅ cinq bandes repliées, 1 image chargée au lieu de 23 |
| 6. Photos des plats | ✅ 33 posées sur 95 — les 62 autres gardent une case vide, faute de photo sûre |
| 7. Espace pro plus attractif | ❌ **non fait** |
| 8. Circuits modernisés | ❌ **non fait** (0 circuit en base aujourd'hui) |
| 9. Photos cliquables + propositions | ⚠️ le serveur et la modération sont faits ; **le bouton « Proposer une photo » manque encore sur les fiches publiques**, et la visionneuse plein écran n'existe pas |
| 10. Page admin | ✅ `/admin`, entrée visible dans le menu du compte pour l'administrateur seul |
| 11. Événements avec miniatures | ⚠️ les fausses dates sont corrigées ; **0 affiche sur 42 événements** |
| 12. Y aller — planificateur | ✅ 1 642 paires sur 1 806 ; les 164 refusées passent toutes par Ankify ou Nosy Be |

**Un ajout qui débloquerait 82 paires du planificateur** : une seule ligne dans
`place_access` pour Antananarivo → Ankify. Le relevé donne Ankify → Nosy Be,
mais pas la route pour arriver à Ankify.

## Un chantier à part, à ne pas faire la veille d'un lancement

`src/integrations/supabase/types.ts` est écrit **à la main**. La régénération par
le connecteur fonctionne, mais elle change `null` en `undefined` sur une
vingtaine de types du produit : une vingtaine d'erreurs de compilation à
reprendre une par une. Les trois relations de `posts` ont donc été ajoutées à la
main, vérifiées dans `pg_constraint`. À reprendre à froid.
