# État de Diako avant lancement

Mis à jour le 01/09/2026.

## 🔴 UNE MIGRATION EN ATTENTE — `0117_destinations_emblematiques.sql`

Écrite le 01/09/2026 avec la refonte de l'écran Destinations. **Le connecteur a
été refusé par le classificateur de la session** (écriture de production) : à
appliquer par l'éditeur SQL du tableau de bord — coller le fichier tel quel, il
porte ses trois assertions, dont le chronométrage sous `role anon` +
`statement_timeout 3s`.

Ce qu'elle apporte, et ce qui marche déjà sans elle :

- **Sans elle, l'écran marche.** `/explorer` se replie sur une lecture directe
  de `places` (mêmes 61 fiches, sans les compteurs par lieu) — le repli est
  écrit dans `src/lib/destinations.ts` et se désactive tout seul dès que la
  fonction existe.
- **Avec elle** : compteurs récits/adresses/saison sur les cartes, et surtout
  `stats_diako.destinations` passe de 508 (dont 430 villages, hameaux et
  quartiers) à 61 — le rail et l'écran cessent de se contredire.

Après application : connecteur → `generate_typescript_types`, puis
`npm run build` (règle du chantier types.ts ci-dessous).

## ✅ Les dix-huit migrations sont appliquées

`0096` → `0113`, chacune vérifiée par son assertion finale. Le connecteur
Supabase est rebranché ; la CLI reste inutilisable
(`permission denied to alter role cli_login_postgres`), donc **les migrations
passent par le connecteur, jamais par `supabase db push`**.

**Quatre ont refusé de passer, et avaient raison.** C'est le meilleur argument
pour cette discipline d'assertions :

- **0098** — `authenticated` gardait `insert` et `update` sur
  `photo_propositions` par privilèges par défaut. Un membre connecté aurait pu
  insérer une photo **déjà marquée « approuvée »** sur n'importe quelle fiche du
  référentiel, sans passer par la modération, en une seule requête.
- **0103** — écrite pour un symptôme minuscule (« la photo du compte ne change
  pas »), elle a mis au jour que **le profil ne se chargeait plus du tout pour
  aucun membre connecté** : une colonne sans droit de lecture faisait refuser la
  requête entière.
- **0106** — `unaccent` n'est pas dans `public` sur Supabase mais dans
  `extensions` ; sans le `search_path` élargi, la recherche par nom n'aurait
  jamais démarré.
- **0113** — la sonde d'écriture a échoué et avait raison de le faire :
  `pages_avant_ecriture()` **gèle** `is_published` pour toute écriture directe.
  La sonde ne mesurait pas ce qu'elle croyait.

## Trois gestes qui ne passent pas par une migration

1. **Le tableau de bord Supabase** — les cinq gabarits d'e-mail en français, la
   protection contre les mots de passe divulgués, la mise à jour de Postgres.

2. **Le récit de test en tête du fil.** Il porte une photo de **Bora Bora**
   (Polynésie française) sous l'étiquette « Nosy Be », avec le texte « Bora Bora,
   l'île paradisiaque par excellence », publié le 17/08. C'est le seul contenu
   hors sujet du fil — vérifié, les 28 autres récits sont bien malgaches. Sur un
   site dont la promesse est « Madagascar raconté par ceux qui y vont », c'est la
   première chose que voit un visiteur. À retirer depuis `/admin` →
   Publications. C'est ton contenu, donc ta décision.

3. **Le limiteur d'o2switch.** Tiger Protect répond **429 sur la totalité des
   assets** après une rafale depuis une seule adresse IP — page entièrement
   blanche, sans message. Sur les réseaux mobiles malgaches, des milliers
   d'abonnés partagent une poignée d'adresses publiques : vu du limiteur, un
   lancement réussi ressemble à une attaque. À relever depuis cPanel **avant**
   d'annoncer le site.

## La liste de lancement

| Item | État |
|---|---|
| 1. La carte ne sort pas | ✅ morceau différé + cache empoisonné, avec rattrapage |
| 2. Photos du fil lentes | ✅ 147 régénérées + `srcset` réel |
| 3. Recherche hors du rail | ✅ |
| 4. Paramètres hors du rail | ✅ |
| 5. Destinations empilées | ✅ cinq bandes repliées, 1 image au lieu de 23 |
| 6. Photos des plats | ✅ 33 sur 95 — les 62 autres gardent une case vide, faute de photo sûre |
| 7. Espace pro | ✅ suggestions à la frappe (anti-doublon) + aperçu public |
| 8. Circuits modernisés | ✅ traité autrement : il n'y a **aucun circuit ni agence** en base, et la pastille « Circuits » de l'accueil promettait le contraire — elle a été retirée, avec Agences, Guides et Bons plans |
| 9. Photos cliquables + propositions | ✅ visionneuse plein écran + bouton sur destinations et plats |
| 10. Page admin | ✅ `/admin`, entrée visible pour l'administrateur seul |
| 11. Événements | ✅ 14 affiches, cartes dépliables, lieu cliquable — et les 28 sans photo disent pourquoi |
| 12. Y aller — planificateur | ✅ 1 642 paires sur 1 806 |

**Un ajout qui débloquerait 82 paires du planificateur** : une ligne dans
`place_access` pour Antananarivo → Ankify.

## Ce que le site sait, en chiffres vérifiés

508 destinations · 2 451 sites et parcs · 95 plats (254 orthographes) ·
3 254 établissements · 42 événements dont 18 rattachés à une destination ·
42 tronçons de route relevés.

## Trois scripts de contrôle, à lancer avant d'annoncer

```
python scripts/verifier_contrat_client_base.py   # le client demande-t-il ce qui existe ?
bash ~/.deploy-sites/redeploy.sh diako
python scripts/verifier_deploiement.py           # le déploiement a-t-il vraiment abouti ?
```

Le premier a trouvé un compteur qui affichait 0 au lieu de 254. Le second existe
parce que `redeploy.sh` a déjà annoncé « terminé » après un envoi FTP expiré, en
laissant la production sur le build précédent — invisible, puisque le site
continuait de fonctionner avec l'ancien.

## ✅ Le chantier reporté est fait

`src/integrations/supabase/types.ts` est désormais **généré** par le connecteur.
Les 35 erreurs de compilation qu'entraînait la régénération sont corrigées : le
générateur déclare les arguments à défaut optionnels et non nullables, là où le
code passait `null` explicitement. Corrigé en omettant l'argument — après avoir
vérifié, un par un, que les **53** arguments concernés ont bien `DEFAULT NULL` en
base. Aucun comportement ne change.

La redéclaration locale du schéma dans `src/lib/admin.ts` a disparu avec, comme
son auteur l'avait annoncé. Il ne reste **qu'un** resserrement de type dans tout
le code, et il est documenté : `photo_propositions.cible_type` est contraint à
quatre valeurs par un `check` que le générateur ne peut pas lire.

**À refaire après toute migration** qui touche une table, une vue ou une
fonction : connecteur → `generate_typescript_types`, puis `npm run build`.

## Deux constats qui ne sont pas des bugs

- **« Où manger du ravitoto »** — que le code décrit comme la promesse centrale
  du produit — ne peut rien rendre aujourd'hui : il n'y a que **4 plats sur des
  cartes de restaurant**, et aucun n'est rattaché au référentiel des plats.
- **Aucune agence, aucun circuit, aucun guide** n'est publié. Les pastilles qui
  les annonçaient ont été retirées de l'accueil.
