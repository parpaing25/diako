# État de Diako avant lancement

Mis à jour le 18/08/2026.

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
| 8. Circuits modernisés | ⚠️ **0 circuit en base** : l'écran d'attente est correct, il n'y a rien à moderniser tant qu'aucune agence n'en publie |
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

## Un chantier à part, à ne pas faire la veille d'un lancement

`src/integrations/supabase/types.ts` est écrit **à la main**. La régénération par
le connecteur fonctionne, mais elle change `null` en `undefined` sur une
vingtaine de types du produit. Les relations de `posts` et la fonction 0106 y ont
donc été ajoutées à la main, vérifiées dans `pg_constraint`. À reprendre à froid.
